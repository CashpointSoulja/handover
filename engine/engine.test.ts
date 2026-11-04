import { describe, expect, it } from 'vitest';
import { gate } from './decide';
import { classifyCadence, clusterByAmount, detectRecurring, signalsFrom } from './detect';
import { RULE_IDS, runHousehold, withRuleToggles } from './index';
import { normalise } from './normalise';
import { hashInput, parseProposal, proposalInput } from './proposal';
import { config, decideWith, hh, households, testProposal, testStore } from './test-helpers';
import type { Transaction } from './types';

const tx = (date: string, amount: number): Transaction => ({
  id: date,
  bookingDate: date,
  amount: -amount,
  currency: 'GBP',
  descriptor: 'X',
  counterparty: 'X',
  paymentType: 'card',
  accountId: 'cur',
});

describe('normalise', () => {
  it('maps raw descriptors to service keys', () => {
    expect(normalise('AMZNPrime*2K4L9X0Q4', config).serviceKey).toBe('amazon_prime');
    expect(normalise('CARD PAYMENT TO NETFLIX.COM', config).serviceKey).toBe('netflix');
    expect(normalise('GOOGLE *YouTube', config).serviceKey).toBe('youtube_premium');
    expect(normalise('DD SKY DIGITAL', config).serviceKey).toBe('sky');
  });
  it('keeps aggregators as aggregators, with the raw string in the id', () => {
    const a = normalise('APPLE.COM/BILL', config);
    expect(a.isAggregator).toBe(true);
    expect(a.idBase).toBe('apple_bill');
    expect(normalise('PAYPAL *JGSOFTWARE', config).idBase).toBe('paypal_jgsoftware');
    expect(normalise('GOOGLE *PLAY APPS', config).idBase).toBe('google_play_apps');
  });
});

describe('recurrence detection', () => {
  it('classifies cadence within ±3 days', () => {
    expect(classifyCadence(['2026-05-01', '2026-06-03', '2026-07-01'])).toBe('monthly');
    expect(classifyCadence(['2026-05-04', '2026-05-11', '2026-05-18'])).toBe('weekly');
    expect(classifyCadence(['2025-10-28', '2026-10-28'])).toBe('annual');
    expect(classifyCadence(['2026-05-01', '2026-05-20'])).toBeNull();
  });
  it('splits by amount beyond ±15%, and keeps a gradual rise together', () => {
    expect(clusterByAmount([tx('2026-05-03', 2.99), tx('2026-05-17', 9.99), tx('2026-06-03', 2.99)]).length).toBe(2);
    expect(clusterByAmount([tx('2026-05-19', 9.99), tx('2026-06-19', 10.99)]).length).toBe(1);
  });
  it('finds 8 to 15 recurring payments per household', () => {
    for (const h of households) {
      const n = runHousehold(h, config, new Map()).length;
      expect(n, h.household.id).toBeGreaterThanOrEqual(8);
      expect(n, h.household.id).toBeLessThanOrEqual(15);
    }
  });
  it('splits two APPLE.COM/BILL streams into apple_bill_299 and apple_bill_999', () => {
    const ids = runHousehold(hh('H1'), config, new Map()).map((r) => r.payment.id);
    expect(ids).toEqual(expect.arrayContaining(['apple_bill_299', 'apple_bill_999']));
  });
  it('ignores groceries, fuel and one-off orders', () => {
    for (const h of households) {
      const keys = runHousehold(h, config, new Map()).map((r) => r.payment.serviceKey);
      expect(keys.some((k) => ['groceries', 'fuel', 'amazon_orders', 'takeaway', 'salary'].includes(k))).toBe(false);
    }
  });
  it('every chat signal points at a detected payment', () => {
    for (const h of households) {
      const ids = new Set(runHousehold(h, config, new Map()).map((r) => r.payment.id));
      for (const m of h.chat) for (const s of m.signals ?? []) expect(ids.has(s.payment), `${h.household.id} ${s.payment}`).toBe(true);
    }
  });
});

describe('gate', () => {
  it('is deterministic', () => {
    const a = JSON.stringify(runHousehold(hh('H4'), config, new Map()));
    const b = JSON.stringify(runHousehold(hh('H4'), config, new Map()));
    expect(a).toBe(b);
  });
  it('passes the proposal through when no cap binds, and records decidedBy llm', () => {
    const r = decideWith('H1', 'readly', 'CANCEL');
    expect(r.decision).toBe('CANCEL');
    expect(r.decidedBy).toBe('llm');
  });
  it('never raises a proposal: an ASK proposal under a FLAG cap stays ASK', () => {
    const r = decideWith('H1', 'youtube_premium', 'ASK');
    expect(r.decision).toBe('ASK');
    expect(r.decidedBy).toBe('llm');
  });
  it('lowers to the strictest cap and names the first rule that set it', () => {
    const r = decideWith('H1', 'sky', 'CANCEL');
    expect(r.ceiling).toBe('ASK');
    expect(r.decidedBy).toBe('R08');
    expect(r.attachments.map((a) => a.kind)).toEqual(expect.arrayContaining(['cancel_via', 'cancel_method']));
  });
  it('a terminal rule stops evaluation', () => {
    const r = decideWith('H5', 'disney_plus', 'CANCEL');
    expect(r.decidedBy).toBe('R01');
    expect(r.notReached.length).toBe(13);
  });
  it('is pending without a recorded proposal unless a terminal rule decided', () => {
    const r = runHousehold(hh('H1'), config, new Map()).find((x) => x.payment.id === 'apple_bill_999')!;
    expect(r.decision).toBeNull();
    expect(r.proposalStatus).toBe('missing');
    expect(r.ceiling).toBe('ASK');
  });
  it('treats a proposal recorded against different input as stale, not usable', () => {
    const data = hh('H1');
    const store = testStore(data, config, () => testProposal('CANCEL'));
    const changed = { ...data, chat: data.chat.slice(0, 2) };
    const r = runHousehold(changed, config, store).find((x) => x.payment.id === 'readly')!;
    expect(r.proposalStatus).toBe('stale');
    expect(r.decision).toBeNull();
  });
  it('turning off R05 lets a CANCEL proposal through on the unidentified Apple charge', () => {
    const off = withRuleToggles(config, { R05: false });
    expect(decideWith('H1', 'apple_bill_999', 'CANCEL', 0.95, {}, off).decision).toBe('CANCEL');
    expect(decideWith('H1', 'apple_bill_999', 'CANCEL', 0.95, {}, config).decision).toBe('ASK');
  });
});

