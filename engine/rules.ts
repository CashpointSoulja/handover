import { addDays, daysBetween, shortDate } from './dates';
import type { TimedSignal } from './detect';
import { money } from './money';
import { normalise } from './normalise';
import type {
  Attachment,
  CapLevel,
  Config,
  Evidence,
  FiredRule,
  HouseholdData,
  Mode,
  Policy,
  Proposal,
  RecurringPayment,
  RuleConfig,
  RuleId,
  Transaction,
} from './types';

export interface RuleContext {
  data: HouseholdData;
  payment: RecurringPayment;
  payments: RecurringPayment[];
  mode: Mode;
  signals: TimedSignal[];
  proposal: Proposal | null;
  config: Config;
  asOf: string;
  policyStatusOverride?: Policy['status'];
}

export const NEEDS_PROPOSAL = 'needs_proposal' as const;
type Outcome = Omit<FiredRule, 'id' | 'type'> | null | typeof NEEDS_PROPOSAL;
type RuleFn = (ctx: RuleContext, rule: RuleConfig) => Outcome;

const ev = (transactions: Transaction[] = [], messages: (string | null | undefined)[] = []): Evidence => ({
  transactions: transactions.map((t) => t.id),
  messages: messages.filter((m): m is string => !!m),
});
const att = (rule: RuleId, kind: Attachment['kind'], value?: string): Attachment => ({ rule, kind, value });

const signalsFor = (ctx: RuleContext, kinds: TimedSignal['kind'][]) =>
  ctx.signals.filter((s) => s.payment === ctx.payment.id && kinds.includes(s.kind));
const latest = <T>(xs: T[]) => xs[xs.length - 1];

/** The service name to look up in prices and policies: what the member identified, or the merchant key. */
const serviceOf = (p: RecurringPayment) => p.identifiedAs ?? p.serviceKey;

export function postCancelCharges(ctx: RuleContext): { charges: Transaction[]; cancelledOn: string; source: string | null } | null {
  const c = ctx.data.household.cancellations.find((x) => x.payment === ctx.payment.id);
  if (!c) return null;
  const idBase = normalise(ctx.payment.rawDescriptor, ctx.config).idBase;
  const sameService = ctx.data.transactions.filter(
    (t) => t.accountId === ctx.payment.accountId && normalise(t.descriptor, ctx.config).idBase === idBase,
  );
  const debits = sameService.filter((t) => t.amount < 0 && t.bookingDate > c.cancelledOn);
  const credits = sameService.filter((t) => t.amount > 0);
  const used = new Set<string>();
  let finalBillUsed = false;
  const open = debits.filter((d) => {
    const refund = credits.find(
      (cr) => !used.has(cr.id) && cr.bookingDate >= d.bookingDate && Math.abs(cr.amount + d.amount) < 0.005,
    );
    if (refund) {
      used.add(refund.id);
      return false;
    }
    if (c.finalBill && !finalBillUsed && Math.abs(d.amount) <= c.finalBill.maxAmount + 0.005 && d.bookingDate <= c.finalBill.by) {
      finalBillUsed = true;
      return false;
    }
    return true;
  });
  return { charges: open, cancelledOn: c.cancelledOn, source: c.source };
}

