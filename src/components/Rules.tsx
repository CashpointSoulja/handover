import type { Config, DecisionResult } from '../../engine/types';
import type { runEval } from '../../evals/score';
import type { Selection } from '../App';
import { DecisionBadge, Mono } from '../ui';
import { Headline } from './Evals';
import { label } from './Queue';

type Run = ReturnType<typeof runEval>;

function threshold(t?: Record<string, number>) {
  if (!t) return '';
  return Object.entries(t)
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`)
    .join(', ');
}

export function Rules({
  config,
  toggles,
  onToggle,
  onReset,
  results,
  baseline,
  evalNow,
  evalBase,
  onOpen,
}: {
  config: Config;
  toggles: Record<string, boolean>;
  onToggle: (id: string, on: boolean) => void;
  onReset: () => void;
  results: Record<string, DecisionResult[]>;
  baseline: Record<string, DecisionResult[]>;
  evalNow: Run;
  evalBase: Run;
  onOpen: (s: Selection) => void;
}) {
  const off = config.rules.filter((r) => !r.enabled && !r.locked).map((r) => r.id);
  const changed = Object.entries(results).flatMap(([hid, rs]) =>
    rs
      .map((r) => ({ hid, r, before: baseline[hid].find((b) => b.payment.id === r.payment.id) }))
      .filter((x) => x.before && (x.before.decision !== x.r.decision || x.before.decidedBy !== x.r.decidedBy)),
  );
  const evalChanged = evalNow.results.filter((r, i) => r.status !== evalBase.results[i].status || r.decision !== evalBase.results[i].decision);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Rules</h1>
        <span className="muted">
          <Mono>{config.rulesVersion}</Mono> · evaluated in this order · rules can only make a decision more cautious
        </span>
        {off.length > 0 && (
          <button className="secondary" onClick={onReset}>
            Turn all back on
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table className="grid rules">
          <thead>
            <tr>
              <th>On</th>
              <th>Rule</th>
              <th>Type</th>
              <th>Effect</th>
              <th>Threshold</th>
              <th>Protects against</th>
            </tr>
          </thead>
          <tbody>
            {config.rules.map((r) => (
              <tr key={r.id} className={r.enabled || r.locked ? '' : 'rule-off'}>
                <td>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={r.locked ? true : toggles[r.id]}
                      disabled={r.locked}
                      onChange={(e) => onToggle(r.id, e.target.checked)}
                      aria-label={`${r.id} ${r.name}`}
                    />
                    <span />
                  </label>
                  {r.locked && <span className="tag">locked</span>}
                </td>
                <td>
                  <Mono>{r.id}</Mono> {r.name}
                </td>
                <td>{r.type}</td>
                <td>
                  {r.effect ?? ''}
                  {r.attach && r.attach.length > 0 && <span className="muted"> + {r.attach.join(', ')}</span>}
                </td>
                <td className="num">{threshold(r.threshold)}</td>
                <td className="protects-cell">{r.protects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section">What changed</h2>
      <Headline m={evalNow.metrics} asks={evalNow.asks} />
      {off.length === 0 ? (
        <p className="muted">All rules on. Turn one off to re-run every household and the evals.</p>
      ) : (
        <div className="changes">
          <div>
            <h3>
              Decisions across households <span className="muted num">({changed.length} changed)</span>
            </h3>
            {changed.length === 0 ? (
              <p className="muted">No decision changed.</p>
            ) : (
              <ul className="change-list">
                {changed.map(({ hid, r, before }) => (
                  <li key={hid + r.payment.id}>
                    <button className="link" onClick={() => onOpen({ hid, pid: r.payment.id })}>
                      <Mono>{hid}</Mono> {label(r)}
                    </button>
                    <span>
                      <DecisionBadge decision={before!.decision} /> <Mono>{before!.decidedBy ?? '-'}</Mono> → <DecisionBadge decision={r.decision} />{' '}
                      <Mono>{r.decidedBy ?? '-'}</Mono>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>
              Eval cases <span className="muted num">({evalChanged.length} changed)</span>
            </h3>
            {evalChanged.length === 0 ? (
              <p className="muted">No eval case changed.</p>
            ) : (
              <ul className="change-list">
                {evalChanged.map((r) => (
                  <li key={r.id}>
                    <Mono>{r.id}</Mono>
                    <span>
                      {r.status}
                      {r.falseCancel ? ' (false cancel)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
