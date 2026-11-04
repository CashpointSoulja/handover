import { addDays, addMonths, daysBetween } from './dates';
import { pence } from './money';
import { normalise } from './normalise';
import type { Cadence, ChatMessage, Config, HouseholdData, Normalised, RecurringPayment, Signal, Transaction, Trial } from './types';

export const DATE_TOLERANCE_DAYS = 3;
export const AMOUNT_VARIANCE = 0.15;

const CADENCE_DAYS: Record<Cadence, [number, number]> = {
  weekly: [7 - DATE_TOLERANCE_DAYS, 7 + DATE_TOLERANCE_DAYS],
  monthly: [28 - DATE_TOLERANCE_DAYS, 31 + DATE_TOLERANCE_DAYS],
  annual: [365 - DATE_TOLERANCE_DAYS, 366 + DATE_TOLERANCE_DAYS],
};
const PER_YEAR: Record<Cadence, number> = { weekly: 52, monthly: 12, annual: 1 };

export function classifyCadence(dates: string[]): Cadence | null {
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
  for (const c of ['weekly', 'monthly', 'annual'] as Cadence[]) {
    const [lo, hi] = CADENCE_DAYS[c];
    if (gaps.every((g) => g >= lo && g <= hi)) return c;
  }
  return null;
}

export function nextAfter(date: string, cadence: Cadence): string {
  if (cadence === 'weekly') return addDays(date, 7);
  if (cadence === 'monthly') return addMonths(date, 1);
  return addMonths(date, 12);
}

/** Split a group's charges into amount clusters: a charge joins the first cluster whose latest amount is within 15%. */
export function clusterByAmount(charges: Transaction[]): Transaction[][] {
  const clusters: Transaction[][] = [];
  for (const t of [...charges].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate))) {
    const amt = Math.abs(t.amount);
    const home = clusters.find((c) => {
      const last = Math.abs(c[c.length - 1].amount);
      return Math.abs(amt - last) / last <= AMOUNT_VARIANCE;
    });
    if (home) home.push(t);
    else clusters.push([t]);
  }
  return clusters;
}

export interface TimedSignal extends Signal {
  messageId: string;
  at: string;
}

export function signalsFrom(chat: ChatMessage[]): TimedSignal[] {
  return chat.flatMap((m) => (m.signals ?? []).map((s) => ({ ...s, messageId: m.id, at: m.at })));
}

interface Draft {
  n: Normalised;
  accountId: string;
  charges: Transaction[];
  trial: Trial | null;
  descriptor: string;
}

/** Find recurring payments in a household's transactions. Retail and income are never recurring payments. */
export function detectRecurring(data: HouseholdData, config: Config, signals: TimedSignal[]): RecurringPayment[] {
  const { household, transactions } = data;
  const groups = new Map<string, { n: Normalised; accountId: string; charges: Transaction[] }>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const n = normalise(t.descriptor, config);
    if (n.kind === 'retail' || n.kind === 'income') continue;
    const key = `${n.idBase}|${t.accountId}`;
    const g = groups.get(key) ?? { n, accountId: t.accountId, charges: [] };
    g.charges.push(t);
    groups.set(key, g);
  }

  const drafts: Draft[] = [];
  const trialsUsed = new Set<Trial>();
  for (const g of groups.values()) {
    for (const cluster of clusterByAmount(g.charges)) {
      const trial =
        household.trials.find((tr) => tr.service === g.n.serviceKey && tr.account === g.accountId && !trialsUsed.has(tr)) ?? null;
      if (cluster.length >= 2 && classifyCadence(cluster.map((c) => c.bookingDate))) {
        drafts.push({ n: g.n, accountId: g.accountId, charges: cluster, trial: null, descriptor: cluster[cluster.length - 1].descriptor });
      } else if (cluster.length === 1 && trial) {
        trialsUsed.add(trial);
        drafts.push({ n: g.n, accountId: g.accountId, charges: cluster, trial, descriptor: cluster[0].descriptor });
      }
    }
  }
  for (const tr of household.trials) {
    if (trialsUsed.has(tr)) continue;
    drafts.push({ n: normalise(tr.descriptor, config), accountId: tr.account, charges: [], trial: tr, descriptor: tr.descriptor });
  }

  // Stable ids: aggregators carry the charge in pence (apple_bill_999); a service seen on two
  // accounts carries the account (microsoft_365_cc).
  const byBase = new Map<string, Draft[]>();
  for (const d of drafts) byBase.set(d.n.idBase, [...(byBase.get(d.n.idBase) ?? []), d]);

  const out: RecurringPayment[] = [];
  for (const [base, list] of byBase) {
    for (const d of list) {
      const first = d.charges[0];
      const latest = d.charges[d.charges.length - 1];
      let id = base;
      if (d.n.isAggregator) id = `${base}_${pence(first ? first.amount : d.trial!.fullPrice)}`;
      else if (list.length > 1) {
        const accounts = new Set(list.map((x) => x.accountId));
        id = accounts.size > 1 ? `${base}_${d.accountId}` : `${base}_${pence(first ? first.amount : 0)}`;
      }
      const cadence: Cadence = d.trial ? d.trial.cadence : classifyCadence(d.charges.map((c) => c.bookingDate))!;
      const converted = !!(d.trial && latest && latest.bookingDate >= d.trial.convertsOn);
      const amount = d.trial && !converted ? d.trial.fullPrice : Math.abs(latest.amount);
      const lastCharge = latest ? latest.bookingDate : null;
      const nextExpected = d.trial && !converted ? d.trial.convertsOn : nextAfter(lastCharge!, cadence);
      const identified = [...signals].reverse().find((s) => s.payment === id && s.kind === 'identified' && s.service);
      const identifiedAs = d.n.isAggregator ? identified?.service ?? null : null;
      out.push({
        id,
        householdId: household.id,
        serviceKey: d.n.serviceKey,
        serviceName: d.n.serviceName,
        identity: identifiedAs ?? (d.n.isAggregator ? id : d.n.idBase),
        isAggregator: d.n.isAggregator,
        identifiedAs,
        rawDescriptor: d.descriptor,
        kind: d.n.kind,
        category: d.n.category,
        accountId: d.accountId,
        paymentType: latest ? latest.paymentType : 'card',
        cadence,
        charges: d.charges,
        amount,
        lastCharge,
        nextExpected,
        annualisedCost: Math.round(amount * PER_YEAR[cadence] * 100) / 100,
        trial: d.trial,
        merchant: d.n.merchant,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
