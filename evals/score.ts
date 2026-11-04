// Eval scoring, shared by the CLI runner and the browser. Pure: no IO.
import { runHousehold, type ProposalStore, type Reply } from '../engine/index';
import type { Config, Decision, HouseholdData, Mode, RuleId } from '../engine/types';

export interface EvalCase {
  id: string;
  category: string;
  household: string;
  recurring_payment: string;
  mode: Mode;
  reply?: { label: string; signal?: Reply['signal'] };
  scenario?: { policy_status?: 'verified' | 'assumed' };
  expected: { decision: Decision; decided_by: 'llm' | RuleId; attachments: string[] };
  must_not: Decision[];
  weight: number;
  note: string;
}

export interface CaseResult {
  id: string;
  category: string;
  household: string;
  payment: string;
  mode: Mode;
  status: 'pass' | 'fail' | 'pending';
  decision: Decision | null;
  decidedBy: string | null;
  expected: EvalCase['expected'];
  attachments: string[];
  missingAttachments: string[];
  falseCancel: boolean;
  mustNotHit: boolean;
  decisionMatch: boolean;
  attributionMatch: boolean;
  proposalStatus: 'recorded' | 'missing' | 'stale' | 'not_detected';
  weight: number;
  note: string;
}

export interface Metrics {
  cases: number;
  scored: number;
  pending: number;
  passed: number;
  failed: number;
  falseCancels: number;
  gate: 'green' | 'red' | 'pending';
  decisionAccuracy: number | null;
  attributionAccuracy: number | null;
  weightedCost: number;
}

export const CATEGORY_LABELS: Record<string, string> = {
  clean_cancel: 'Clean cancel',
  ambiguous_merchant: 'Ambiguous merchant',
  refund_window: 'Refund window',
  shared_plans: 'Shared plans',
  trials: 'Trials',
  post_cancel: 'Post-cancel charges',
  manual_mode: 'Manual mode',
  not_subscription: 'Not a subscription / bundles / contracts',
};

export function scoreCase(c: EvalCase, households: HouseholdData[], config: Config, proposals: ProposalStore): CaseResult {
  const data = households.find((h) => h.household.id === c.household);
  if (!data) throw new Error(`${c.id}: unknown household ${c.household}`);
  const replies = c.reply ? [{ payment: c.recurring_payment, ...c.reply }] : [];
  const r = runHousehold(data, config, proposals, { mode: c.mode, replies, policyStatus: c.scenario?.policy_status }).find(
    (x) => x.payment.id === c.recurring_payment,
  );
  const base = {
    id: c.id,
    category: c.category,
    household: c.household,
    payment: c.recurring_payment,
    mode: c.mode,
    expected: c.expected,
    weight: c.weight,
    note: c.note,
  };
  if (!r) {
    return { ...base, status: 'fail', decision: null, decidedBy: null, attachments: [], missingAttachments: c.expected.attachments, falseCancel: false, mustNotHit: false, decisionMatch: false, attributionMatch: false, proposalStatus: 'not_detected' };
  }
  const attachments = [...new Set(r.attachments.map((a) => a.kind))];
  const missingAttachments = c.expected.attachments.filter((a) => !attachments.includes(a as never));
  if (r.decision === null) {
    return { ...base, status: 'pending', decision: null, decidedBy: null, attachments, missingAttachments, falseCancel: false, mustNotHit: false, decisionMatch: false, attributionMatch: false, proposalStatus: r.proposalStatus };
  }
  const falseCancel = r.decision === 'CANCEL' && c.expected.decision !== 'CANCEL';
  const mustNotHit = c.must_not.includes(r.decision);
  const decisionMatch = r.decision === c.expected.decision;
  const attributionMatch = r.decidedBy === c.expected.decided_by;
  const fail = falseCancel || mustNotHit || !decisionMatch || missingAttachments.length > 0;
  return {
    ...base,
    status: fail ? 'fail' : 'pass',
    decision: r.decision,
    decidedBy: r.decidedBy,
    attachments,
    missingAttachments,
    falseCancel,
    mustNotHit,
    decisionMatch,
    attributionMatch,
    proposalStatus: r.proposalStatus,
  };
}

export function metrics(results: CaseResult[]): Metrics {
  const scored = results.filter((r) => r.status !== 'pending');
  const falseCancels = scored.filter((r) => r.falseCancel).length;
  const pending = results.length - scored.length;
  const pct = (n: number) => (scored.length ? Math.round((n / scored.length) * 1000) / 10 : null);
  return {
    cases: results.length,
    scored: scored.length,
    pending,
    passed: scored.filter((r) => r.status === 'pass').length,
    failed: scored.filter((r) => r.status === 'fail').length,
    falseCancels,
    gate: falseCancels > 0 ? 'red' : pending > 0 ? 'pending' : 'green',
    decisionAccuracy: pct(scored.filter((r) => r.decisionMatch).length),
    attributionAccuracy: pct(scored.filter((r) => r.attributionMatch).length),
    weightedCost: scored.filter((r) => r.status === 'fail').reduce((s, r) => s + r.weight, 0),
  };
}

/** Nag cost: average ASK decisions per household on the base data, plus how many decisions are still pending. */
export function asksPerHousehold(households: HouseholdData[], config: Config, proposals: ProposalStore) {
  let asks = 0;
  let pending = 0;
  let decided = 0;
  for (const h of households) {
    for (const r of runHousehold(h, config, proposals)) {
      if (r.decision === null) pending++;
      else decided++;
      if (r.decision === 'ASK') asks++;
    }
  }
  return { value: Math.round((asks / households.length) * 100) / 100, asks, decided, pending };
}

export function runEval(cases: EvalCase[], households: HouseholdData[], config: Config, proposals: ProposalStore) {
  const results = cases.map((c) => scoreCase(c, households, config, proposals));
  return { results, metrics: metrics(results), asks: asksPerHousehold(households, config, proposals) };
}

/** Decision counts across all households on the base data. */
export function decisionCounts(households: HouseholdData[], config: Config, proposals: ProposalStore) {
  const counts: Record<string, number> = { CANCEL: 0, FLAG: 0, ASK: 0, HUMAN: 0, LEAVE: 0, pending: 0 };
  for (const h of households) for (const r of runHousehold(h, config, proposals)) counts[r.decision ?? 'pending']++;
  return counts;
}

export interface CaseDiff {
  id: string;
  before: string;
  after: string;
}

export function diffResults(before: CaseResult[], after: CaseResult[]): CaseDiff[] {
  const prev = new Map(before.map((r) => [r.id, r]));
  const fmt = (r?: CaseResult) => (r ? `${r.status} ${r.decision ?? '-'} by ${r.decidedBy ?? '-'}` : 'absent');
  return after
    .map((r) => ({ id: r.id, before: fmt(prev.get(r.id)), after: fmt(r) }))
    .filter((d) => d.before !== d.after);
}
