import { shortDate } from './dates';
import { money, moneyRounded } from './money';
import { postCancelCharges, type RuleContext } from './rules';
import type { Attachment, Config, Decision, MemberMessage, MessageButton, RuleId } from './types';

const PER = { weekly: 'a week', monthly: 'a month', annual: 'a year' } as const;
const EVERY = { weekly: 'every week', monthly: 'every month', annual: 'every year' } as const;

export function displayName(config: Config, key: string): string {
  return config.merchants.find((m) => m.key === key)?.name ?? config.prices[key]?.name ?? key;
}

export function branchId(signal: MessageButton['signal']): string | null {
  if (!signal) return null;
  return signal.service ? `${signal.kind}-${signal.service}` : signal.kind;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Pick and fill the member message for a decision. LEAVE and pending decisions send nothing. */
export function buildMessage(
  ctx: RuleContext,
  decision: Decision | null,
  decidedBy: 'llm' | RuleId | null,
  attachments: Attachment[],
): MemberMessage | null {
  if (!decision || decision === 'LEAVE') return null;
  const { config, payment: p, data } = ctx;
  const key = decidedBy && decidedBy !== 'llm' && config.messages[`${decision}.${decidedBy}`] ? `${decision}.${decidedBy}` : decision;
  const tpl = config.messages[key];
  if (!tpl) return null;

  const accountLabel = (id: string) => lowerFirst(data.household.accounts.find((a) => a.id === id)?.label ?? id);
  const service = p.identifiedAs ? displayName(config, p.identifiedAs) : p.isAggregator ? p.rawDescriptor : p.serviceName;
  const vars: Record<string, string> = {
    first_name: data.household.member,
    service,
    raw: p.rawDescriptor,
    amount: money(p.amount),
    per: PER[p.cadence],
    every: EVERY[p.cadence],
    annual: moneyRounded(p.annualisedCost),
    account: accountLabel(p.accountId),
    last_date: p.lastCharge ? shortDate(p.lastCharge) : '',
  };
  const dup = attachments.find((a) => a.kind === 'duplicate_of');
  if (dup) {
    const other = ctx.payments.find((x) => x.id === dup.value);
    if (other) vars.other_account = accountLabel(other.accountId);
  }
  const deadline = [...attachments].reverse().find((a) => a.kind === 'deadline');
  if (deadline?.value) vars.deadline = shortDate(deadline.value);
  const contract = p.merchant?.contract;
  if (contract) vars.notice = `${contract.notice_days} days'`;
  const bundle = data.household.bundles.find((b) => b.parent === p.serviceKey || b.includes.includes(p.serviceKey));
  if (bundle) {
    vars.parent = displayName(config, bundle.parent);
    vars.child = bundle.includes.map((k) => displayName(config, k)).join(' and ');
  }
  if (key === 'HUMAN.R01') {
    const pc = postCancelCharges(ctx);
    const last = pc?.charges[pc.charges.length - 1];
    if (pc && last) {
      vars.post_amount = money(last.amount);
      vars.post_date = shortDate(last.bookingDate);
      vars.cancelled_on = shortDate(pc.cancelledOn);
    }
  }

  let text = fill(tpl.text, vars);
  const rise = attachments.find((a) => a.kind === 'price_rise');
  const riseLine = config.messages['line.price_rise'] as unknown as string | undefined;
  if (rise?.value && riseLine && decision !== 'HUMAN') {
    const [from, to] = rise.value.split(' → ');
    text += ' ' + fill(riseLine, { rise_from: from, rise_to: to });
  }

  let buttons: MessageButton[] = tpl.buttons ?? [];
  if (key === 'ASK.R05') {
    buttons = Object.entries(config.prices)
      .filter(([, e]) => e.billed_via?.includes(p.serviceKey) && Object.values(e.tiers).some((t) => Math.abs(t - p.amount) < 0.005))
      .slice(0, 2)
      .map(([k]) => ({ label: `It's ${displayName(config, k)}`, signal: { kind: 'identified' as const, service: k } }));
  }
  if (key === 'ASK.R06') {
    buttons = buttons.map((b) => (b.signal?.kind === 'identified' ? { ...b, signal: { ...b.signal, service: p.serviceKey } } : b));
  }
  return {
    templateKey: key,
    text,
    buttons: buttons.slice(0, 3).map((b) => ({ ...b, label: b.label.slice(0, 20), branch: branchId(b.signal) })),
  };
}
