import { describe, expect, it } from 'vitest';
import { runHousehold } from './index';
import { config, decideWith, hh } from './test-helpers';
import type { DecisionResult } from './types';

const run = (hid: string, opts = {}) => runHousehold(hh(hid), config, new Map(), opts);
const pay = (hid: string, id: string, opts = {}): DecisionResult => {
  const r = run(hid, opts).find((x) => x.payment.id === id);
  if (!r) throw new Error(`${hid}/${id} not detected`);
  return r;
};
const fired = (r: DecisionResult) => r.fired.map((f) => f.id);

describe('R01 charge after cancellation', () => {
  it('fires on a Disney+ charge after the cancel date, with refund_request and priority urgent', () => {
    const r = pay('H5', 'disney_plus');
    expect(r.decision).toBe('HUMAN');
    expect(r.decidedBy).toBe('R01');
    expect(r.attachments.map((a) => a.kind)).toEqual(expect.arrayContaining(['refund_request', 'priority_urgent']));
  });
  it('fires in Manual mode too', () => {
    expect(pay('H3', 'now_tv', { mode: 'manual' }).decidedBy).toBe('R01');
  });
  it('does not fire when the post-cancel charge was already refunded', () => {
    expect(fired(pay('H6', 'paramount_plus'))).not.toContain('R01');
  });
  it('does not fire on a legitimate final pro-rata bill', () => {
    expect(fired(pay('H5', 'britbox'))).not.toContain('R01');
  });
});

describe('R02 not a subscription', () => {
  it('fires on Klarna instalments, council tax and energy', () => {
    for (const id of ['klarna_currys', 'klarna_asos', 'council_tax', 'energy']) {
      const r = pay('H3', id);
      expect(r.decision, id).toBe('LEAVE');
      expect(r.decidedBy, id).toBe('R02');
      expect(r.attachments.find((a) => a.kind === 'route')).toBeTruthy();
    }
  });
  it('does not fire on a streaming subscription', () => {
    expect(fired(pay('H3', 'spotify'))).not.toContain('R02');
  });
});

describe('R03 member said keep', () => {
  it('fires when keep is within 90 days and the price has not risen', () => {
    const r = pay('H5', 'audible');
    expect(r.decision).toBe('LEAVE');
    expect(r.decidedBy).toBe('R03');
  });
  it('does not fire when the price rose after the keep', () => {
    expect(fired(pay('H4', 'the_times'))).not.toContain('R03');
    expect(fired(pay('H2', 'disney_plus'))).not.toContain('R03');
  });
});

describe('R04 Manual mode', () => {
  it('caps at FLAG in Manual mode', () => {
    const r = decideWith('H6', 'paramount_plus', 'CANCEL');
    expect(r.decision).toBe('FLAG');
    expect(r.decidedBy).toBe('R04');
  });
  it('does not fire in Auto mode', () => {
    expect(fired(pay('H1', 'readly'))).not.toContain('R04');
  });
});

describe('R05 unidentified aggregator', () => {
  it('caps the unidentified £9.99 Apple charge at ASK', () => {
    const r = decideWith('H1', 'apple_bill_999', 'CANCEL');
    expect(r.decision).toBe('ASK');
    expect(r.decidedBy).toBe('R05');
  });
  it('does not fire once the member has identified the charge', () => {
    expect(fired(pay('H1', 'apple_bill_299'))).not.toContain('R05');
    const reply = { payment: 'apple_bill_999', label: "It's Disney+", signal: { kind: 'identified' as const, service: 'disney_plus' } };
    expect(fired(pay('H1', 'apple_bill_999', { replies: [reply] }))).not.toContain('R05');
  });
});

describe('R06 low confidence', () => {
  it('caps at ASK below 0.80', () => {
    const r = decideWith('H1', 'readly', 'CANCEL', 0.79);
    expect(r.decision).toBe('ASK');
    expect(r.decidedBy).toBe('R06');
  });
  it('does not fire at 0.80 or above', () => {
    const r = decideWith('H1', 'readly', 'CANCEL', 0.8);
    expect(fired(r)).not.toContain('R06');
    expect(r.decision).toBe('CANCEL');
  });
  it('waits when there is no recorded proposal', () => {
    expect(pay('H1', 'readly').waiting).toContain('R06');
  });
});

describe('R07 shared plan', () => {
  it('fires on a family-tier price', () => {
    expect(decideWith('H4', 'spotify', 'CANCEL').decidedBy).toBe('R07');
  });
  it('fires when the member said it is shared', () => {
    const r = pay('H6', 'netflix');
    expect(fired(r)).toContain('R07');
    expect(r.fired.find((f) => f.id === 'R07')!.evidence.messages).toEqual(['m5']);
  });
  it('does not fire on an individual plan, or after the member says "just me"', () => {
    expect(fired(pay('H1', 'spotify'))).not.toContain('R07');
    const reply = { payment: 'spotify', label: 'Just me now', signal: { kind: 'not_shared' as const } };
    expect(fired(pay('H4', 'spotify', { replies: [reply] }))).not.toContain('R07');
  });
});

