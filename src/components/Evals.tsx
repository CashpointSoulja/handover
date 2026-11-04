import { useMemo, useState } from 'react';
import type { Config } from '../../engine/types';
import { CATEGORY_LABELS, diffResults, runEval, type CaseResult, type Metrics } from '../../evals/score';
import type { Selection } from '../App';
import { cases, households, lastCliRun, proposals } from '../data';
import { DecisionBadge, Mono } from '../ui';

type Run = ReturnType<typeof runEval>;

export function Headline({ m, asks }: { m: Metrics; asks?: Run['asks'] }) {
  const gate = m.gate === 'red' ? 'bad' : m.gate === 'green' ? 'ok' : 'wait';
  return (
    <div className="headline">
      <div className={`stat gate gate-${gate}`}>
        <span className="stat-label">False cancels</span>
        <span className="stat-value num">{m.falseCancels}</span>
        <span className="stat-note">{m.gate === 'red' ? 'Gate failed' : m.gate === 'green' ? 'Gate passed' : `${m.pending} cases pending`}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Decision accuracy</span>
        <span className="stat-value num">{m.decisionAccuracy === null ? 'n/a' : `${m.decisionAccuracy}%`}</span>
        <span className="stat-note">of {m.scored} scored</span>
      </div>
      <div className="stat">
        <span className="stat-label">Attribution accuracy</span>
        <span className="stat-value num">{m.attributionAccuracy === null ? 'n/a' : `${m.attributionAccuracy}%`}</span>
        <span className="stat-note">of {m.scored} scored</span>
      </div>
      <div className="stat">
        <span className="stat-label">Weighted cost</span>
        <span className="stat-value num">{m.weightedCost}</span>
        <span className="stat-note">lower is better</span>
      </div>
      {asks && (
        <div className="stat">
          <span className="stat-label">Asks per household</span>
          <span className="stat-value num">{asks.value}</span>
          <span className="stat-note">{asks.pending ? `${asks.pending} decisions pending` : `${asks.asks} asks`}</span>
        </div>
      )}
    </div>
  );
}

function CaseTable({ rows, onOpen }: { rows: CaseResult[]; onOpen: (s: Selection) => void }) {
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');
  const shown = rows.filter((r) => (cat === 'all' || r.category === cat) && (status === 'all' || r.status === status));
  return (
    <>
      <div className="filters">
        <label>
          Category{' '}
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Result{' '}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="pending">Pending</option>
          </select>
        </label>
        <span className="muted num">{shown.length} cases</span>
      </div>
      <div className="table-wrap">
        <table className="grid cases">
          <thead>
            <tr>
              <th>Case</th>
              <th>Category</th>
              <th>Payment</th>
              <th>Mode</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Result</th>
              <th className="r">Weight</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={r.falseCancel ? 'false-cancel' : ''}>
                <td>
                  <Mono>{r.id}</Mono>
                </td>
                <td>{CATEGORY_LABELS[r.category] ?? r.category}</td>
                <td>
                  <button className="link" onClick={() => onOpen({ hid: r.household, pid: r.payment })}>
                    <Mono>
                      {r.household}/{r.payment}
                    </Mono>
                  </button>
                </td>
                <td>{r.mode}</td>
                <td>
                  <DecisionBadge decision={r.expected.decision} /> <Mono>{r.expected.decided_by}</Mono>
                </td>
                <td>
                  <DecisionBadge decision={r.decision} /> <Mono>{r.decidedBy ?? ''}</Mono>
                </td>
                <td className={`res res-${r.status}`}>
                  {r.status === 'pass' ? 'Pass' : r.status === 'fail' ? (r.falseCancel ? 'False cancel' : 'Fail') : 'Pending'}
                  {r.missingAttachments.length > 0 && r.status !== 'pending' && <span className="muted"> · missing {r.missingAttachments.join(', ')}</span>}
                </td>
                <td className="r num">{r.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Evals({ main, held, config, onOpen }: { main: Run; held: Run; config: Config; onOpen: (s: Selection) => void }) {
  const [tab, setTab] = useState<'cases' | 'heldout' | 'diff'>('cases');
  const [previous, setPrevious] = useState<{ cases: CaseResult[]; metrics: Metrics; label: string } | null>(
    lastCliRun ? { cases: lastCliRun.cases, metrics: lastCliRun.metrics, label: `CLI run ${lastCliRun.run_at.slice(0, 16).replace('T', ' ')} UTC` } : null,
  );
  const [rerun, setRerun] = useState<{ run: Run; ms: number; base: Run } | null>(null);
  // A rule toggle produces a new live result; a manual re-run only stands until then.
  const current = rerun && rerun.base === main ? rerun.run : main;

  const runNow = () => {
    const t0 = performance.now();
    const next = runEval(cases, households, config, proposals);
    const ms = performance.now() - t0;
    setPrevious({ cases: current.results, metrics: current.metrics, label: 'the previous run in this browser' });
    setRerun({ run: next, ms, base: main });
  };
  const diff = useMemo(() => (previous ? diffResults(previous.cases, current.results) : []), [previous, current]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Evals</h1>
        <button className="primary" onClick={runNow}>
          Run evals
        </button>
        {rerun && rerun.base === main && <span className="muted num">Re-scored {current.results.length} cases in {rerun.ms.toFixed(0)} ms</span>}
      </div>
      <Headline m={tab === 'heldout' ? held.metrics : current.metrics} asks={tab === 'heldout' ? undefined : current.asks} />
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={tab === 'cases'} onClick={() => setTab('cases')}>
          40 cases
        </button>
        <button role="tab" aria-selected={tab === 'heldout'} onClick={() => setTab('heldout')}>
          Held-out
        </button>
        <button role="tab" aria-selected={tab === 'diff'} onClick={() => setTab('diff')}>
          Diff
        </button>
      </div>
      {tab === 'cases' && <CaseTable rows={current.results} onOpen={onOpen} />}
      {tab === 'heldout' && (
        <>
          <p className="muted note">10 cases written by the author after the rules were frozen at rules-v1. Not independent. Scored separately.</p>
          <CaseTable rows={held.results} onOpen={onOpen} />
        </>
      )}
      {tab === 'diff' && (
        <div className="diff">
          {previous ? (
            <>
              <p className="muted">
                Against {previous.label}. Weighted cost {previous.metrics.weightedCost} → {current.metrics.weightedCost}.
              </p>
              {diff.length === 0 ? (
                <p>No case changed.</p>
              ) : (
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <Mono>{d.id}</Mono>
                        </td>
                        <td>{d.before}</td>
                        <td>{d.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="muted">No previous run.</p>
          )}
        </div>
      )}
    </div>
  );
}
