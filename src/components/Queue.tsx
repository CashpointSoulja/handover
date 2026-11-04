import { useEffect, useState } from 'react';
import { displayName, money, moneyRounded } from '../../engine/index';
import type { DecisionResult } from '../../engine/types';
import type { Selection } from '../App';
import { baseConfig, households } from '../data';
import { DecisionBadge, DECISIONS, ModeBadge } from '../ui';

const RANK: Record<string, number> = { HUMAN: 0, CANCEL: 2, FLAG: 3, ASK: 4, pending: 5, LEAVE: 6 };
const PER = { weekly: '/wk', monthly: '/mo', annual: '/yr' } as const;

/** Most urgent first: escalations, then anything marked priority urgent, then by decision, then by annual cost. */
export function urgency(r: DecisionResult): number {
  const urgent = r.attachments.some((a) => a.kind === 'priority_urgent') ? -1 : 0;
  return (RANK[r.decision ?? 'pending'] + urgent) * 1e6 - r.payment.annualisedCost;
}

export function label(r: DecisionResult): string {
  const p = r.payment;
  if (p.identifiedAs) return `${displayName(baseConfig, p.identifiedAs)} via ${p.serviceName}`;
  if (p.isAggregator) return p.rawDescriptor;
  return p.serviceName;
}

export function Queue({ results, selected, onSelect }: { results: Record<string, DecisionResult[]>; selected: Selection; onSelect: (s: Selection) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ [selected.hid]: true });
  useEffect(() => setOpen((o) => ({ ...o, [selected.hid]: true })), [selected.hid]);
  return (
    <div className="queue">
      {households.map(({ household: h }) => {
        const rs = results[h.id];
        const counts = Object.fromEntries([...DECISIONS, 'pending'].map((d) => [d, rs.filter((r) => (r.decision ?? 'pending') === d).length]));
        const inScope = rs.filter((r) => r.decidedBy !== 'R02').reduce((s, r) => s + r.payment.annualisedCost, 0);
        const isOpen = open[h.id] ?? false;
        return (
          <div key={h.id} className={`hh ${selected.hid === h.id ? 'hh-current' : ''}`}>
            <button className="hh-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [h.id]: !isOpen }))}>
              <span className="hh-title">
                <span className="mono">{h.id}</span> {h.surname}
              </span>
              <ModeBadge mode={h.mode} />
              <span className="hh-scope num">{moneyRounded(inScope)}/yr in scope</span>
              <span className="hh-counts">
                {DECISIONS.filter((d) => counts[d]).map((d) => (
                  <span key={d} className={`count count-${d.toLowerCase()}`}>
                    {d} {counts[d]}
                  </span>
                ))}
                {counts.pending > 0 && <span className="count count-pending">Pending {counts.pending}</span>}
              </span>
            </button>
            {isOpen && (
              <ul className="payments">
                {[...rs].sort((a, b) => urgency(a) - urgency(b)).map((r) => {
                  const on = selected.hid === h.id && selected.pid === r.payment.id;
                  return (
                    <li key={r.payment.id}>
                      <button className={`pay ${on ? 'on' : ''}`} aria-current={on} onClick={() => onSelect({ hid: h.id, pid: r.payment.id })}>
                        <DecisionBadge decision={r.decision} />
                        <span className="pay-name">{label(r)}</span>
                        <span className="pay-amt num">
                          {money(r.payment.amount)}
                          {PER[r.payment.cadence]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
