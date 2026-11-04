import { useState } from 'react';
import { money, moneyRounded, shortDate } from '../../engine/index';
import type { Config, DecisionResult, Evidence, FiredRule, HouseholdData } from '../../engine/types';
import { ATTACHMENT_LABELS, DecisionBadge, ModeBadge, Mono } from '../ui';
import { label } from './Queue';

const PAYMENT_TYPE: Record<string, string> = { card: 'Card', direct_debit: 'Direct debit', standing_order: 'Standing order' };

function effectText(f: FiredRule, config: Config): string {
  const rule = config.rules.find((r) => r.id === f.id)!;
  if (rule.type === 'terminal') return `Terminal → ${f.effect}`;
  if (f.effect) return `Cap ${f.effect}`;
  return 'Attach';
}

export function Trace({
  data,
  result: r,
  config,
  hover,
  onHover,
}: {
  data: HouseholdData;
  result: DecisionResult;
  config: Config;
  hover: Evidence | null;
  onHover: (e: Evidence | null) => void;
}) {
  const [showQuiet, setShowQuiet] = useState(false);
  const p = r.payment;
  const accounts = Object.fromEntries(data.household.accounts.map((a) => [a.id, a.label]));
  const evidenceIds = new Set(r.fired.flatMap((f) => f.evidence.transactions));
  const extra = data.transactions.filter((t) => evidenceIds.has(t.id) && !p.charges.some((c) => c.id === t.id));
  const rows = [...p.charges, ...extra].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
  const lit = new Set(hover?.transactions ?? []);
  const rule = (id: string) => config.rules.find((x) => x.id === id)!;
  const rec = r.proposal?.meta;
  const quiet = r.notFired.length;

  let handover: string;
  if (r.decidedBy && r.decidedBy !== 'llm') handover = `Handed to rules at ${r.decidedBy}`;
  else if (r.decidedBy === 'llm') handover = 'No cap bound it: the proposal stands';
  else handover = r.ceiling ? `Rules cap this at ${r.ceiling}; waiting on a recorded proposal` : 'Waiting on a recorded proposal';

  return (
    <div className="trace">
      <div className="trace-head">
        <div>
          <h1>{label(r)}</h1>
          <div className="sub">
            <Mono>{data.household.id}</Mono> {data.household.surname} · <ModeBadge mode={r.mode} /> · <Mono>{p.id}</Mono>
          </div>
        </div>
        <DecisionBadge decision={r.decision} size="lg" />
      </div>

      <ol className="steps">
        <li className="step">
          <h2>Charges</h2>
          <table className="grid charges">
            <thead>
              <tr>
                <th>Date</th>
                <th>Descriptor</th>
                <th>Type</th>
                <th>Account</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No charges yet: trial started {p.trial ? shortDate(p.trial.startedOn) : ''}
                  </td>
                </tr>
              )}
              {rows.map((t) => (
                <tr key={t.id} className={lit.has(t.id) ? 'lit' : ''}>
                  <td className="num">{shortDate(t.bookingDate)}</td>
                  <td>
                    <Mono>{t.descriptor}</Mono>
                  </td>
                  <td>{PAYMENT_TYPE[t.paymentType] ?? t.paymentType}</td>
                  <td>{accounts[t.accountId] ?? t.accountId}</td>
                  <td className="r num">{money(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>

        <li className="step">
          <h2>Normalised</h2>
          <dl className="facts">
            <div>
              <dt>Service</dt>
              <dd>
                <Mono>{p.serviceKey}</Mono>
                {p.isAggregator && <span className="tag">aggregator</span>}
                {p.identifiedAs && (
                  <>
                    {' '}
                    → <Mono>{p.identifiedAs}</Mono> <span className="tag">member identified</span>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Cadence</dt>
              <dd>
                {p.cadence}
                {p.trial && <span className="tag">trial</span>}
              </dd>
            </div>
            <div>
              <dt>Next expected</dt>
              <dd className="num">{shortDate(p.nextExpected)}</dd>
            </div>
            <div>
              <dt>Annualised</dt>
              <dd className="num">{moneyRounded(p.annualisedCost)}</dd>
            </div>
          </dl>
        </li>

        <li className="step">
          <h2>Proposed action (LLM)</h2>
          {r.proposal && r.proposalStatus === 'recorded' ? (
            <div className="proposal">
              <div className="proposal-top">
                <DecisionBadge decision={r.proposal.proposal.proposedAction} />
                <span className="conf">
                  <span className="conf-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(r.proposal.proposal.confidence * 100)}%` }} />
                  </span>
                  <span className="num">{r.proposal.proposal.confidence.toFixed(2)}</span>
                </span>
                <span className="muted small">
                  recorded run {rec ? rec.run_at.slice(0, 10) : ''}
                  {rec?.source === 'chat-recorded' && ' · chat-recorded'}
                </span>
              </div>
              <p className="rationale">{r.proposal.proposal.rationale}</p>
            </div>
          ) : (
            <div className="proposal proposal-pending">
              <DecisionBadge decision={null} />
              <span className="muted">{r.proposalStatus === 'stale' ? 'Recorded run is stale: its input no longer matches' : 'No recorded run yet'}</span>
            </div>
          )}
        </li>

        <li className="step">
          <h2>Rules</h2>
          <ul className="fired">
            {r.fired.map((f) => {
              const cfg = rule(f.id);
              return (
                <li
                  key={f.id}
                  className={`rule ${r.decidedBy === f.id ? 'binding' : ''}`}
                  tabIndex={0}
                  onMouseEnter={() => onHover(f.evidence)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(f.evidence)}
                  onBlur={() => onHover(null)}
                >
                  <div className="rule-top">
                    <Mono>{f.id}</Mono>
                    <span className="rule-name">{cfg.name}</span>
                    <span className="effect">{effectText(f, config)}</span>
                    {f.policyStatus && <span className={`tag policy-${f.policyStatus}`}>policy {f.policyStatus}</span>}
                  </div>
                  <div className="rule-detail">{f.detail}</div>
                  <div className="protects">{cfg.protects}</div>
                </li>
              );
            })}
          </ul>
          {(quiet > 0 || r.notReached.length > 0 || r.waiting.length > 0 || r.disabled.length > 0) && (
            <div className="quiet">
              <button className="link" aria-expanded={showQuiet} onClick={() => setShowQuiet(!showQuiet)}>
                {[
                  quiet > 0 && `${quiet} rule${quiet === 1 ? '' : 's'} checked, did not fire`,
                  r.notReached.length > 0 && `${r.notReached.length} not reached`,
                  r.waiting.length > 0 && `${r.waiting.join(', ')} waiting on a proposal`,
                  r.disabled.length > 0 && `${r.disabled.length} off`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </button>
              {showQuiet && (
                <ul className="quiet-list">
                  {[...r.notFired.map((id) => [id, 'did not fire']), ...r.notReached.map((id) => [id, 'not reached']), ...r.waiting.map((id) => [id, 'waiting on a proposal']), ...r.disabled.map((id) => [id, 'off'])].map(([id, why]) => (
                    <li key={id}>
                      <Mono>{id}</Mono> {rule(id).name} <span className="muted">· {why}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </li>

        <li className={`step handover ${r.decidedBy && r.decidedBy !== 'llm' ? 'to-rules' : ''}`}>
          <span className="handover-line">{handover}</span>
        </li>

        <li className="step final">
          <h2>Decision</h2>
          <div className="final-row">
            <DecisionBadge decision={r.decision} size="lg" />
            <span className="muted">decidedBy</span> <Mono>{r.decidedBy ?? '-'}</Mono>
          </div>
          {r.attachments.length > 0 && (
            <ul className="chips">
              {r.attachments.map((a) => (
                <li key={`${a.kind}${a.value}`} className="chip">
                  <Mono>
                    {ATTACHMENT_LABELS[a.kind]}
                    {a.value ? `: ${a.kind === 'deadline' ? shortDate(a.value) : a.value}` : ''}
                  </Mono>
                </li>
              ))}
            </ul>
          )}
        </li>
      </ol>
    </div>
  );
}
