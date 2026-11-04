import { gate } from './decide';
import { detectRecurring, signalsFrom } from './detect';
import { branchId, buildMessage } from './message';
import { hashInput, proposalInput, proposalKey } from './proposal';
import type { RuleContext } from './rules';
import type { ChatMessage, Config, DecisionResult, HouseholdData, Mode, Policy, RecordedProposal, Signal } from './types';

export * from './types';
export { buildConfig, withRuleToggles, RULE_IDS } from './config';
export { detectRecurring, signalsFrom } from './detect';
export { normalise } from './normalise';
export { proposalInput, hashInput, proposalKey, parseProposal, SYSTEM_PROMPT, userPrompt, PROMPT_VERSION } from './proposal';
export { branchId, displayName } from './message';
export { money, moneyRounded } from './money';
export { shortDate, daysBetween } from './dates';

/** A member's tap on a reply button, applied to one payment. */
export interface Reply {
  payment: string;
  label: string;
  signal?: { kind: Signal['kind']; service?: string };
}

export interface RunOptions {
  mode?: Mode;
  replies?: Reply[];
  policyStatus?: Policy['status'];
}

export type ProposalStore = Pick<Map<string, RecordedProposal>, 'get'>;

export function replyMessages(data: HouseholdData, replies: Reply[]): ChatMessage[] {
  return replies.map((r, i) => ({
    id: `reply-${i + 1}`,
    at: `${data.household.asOf}T12:${String(i).padStart(2, '0')}:00`,
    from: 'member',
    author: data.household.member,
    text: r.label,
    about: [r.payment],
    signals: r.signal ? [{ payment: r.payment, ...r.signal }] : [],
  }));
}

/** Run the full pipeline for every recurring payment in a household. Pure and deterministic. */
export function runHousehold(data: HouseholdData, config: Config, proposals: ProposalStore, opts: RunOptions = {}): DecisionResult[] {
  const replies = opts.replies ?? [];
  const replyMsgs = replyMessages(data, replies);
  const signals = signalsFrom([...data.chat, ...replyMsgs]);
  const payments = detectRecurring(data, config, signals);
  const mode = opts.mode ?? data.household.mode;

  return payments.map((payment) => {
    const mine = replies.map((r, i) => ({ r, m: replyMsgs[i] })).filter((x) => x.r.payment === payment.id);
    const lastReply = mine[mine.length - 1]?.r;
    const branch = lastReply?.signal ? branchId(lastReply.signal) : null;
    const input = proposalInput(data, payment, [...data.chat, ...mine.map((x) => x.m)]);
    const hash = hashInput(input);
    const recorded = proposals.get(proposalKey(data.household.id, payment.id, branch)) ?? null;
    const status: DecisionResult['proposalStatus'] = !recorded ? 'missing' : recorded.meta.input_hash === hash ? 'recorded' : 'stale';
    const usable = status === 'recorded' ? recorded : null;

    const ctx: RuleContext = {
      data,
      payment,
      payments,
      mode,
      signals,
      proposal: usable?.proposal ?? null,
      config,
      asOf: data.household.asOf,
      policyStatusOverride: opts.policyStatus,
    };
    const g = gate(ctx);
    return {
      householdId: data.household.id,
      payment,
      mode,
      branch,
      proposal: recorded,
      proposalStatus: status,
      proposalInputHash: hash,
      ...g,
      message: buildMessage(ctx, g.decision, g.decidedBy, g.attachments),
    };
  });
}

export function runPayment(
  data: HouseholdData,
  config: Config,
  proposals: ProposalStore,
  paymentId: string,
  opts: RunOptions = {},
): DecisionResult | undefined {
  return runHousehold(data, config, proposals, opts).find((r) => r.payment.id === paymentId);
}
