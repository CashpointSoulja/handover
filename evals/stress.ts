// Synthetic stress test: NOT model results.
// Two synthetic proposers, built here in code and never written to fixtures/proposals, are run over
// the same eval cases with each rule switched off in turn, to show which rules hold the line when
// the proposal is wrong.
import { detectRecurring, signalsFrom, withRuleToggles, type ProposalStore } from '../engine/index';
import type { Config, HouseholdData, Proposal, RecordedProposal, RecurringPayment } from '../engine/types';
import { requiredProposals } from './required';
import { runEval, type EvalCase } from './score';

export interface SyntheticProposer {
  id: string;
  label: string;
  describe: string;
  pick: (p: RecurringPayment) => Proposal;
}

const synthetic = (proposedAction: Proposal['proposedAction'], confidence: number): Proposal => ({
  service: 'synthetic',
  category: 'synthetic',
  isSubscription: proposedAction !== 'LEAVE',
  proposedAction,
  confidence,
  rationale: 'Synthetic stress-test proposal; not a model output.',
});

export const PROPOSERS: SyntheticProposer[] = [
  {
    id: 'always_cancel',
    label: 'Always CANCEL',
    describe: 'CANCEL at confidence 0.95 on every payment and every reply branch.',
    pick: () => synthetic('CANCEL', 0.95),
  },
  {
    id: 'over_eager',
    label: 'Over-eager, unsure',
    describe:
      'Knows bills: LEAVE on essential bills and instalments; CANCEL on everything else at confidence 0.70, about where the recorded model clustered.',
    pick: (p) => (p.kind === 'essential_bill' || p.kind === 'instalment' ? synthetic('LEAVE', 0.9) : synthetic('CANCEL', 0.7)),
  },
];

/** A store holding a synthetic proposal for every proposal key the cases need, with matching input hashes. */
export function syntheticStore(
  proposer: SyntheticProposer,
  households: HouseholdData[],
  config: Config,
  recorded: ProposalStore,
  cases: EvalCase[],
): Map<string, RecordedProposal> {
  const payments = new Map(
    households.map((h) => [h.household.id, detectRecurring(h, config, signalsFrom(h.chat))] as const),
  );
  const store = new Map<string, RecordedProposal>();
  for (const req of requiredProposals(households, config, recorded, cases)) {
    const p = payments.get(req.household)!.find((x) => x.id === req.payment)!;
    store.set(req.key, {
      meta: { model: 'synthetic', run_at: 'n/a', prompt_version: 'n/a', input_hash: req.inputHash, household: req.household, payment: req.payment, branch: req.branch },
      proposal: proposer.pick(p),
    });
  }
  return store;
}

export interface StressRow {
  rule: string; // 'all on' or the rule switched off
  name: string;
  results: Record<string, { falseCancels: number; ids: string[]; newIds: string[] }>;
}

export function stressSweep(households: HouseholdData[], config: Config, recorded: ProposalStore, cases: EvalCase[]) {
  const stores = PROPOSERS.map((p) => ({ p, store: syntheticStore(p, households, config, recorded, cases) }));
  const configs = [
    { rule: 'all on', name: 'Every rule on', cfg: config },
    ...config.rules.filter((r) => !r.locked).map((r) => ({ rule: r.id, name: r.name, cfg: withRuleToggles(config, { [r.id]: false }) })),
  ];
  const baseline: Record<string, string[]> = {};
  const rows: StressRow[] = configs.map(({ rule, name, cfg }) => {
    const results: StressRow['results'] = {};
    for (const { p, store } of stores) {
      const ids = runEval(cases, households, cfg, store).results.filter((r) => r.falseCancel).map((r) => r.id);
      if (rule === 'all on') baseline[p.id] = ids;
      results[p.id] = { falseCancels: ids.length, ids, newIds: ids.filter((id) => !(baseline[p.id] ?? []).includes(id)) };
    }
    return { rule, name, results };
  });
  return { proposers: PROPOSERS.map(({ id, label, describe }) => ({ id, label, describe })), rows, caseCount: cases.length, runs: cases.length * configs.length * PROPOSERS.length };
}