export const RULES: Record<string, RuleFn> = {
  // Charge after a recorded cancellation. Terminal, any mode.
  R01: (ctx, r) => {
    const pc = postCancelCharges(ctx);
    if (!pc || pc.charges.length === 0) return null;
    const total = pc.charges.reduce((s, t) => s + Math.abs(t.amount), 0);
    return {
      effect: 'HUMAN',
      attachments: [att(r.id, 'refund_request', money(total)), att(r.id, 'priority_urgent')],
      detail: `${pc.charges.length} charge${pc.charges.length > 1 ? 's' : ''} (${money(total)}) after cancelling on ${shortDate(pc.cancelledOn)}`,
      evidence: ev(pc.charges, [pc.source]),
    };
  },

  // Not a subscription: instalments and essential bills. Terminal.
  R02: (ctx, r) => {
    const p = ctx.payment;
    if (p.kind !== 'instalment' && p.kind !== 'essential_bill') return null;
    const route = p.merchant?.route ?? p.category;
    return {
      effect: 'LEAVE',
      attachments: [att(r.id, 'route', route)],
      detail: `${p.kind === 'instalment' ? 'Instalment plan' : 'Essential bill'} (${p.category.replace('_', ' ')}); route: ${route}`,
      evidence: ev(p.charges.slice(-1)),
    };
  },

  // Member said keep in the last 90 days, and the price has not risen since. Terminal.
  R03: (ctx, r) => {
    const keep = latest(signalsFor(ctx, ['keep']));
    if (!keep) return null;
    const age = daysBetween(keep.at, ctx.asOf);
    if (age < 0 || age > (r.threshold?.window_days ?? 90)) return null;
    const keepDay = keep.at.slice(0, 10);
    const before = ctx.payment.charges.filter((t) => t.bookingDate <= keepDay);
    const after = ctx.payment.charges.filter((t) => t.bookingDate > keepDay);
    const ref = before.length ? Math.abs(latest(before).amount) : ctx.payment.amount;
    if (after.some((t) => Math.abs(t.amount) > ref + 0.005)) return null;
    return { effect: 'LEAVE', attachments: [], detail: `Member said keep ${age} days ago; price unchanged since`, evidence: ev([], [keep.messageId]) };
  },

  // Manual mode. Cap FLAG. Locked on.
  R04: (ctx) => (ctx.mode === 'manual' ? { effect: 'FLAG', attachments: [], detail: 'Household is in Manual mode', evidence: ev() } : null),

  // Aggregator the member has not identified. Cap ASK.
  R05: (ctx) => {
    const p = ctx.payment;
    if (!p.isAggregator || p.identifiedAs) return null;
    return { effect: 'ASK', attachments: [], detail: `${p.rawDescriptor} could be any app billed through ${p.serviceName}`, evidence: ev(p.charges.slice(-3)) };
  },

  // LLM confidence below threshold. Cap ASK.
  R06: (ctx, r) => {
    if (!ctx.proposal) return NEEDS_PROPOSAL;
    const min = r.threshold?.min_confidence ?? 0.8;
    if (ctx.proposal.confidence >= min) return null;
    return { effect: 'ASK', attachments: [], detail: `Confidence ${ctx.proposal.confidence.toFixed(2)} < ${min.toFixed(2)}`, evidence: ev() };
  },

  // Shared plan: price matches a family or duo tier, or the member said it is shared. Cap ASK.
  R07: (ctx) => {
    const p = ctx.payment;
    const said = latest(signalsFor(ctx, ['shared', 'not_shared']));
    if (said?.kind === 'not_shared') return null;
    if (said?.kind === 'shared') return { effect: 'ASK', attachments: [], detail: 'Member said it is shared', evidence: ev([], [said.messageId]) };
    const tiers = ctx.config.prices[serviceOf(p)]?.tiers ?? {};
    const tier = Object.entries(tiers).find(([name, price]) => /family|duo/.test(name) && Math.abs(price - p.amount) < 0.005);
    if (!tier) return null;
    return { effect: 'ASK', attachments: [], detail: `${money(p.amount)} matches the ${tier[0]} tier`, evidence: ev(p.charges.slice(-1)) };
  },

  // Service bundled inside another bill. Cap ASK, plus cancel_via the parent.
  R08: (ctx) => {
    const key = serviceOf(ctx.payment);
    const b = ctx.data.household.bundles.find((x) => x.parent === key || x.includes.includes(key));
    if (!b) return null;
    const parentName = ctx.config.merchants.find((m) => m.key === b.parent)?.name ?? b.parent;
    const childNames = b.includes.map((k) => ctx.config.merchants.find((m) => m.key === k)?.name ?? k);
    const parentPayment = ctx.payments.find((x) => x.serviceKey === b.parent);
    return {
      effect: 'ASK',
      attachments: [att('R08', 'cancel_via', b.parent)],
      detail: key === b.parent ? `${parentName} bill includes ${childNames.join(', ')}` : `Also included in the ${parentName} bill`,
      evidence: ev(parentPayment ? parentPayment.charges.slice(-1) : [], [b.source]),
    };
  },

  // Minimum term or notice period. Cap FLAG, plus cancel_method provider_notice.
  R09: (ctx) => {
    const c = ctx.payment.merchant?.contract;
    if (!c) return null;
    return {
      effect: 'FLAG',
      attachments: [att('R09', 'cancel_method', 'provider_notice')],
      detail: `${c.minimum_term_months}-month minimum term, ${c.notice_days} days' notice`,
      evidence: ev(ctx.payment.charges.slice(-1)),
    };
  },

  // Annualised cost at or above the threshold. Cap FLAG.
  R10: (ctx, r) => {
    const t = r.threshold?.annual_gbp ?? 150;
    if (ctx.payment.annualisedCost < t) return null;
    return { effect: 'FLAG', attachments: [], detail: `${money(ctx.payment.annualisedCost)} a year ≥ ${money(t)}`, evidence: ev(ctx.payment.charges.slice(-1)) };
  },

  // Same service billed from two payment streams. Cap FLAG, plus duplicate_of.
  R11: (ctx) => {
    const p = ctx.payment;
    if (p.isAggregator && !p.identifiedAs) return null;
    const other = ctx.payments.find(
      (x) => x.id !== p.id && x.identity === p.identity && (x.accountId !== p.accountId || x.paymentType !== p.paymentType),
    );
    if (!other) return null;
    return {
      effect: 'FLAG',
      attachments: [att('R11', 'duplicate_of', other.id)],
      detail: `Also billed as ${other.id} on ${other.accountId}`,
      evidence: ev([...p.charges.slice(-1), ...other.charges.slice(-1)]),
    };
  },

  // Trial converts to full price within 7 days. Cap FLAG, plus priority urgent and deadline.
  R12: (ctx, r) => {
    const tr = ctx.payment.trial;
    if (!tr) return null;
    const days = daysBetween(ctx.asOf, tr.convertsOn);
    if (days < 0 || days > (r.threshold?.within_days ?? 7)) return null;
    return {
      effect: 'FLAG',
      attachments: [att('R12', 'priority_urgent'), att('R12', 'deadline', tr.convertsOn)],
      detail: `Trial converts to ${money(tr.fullPrice)} in ${days} day${days === 1 ? '' : 's'} (${shortDate(tr.convertsOn)})`,
      evidence: ev(ctx.payment.charges),
    };
  },

  // Annual renewal inside the provider's refund window. Attach refund_request and deadline;
  // also cap FLAG when the policy is only assumed.
  R13: (ctx) => {
    const p = ctx.payment;
    if (p.cadence !== 'annual' || !p.lastCharge) return null;
    const policy = ctx.config.policies.find((x) => x.provider === serviceOf(p));
    if (!policy) return null;
    const deadline = addDays(p.lastCharge, policy.refund_window_days);
    if (ctx.asOf > deadline) return null;
    const status = ctx.policyStatusOverride ?? policy.status;
    return {
      effect: status === 'assumed' ? 'FLAG' : null,
      attachments: [att('R13', 'refund_request', money(p.amount)), att('R13', 'deadline', deadline)],
      detail: `Renewed ${shortDate(p.lastCharge)}; ${policy.refund_window_days}-day refund window ends ${shortDate(deadline)}`,
      evidence: ev(p.charges.slice(-1)),
      policyStatus: status,
    };
  },

  // Price rose by at least 10% against the trailing 3 charges. Attach price_rise.
  R14: (ctx, r) => {
    const ch = ctx.payment.charges;
    if (ch.length < 2) return null;
    const n = r.threshold?.trailing_charges ?? 3;
    const prev = ch.slice(-1 - n, -1).map((t) => Math.abs(t.amount));
    const mean = prev.reduce((s, x) => s + x, 0) / prev.length;
    const now = Math.abs(ch[ch.length - 1].amount);
    const pct = r.threshold?.rise_pct ?? 10;
    if (now < mean * (1 + pct / 100) - 0.005) return null;
    const rise = Math.round(((now - mean) / mean) * 1000) / 10;
    return {
      effect: null,
      attachments: [att('R14', 'price_rise', `${money(mean)} → ${money(now)}`)],
      detail: `${money(mean)} → ${money(now)} (+${rise}%)`,
      evidence: ev(ch.slice(-1 - n)),
    };
  },
};

export const CAP_RANK: Record<CapLevel, number> = { CANCEL: 4, FLAG: 3, ASK: 2, HUMAN: 1 };
export const isCapLevel = (d: string | null): d is CapLevel => !!d && d in CAP_RANK;