describe('R08 bundled service', () => {
  it('fires on the Sky bundle parent and on Netflix inside it, with cancel_via', () => {
    for (const id of ['sky', 'netflix']) {
      const r = decideWith('H1', id, 'CANCEL');
      expect(r.decision, id).toBe('ASK');
      expect(r.decidedBy, id).toBe('R08');
      expect(r.attachments.find((a) => a.kind === 'cancel_via')?.value).toBe('sky');
    }
  });
  it('does not fire on a service outside any bundle', () => {
    expect(fired(pay('H6', 'netflix'))).not.toContain('R08');
  });
});

describe('R09 minimum term', () => {
  it('caps a minimum-term gym at FLAG with cancel_method provider_notice', () => {
    const r = decideWith('H3', 'david_lloyd', 'CANCEL');
    expect(r.decision).toBe('FLAG');
    expect(r.decidedBy).toBe('R09');
    expect(r.attachments.find((a) => a.kind === 'cancel_method')?.value).toBe('provider_notice');
  });
  it('does not fire on a no-contract gym', () => {
    expect(fired(pay('H2', 'puregym'))).not.toContain('R09');
  });
});

describe('R10 high annual cost', () => {
  it('fires at £150 a year or more', () => {
    expect(decideWith('H1', 'youtube_premium', 'CANCEL').decidedBy).toBe('R10');
  });
  it('does not fire below £150 a year', () => {
    expect(fired(pay('H1', 'readly'))).not.toContain('R10');
  });
});

describe('R11 billed twice', () => {
  it('fires on Microsoft 365 billed on two cards', () => {
    const r = decideWith('H4', 'microsoft_365_cc', 'CANCEL');
    expect(r.decidedBy).toBe('R11');
    expect(r.attachments.find((a) => a.kind === 'duplicate_of')?.value).toBe('microsoft_365_cur');
  });
  it('does not fire on a single stream', () => {
    expect(fired(pay('H4', 'deliveroo_plus'))).not.toContain('R11');
  });
});

describe('R12 trial converting soon', () => {
  it('fires on a trial converting in 4 days, with priority urgent and a deadline', () => {
    const r = decideWith('H4', 'paramount_plus', 'CANCEL');
    expect(r.decision).toBe('FLAG');
    expect(r.decidedBy).toBe('R12');
    expect(r.attachments.map((a) => a.kind)).toEqual(expect.arrayContaining(['priority_urgent', 'deadline']));
  });
  it('does not fire on a trial converting in 12 days or one already converted', () => {
    expect(fired(pay('H3', 'duolingo'))).not.toContain('R12');
    expect(fired(pay('H5', 'strava'))).not.toContain('R12');
  });
});

describe('R13 refund window', () => {
  it('attaches refund_request inside the window, and caps at FLAG when the policy is assumed', () => {
    const r = decideWith('H2', 'amazon_prime', 'CANCEL', 0.95, { mode: 'auto' });
    expect(r.decision).toBe('FLAG');
    expect(r.decidedBy).toBe('R13');
    expect(r.attachments.map((a) => a.kind)).toEqual(expect.arrayContaining(['refund_request', 'deadline']));
    expect(r.fired.find((f) => f.id === 'R13')!.policyStatus).toBe('assumed');
  });
  it('only attaches, without a cap, when the policy is verified', () => {
    const r = decideWith('H2', 'amazon_prime', 'CANCEL', 0.95, { mode: 'auto', policyStatus: 'verified' });
    expect(r.decision).toBe('CANCEL');
    expect(r.attachments.map((a) => a.kind)).toContain('refund_request');
  });
  it('does not fire outside the window', () => {
    expect(fired(pay('H3', 'amazon_prime'))).not.toContain('R13');
  });
});

describe('R14 price rise', () => {
  it('attaches price_rise when the latest charge is 10% over the trailing 3', () => {
    const r = pay('H2', 'disney_plus');
    expect(r.attachments.find((a) => a.kind === 'price_rise')?.value).toBe('£9.99 → £10.99');
  });
  it('does not fire on a flat price', () => {
    expect(fired(pay('H1', 'spotify'))).not.toContain('R14');
  });
  it('never changes the decision', () => {
    expect(decideWith('H4', 'the_times', 'FLAG').decision).toBe('FLAG');
  });
});

it('every rule except R06 fires in at least two households on the sample data', () => {
  const seen = new Map<string, Set<string>>();
  for (const id of ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']) {
    for (const r of run(id)) for (const f of r.fired) seen.set(f.id, (seen.get(f.id) ?? new Set()).add(id));
  }
  for (const rule of config.rules.map((r) => r.id).filter((x) => x !== 'R06')) {
    expect(seen.get(rule)?.size ?? 0, rule).toBeGreaterThanOrEqual(2);
  }
});
