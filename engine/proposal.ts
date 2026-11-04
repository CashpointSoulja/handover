import type { TimedSignal } from './detect';
import type { ChatMessage, Decision, HouseholdData, Proposal, RecordedProposal, RecurringPayment } from './types';

export const PROMPT_VERSION = 'classifier-v1';

export const SYSTEM_PROMPT = `You classify one recurring payment for a UK household bills service.
You see the payment's bank descriptors, charges, what the merchant lookup found, and the member's recent chat messages.
Propose what the payment is and what to do. A separate ruleset will check your proposal and can only make it more cautious, so say what you actually think.

Actions:
- CANCEL: safe to cancel without asking. Only when it is clearly unwanted and unambiguous.
- FLAG: recommend cancelling, but the member should confirm.
- ASK: something important is unknown; ask the member one question.
- HUMAN: needs a person on the ops team.
- LEAVE: not worth acting on, wanted, already handled, or not a subscription.

Reply with JSON only, no prose, in exactly this shape:
{"service": string, "category": string, "isSubscription": boolean, "proposedAction": "CANCEL"|"FLAG"|"ASK"|"HUMAN"|"LEAVE", "confidence": number from 0 to 1, "rationale": one sentence in UK English}`;

export interface ProposalInput {
  as_of: string;
  payment: {
    id: string;
    descriptors: string[];
    payment_type: string;
    account: string;
    cadence: string;
    charges: { date: string; amount: number }[];
    amount: number;
    annualised_cost: number;
    lookup: { service: string; category: string; is_aggregator: boolean; identified_by_member_as: string | null };
    trial: { started_on: string; converts_on: string; trial_price: number; full_price: number } | null;
    cancelled_on: string | null;
  };
  chat: { at: string; from: string; about: string[]; text: string }[];
}

/** The exact input the classifier sees. Mode, rules and refund policies are left out on purpose: those are the ruleset's job. */
export function proposalInput(data: HouseholdData, payment: RecurringPayment, chat: ChatMessage[]): ProposalInput {
  const cancel = data.household.cancellations.find((c) => c.payment === payment.id);
  return {
    as_of: data.household.asOf,
    payment: {
      id: payment.id,
      descriptors: [...new Set(payment.charges.map((c) => c.descriptor).concat(payment.charges.length ? [] : [payment.rawDescriptor]))],
      payment_type: payment.paymentType,
      account: data.household.accounts.find((a) => a.id === payment.accountId)?.label ?? payment.accountId,
      cadence: payment.cadence,
      charges: payment.charges.map((c) => ({ date: c.bookingDate, amount: c.amount })),
      amount: payment.amount,
      annualised_cost: payment.annualisedCost,
      lookup: {
        service: payment.serviceName,
        category: payment.category,
        is_aggregator: payment.isAggregator,
        identified_by_member_as: payment.identifiedAs,
      },
      trial: payment.trial
        ? { started_on: payment.trial.startedOn, converts_on: payment.trial.convertsOn, trial_price: payment.trial.trialPrice, full_price: payment.trial.fullPrice }
        : null,
      cancelled_on: cancel?.cancelledOn ?? null,
    },
    chat: chat.map((m) => ({ at: m.at, from: m.from === 'member' ? 'member' : 'Nous', about: m.about ?? [], text: m.text })),
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Two FNV-1a 32-bit passes (different offsets) over the canonical JSON, so a proposal can be matched to the exact input it was recorded against. */
export function hashInput(input: ProposalInput): string {
  const bytes = new TextEncoder().encode(canonical({ v: PROMPT_VERSION, input }));
  let a = 0x811c9dc5;
  let b = 0x050c5d1f;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 0x01000193);
    b = Math.imul(b ^ bytes[i], 0x01000193);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export function userPrompt(input: ProposalInput): string {
  return `Classify this recurring payment.\n${JSON.stringify(input)}`;
}

const ACTIONS: Decision[] = ['CANCEL', 'FLAG', 'ASK', 'HUMAN', 'LEAVE'];

/** Parse and check a model reply. Throws on anything that is not a valid proposal. */
export function parseProposal(text: string): Proposal {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in reply');
  const p = JSON.parse(text.slice(start, end + 1));
  if (typeof p.service !== 'string' || typeof p.category !== 'string') throw new Error('service and category must be strings');
  if (typeof p.isSubscription !== 'boolean') throw new Error('isSubscription must be boolean');
  if (!ACTIONS.includes(p.proposedAction)) throw new Error(`proposedAction must be one of ${ACTIONS.join(', ')}`);
  if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) throw new Error('confidence must be 0 to 1');
  if (typeof p.rationale !== 'string') throw new Error('rationale must be a string');
  return {
    service: p.service,
    category: p.category,
    isSubscription: p.isSubscription,
    proposedAction: p.proposedAction,
    confidence: p.confidence,
    rationale: p.rationale,
  };
}

export function proposalKey(householdId: string, paymentId: string, branch: string | null): string {
  return `${householdId}/${paymentId}${branch ? `@${branch}` : ''}`;
}

export function isRecordedProposal(x: unknown): x is RecordedProposal {
  const r = x as RecordedProposal;
  return !!r && typeof r.meta?.model === 'string' && typeof r.meta?.input_hash === 'string' && !!r.proposal;
}

export type { TimedSignal };