describe('Manual mode', () => {
  it('no household in Manual mode receives CANCEL under any rule toggle combination', () => {
    // Toggles only change the gate, so detect once per household and run the gate for all
    // 2^13 combinations of the toggleable rules, with a CANCEL proposal at full confidence.
    const toggleable = config.rules.filter((r) => !r.locked).map((r) => r.id);
    let checked = 0;
    for (const h of households) {
      const signals = signalsFrom(h.chat);
      const payments = detectRecurring(h, config, signals);
      for (let mask = 0; mask < 1 << toggleable.length; mask++) {
        const cfg = withRuleToggles(config, Object.fromEntries(toggleable.map((id, i) => [id, !!(mask & (1 << i))])));
        for (const payment of payments) {
          const g = gate({ data: h, payment, payments, mode: 'manual', signals, proposal: testProposal('CANCEL', 1), config: cfg, asOf: h.household.asOf });
          if (g.decision === 'CANCEL') throw new Error(`CANCEL in Manual mode: ${h.household.id}/${payment.id}, mask ${mask}`);
          checked++;
        }
      }
      // End to end, with every toggleable rule off.
      const allOff = withRuleToggles(config, Object.fromEntries(toggleable.map((id) => [id, false])));
      const store = testStore(h, config, () => testProposal('CANCEL', 1));
      for (const r of runHousehold(h, allOff, store, { mode: 'manual' })) expect(r.decision).not.toBe('CANCEL');
    }
    expect(checked).toBeGreaterThan(8192 * 50);
  });
  it('R04 is locked on', () => {
    const cfg = withRuleToggles(config, { R04: false });
    expect(cfg.rules.find((r) => r.id === 'R04')!.enabled).toBe(true);
  });
});

describe('proposals', () => {
  it('hash ignores mode but changes with the chat', () => {
    const data = hh('H1');
    const r = runHousehold(data, config, new Map()).find((x) => x.payment.id === 'readly')!;
    const base = hashInput(proposalInput(data, r.payment, data.chat));
    expect(runHousehold(data, config, new Map(), { mode: 'manual' }).find((x) => x.payment.id === 'readly')!.proposalInputHash).toBe(base);
    expect(hashInput(proposalInput(data, r.payment, data.chat.slice(1)))).not.toBe(base);
  });
  it('parses a valid model reply and rejects a bad one', () => {
    const p = parseProposal('{"service":"Readly","category":"magazines","isSubscription":true,"proposedAction":"CANCEL","confidence":0.9,"rationale":"Unused."}');
    expect(p.proposedAction).toBe('CANCEL');
    expect(() => parseProposal('{"proposedAction":"DELETE"}')).toThrow();
  });
});

describe('messages', () => {
  it('asks about the unidentified Apple charge with price-matched reply buttons', () => {
    const r = decideWith('H1', 'apple_bill_999', 'CANCEL');
    expect(r.message!.text).toBe("Hi Ngozi, there's a £9.99 APPLE.COM/BILL charge every month. Do you know which app it's for?");
    expect(r.message!.buttons.map((b) => b.label)).toEqual(["It's Disney+", "It's Headspace"]);
    expect(r.message!.buttons[0].branch).toBe('identified-disney_plus');
  });
  it('sends nothing for LEAVE', () => {
    expect(runHousehold(hh('H3'), config, new Map()).find((x) => x.payment.id === 'council_tax')!.message).toBeNull();
  });
  it('holds and escalates a post-cancel charge', () => {
    const r = runHousehold(hh('H5'), config, new Map()).find((x) => x.payment.id === 'disney_plus')!;
    expect(r.message!.text).toContain('charged you £8.99 on 14 Oct, after you cancelled on 14 Sep');
  });
  it('keeps every reply button within 20 characters and 3 per message', () => {
    for (const h of households) {
      for (const r of runHousehold(h, config, testStore(h, config, () => testProposal('ASK')))) {
        expect(r.message?.buttons.length ?? 0).toBeLessThanOrEqual(3);
        for (const b of r.message?.buttons ?? []) expect(b.label.length).toBeLessThanOrEqual(20);
      }
    }
  });
});

it('config lists all 14 rules in order, each with a protects line', () => {
  expect(config.rules.map((r) => r.id)).toEqual([...RULE_IDS]);
  for (const r of config.rules) expect(r.protects.length).toBeGreaterThan(10);
});
