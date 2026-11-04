// Which proposals the product needs recorded: one per recurring payment, plus one per reply
// branch (eval-case replies, and up to 2 reply buttons on each ASK decision).
import { proposalKey, runHousehold, type ProposalStore, type Reply } from '../engine/index';
import type { Config, HouseholdData } from '../engine/types';
import type { EvalCase } from './score';

export interface RequiredProposal {
  key: string;
  household: string;
  payment: string;
  branch: string | null;
  reply: Reply | null;
  inputHash: string;
  status: 'recorded' | 'missing' | 'stale';
}

export function requiredProposals(households: HouseholdData[], config: Config, proposals: ProposalStore, cases: EvalCase[]): RequiredProposal[] {
  const out = new Map<string, RequiredProposal>();
  const add = (data: HouseholdData, reply: Reply | null) => {
    const results = runHousehold(data, config, proposals, { replies: reply ? [reply] : [] });
    for (const r of results) {
      if (reply && r.payment.id !== reply.payment) continue;
      const key = proposalKey(data.household.id, r.payment.id, r.branch);
      if (!out.has(key)) {
        out.set(key, { key, household: data.household.id, payment: r.payment.id, branch: r.branch, reply, inputHash: r.proposalInputHash, status: r.proposalStatus });
      }
    }
    return results;
  };
  for (const data of households) {
    const base = add(data, null);
    for (const r of base) {
      if (r.decision !== 'ASK') continue;
      for (const b of (r.message?.buttons ?? []).filter((x) => x.signal).slice(0, 2)) {
        add(data, { payment: r.payment.id, label: b.label, signal: b.signal });
      }
    }
  }
  for (const c of cases) {
    if (!c.reply) continue;
    const data = households.find((h) => h.household.id === c.household)!;
    add(data, { payment: c.recurring_payment, ...c.reply });
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}
