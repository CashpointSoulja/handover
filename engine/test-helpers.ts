// Test-only helpers. Proposals built here are inputs to unit tests of the gate; they are never
// written to fixtures/proposals, which holds only proposals recorded from a real model run.
import { runHousehold, type RunOptions } from './index';
import { loadConfig, loadHouseholds } from './load-node';
import { proposalKey } from './proposal';
import type { Config, Decision, HouseholdData, Proposal, RecordedProposal, RecurringPayment } from './types';

export const config = loadConfig();
export const households = loadHouseholds();
export const hh = (id: string): HouseholdData => households.find((h) => h.household.id === id)!;

export function testProposal(action: Decision, confidence = 0.95): Proposal {
  return { service: 'test', category: 'test', isSubscription: true, proposedAction: action, confidence, rationale: 'test input' };
}

/** A proposal store whose hashes match the current inputs, so the gate treats them as recorded. */
export function testStore(
  data: HouseholdData,
  cfg: Config,
  pick: (p: RecurringPayment) => Proposal,
  opts: RunOptions = {},
): Map<string, RecordedProposal> {
  const store = new Map<string, RecordedProposal>();
  for (const r of runHousehold(data, cfg, store, opts)) {
    store.set(proposalKey(data.household.id, r.payment.id, r.branch), {
      meta: { model: 'test', run_at: 'test', prompt_version: 'test', input_hash: r.proposalInputHash, household: data.household.id, payment: r.payment.id, branch: r.branch },
      proposal: pick(r.payment),
    });
  }
  return store;
}

export function decideWith(hid: string, paymentId: string, action: Decision, confidence = 0.95, opts: RunOptions = {}, cfg = config) {
  const data = hh(hid);
  const store = testStore(data, cfg, () => testProposal(action, confidence), opts);
  return runHousehold(data, cfg, store, opts).find((r) => r.payment.id === paymentId)!;
}
