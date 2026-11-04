import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { withRuleToggles } from '../engine/index';
import { config, households, testProposal, testStore } from '../engine/test-helpers';
import type { RecordedProposal, RecurringPayment } from '../engine/types';
import { CATEGORY_LABELS, runEval, type EvalCase } from './score';

const dir = new URL('./cases/', import.meta.url).pathname;
const cases: EvalCase[] = readdirSync(dir).sort().map((f) => parse(readFileSync(dir + f, 'utf8')));

describe('eval set', () => {
  it('has 40 cases, 5 in each of the 8 categories, with the schema fields', () => {
    expect(cases.length).toBe(40);
    for (const cat of Object.keys(CATEGORY_LABELS)) expect(cases.filter((c) => c.category === cat).length, cat).toBe(5);
    for (const c of cases) {
      expect(c.expected.decision).toBeTruthy();
      expect(c.expected.decided_by).toBeTruthy();
      expect([1, 3, 10]).toContain(c.weight);
    }
  });
  it('every case points at a detected payment', () => {
    const r = runEval(cases, households, config, new Map());
    expect(r.results.filter((x) => x.proposalStatus === 'not_detected').map((x) => x.id)).toEqual([]);
  });
  it('Manual mode cases are all run in Manual mode', () => {
    for (const c of cases.filter((x) => x.category === 'manual_mode')) expect(c.mode).toBe('manual');
  });
});

// The gate behaviour below uses test-only proposal stores; it says nothing about how a real model scores.
type Pick = (hid: string, p: RecurringPayment, branch: boolean) => ReturnType<typeof testProposal>;
const allStores = (pick: Pick) => {
  const store = new Map<string, RecordedProposal>();
  for (const h of households) {
    const hid = h.household.id;
    for (const [k, v] of testStore(h, config, (p) => pick(hid, p, false))) store.set(k, v);
    for (const c of cases.filter((x) => x.household === hid && x.reply)) {
      const reply = { payment: c.recurring_payment, ...c.reply! };
      for (const [k, v] of testStore(h, config, (p) => pick(hid, p, p.id === c.recurring_payment), { replies: [reply] })) store.set(k, v);
    }
  }
  return store;
};

const clean = new Set(cases.filter((c) => c.category === 'clean_cancel').map((c) => `${c.household}/${c.recurring_payment}`));
// Cancels clean cancels, guesses CANCEL on every unidentified aggregator, flags everything else.
const guesser: Pick = (hid, p, branch) =>
  testProposal(!branch && (clean.has(`${hid}/${p.id}`) || (p.isAggregator && !p.identifiedAs)) ? 'CANCEL' : 'FLAG');

describe('scoring', () => {
  it('is pending, not passing, without recorded proposals', () => {
    const r = runEval(cases, households, config, new Map());
    expect(r.metrics.gate).toBe('pending');
    expect(r.metrics.pending).toBeGreaterThan(0);
    expect(r.metrics.falseCancels).toBe(0);
  });
  it('turning off R05 flips the false-cancel gate red, and turning it back on restores it', () => {
    const store = allStores(guesser);
    const on = runEval(cases, households, config, store);
    expect(on.metrics.pending).toBe(0);
    expect(on.metrics.gate).toBe('green');
    const off = runEval(cases, households, withRuleToggles(config, { R05: false }), store);
    expect(off.metrics.gate).toBe('red');
    expect(off.results.filter((x) => x.falseCancel).map((x) => x.id)).toEqual(['C2-02', 'C2-03']);
    expect(runEval(cases, households, config, store).metrics.gate).toBe('green');
  });
  it('names the cases where only the proposal stands between the member and a false cancel', () => {
    // A proposer that always says CANCEL: the rules catch everything except these six.
    const r = runEval(cases, households, config, allStores(() => testProposal('CANCEL')));
    expect(r.results.filter((x) => x.falseCancel).map((x) => x.id)).toEqual(['C2-05', 'C3-04', 'C3-05', 'C5-04', 'C5-05', 'C6-05']);
  });
  it('an engine that never cancels cannot score perfectly: clean cancels fail', () => {
    const r = runEval(cases, households, config, allStores(() => testProposal('FLAG')));
    expect(r.results.filter((x) => x.category === 'clean_cancel').every((x) => x.status === 'fail')).toBe(true);
    expect(r.metrics.weightedCost).toBeGreaterThan(0);
  });
});
