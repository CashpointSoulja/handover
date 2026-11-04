import { useCallback, useEffect, useMemo, useState } from 'react';
import { runHousehold, withRuleToggles, type Reply } from '../engine/index';
import type { DecisionResult, Evidence } from '../engine/types';
import { runEval } from '../evals/score';
import { Chat } from './components/Chat';
import { Evals } from './components/Evals';
import { Queue } from './components/Queue';
import { Rules } from './components/Rules';
import { Trace } from './components/Trace';
import { baseConfig, cases, heldout, households, proposals } from './data';
import wordmark from './assets/wordmark.svg';

type View = 'console' | 'evals' | 'rules';
type Pane = 'queue' | 'trace' | 'chat';
export interface Selection {
  hid: string;
  pid: string;
}

const DEFAULT: Selection = { hid: 'H1', pid: 'apple_bill_999' };
const toHash = (s: Selection) => `#${s.hid.toLowerCase()}-${s.pid.replace(/_/g, '-')}`;

function fromHash(hash: string): { view: View; sel?: Selection } {
  const h = hash.replace(/^#/, '').toLowerCase();
  if (h === 'evals') return { view: 'evals' };
  if (h === 'rules') return { view: 'rules' };
  const [hh, ...rest] = h.split('-');
  const data = households.find((x) => x.household.id.toLowerCase() === hh);
  if (!data || !rest.length) return { view: 'console' };
  const ids = runHousehold(data, baseConfig, proposals).map((r) => r.payment.id);
  const exact = ids.find((id) => id === rest.join('_'));
  const loose = ids.find((id) => rest.every((t) => id.split('_').includes(t)));
  const pid = exact ?? loose;
  return pid ? { view: 'console', sel: { hid: data.household.id, pid } } : { view: 'console' };
}

const allOn = Object.fromEntries(baseConfig.rules.map((r) => [r.id, r.enabled]));

export function App() {
  const initial = fromHash(location.hash);
  const [view, setView] = useState<View>(initial.view);
  const [sel, setSel] = useState<Selection>(initial.sel ?? DEFAULT);
  const [pane, setPane] = useState<Pane>('trace');
  const [toggles, setToggles] = useState<Record<string, boolean>>(allOn);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [hover, setHover] = useState<Evidence | null>(null);

  useEffect(() => {
    const onHash = () => {
      const r = fromHash(location.hash);
      setView(r.view);
      if (r.sel) setSel(r.sel);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((v: View, s?: Selection) => {
    setView(v);
    if (s) setSel(s);
    const hash = v === 'console' ? toHash(s ?? sel) : `#${v}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }, [sel]);

  const config = useMemo(() => withRuleToggles(baseConfig, toggles), [toggles]);
  const results = useMemo(
    () => Object.fromEntries(households.map((h) => [h.household.id, runHousehold(h, config, proposals, { replies: replies[h.household.id] ?? [] })])) as Record<string, DecisionResult[]>,
    [config, replies],
  );
  const baseline = useMemo(
    () => Object.fromEntries(households.map((h) => [h.household.id, runHousehold(h, baseConfig, proposals)])) as Record<string, DecisionResult[]>,
    [],
  );
  const evalNow = useMemo(() => ({ main: runEval(cases, households, config, proposals), held: runEval(heldout, households, config, proposals) }), [config]);
  const evalBase = useMemo(() => runEval(cases, households, baseConfig, proposals), []);

  const data = households.find((h) => h.household.id === sel.hid)!;
  const current = results[sel.hid].find((r) => r.payment.id === sel.pid) ?? results[sel.hid][0];

  const select = (s: Selection) => {
    setHover(null);
    go('console', s);
    setPane('trace');
  };
  const reply = (r: Reply) => setReplies((prev) => ({ ...prev, [sel.hid]: [...(prev[sel.hid] ?? []), r] }));
  const resetReplies = () =>
    setReplies((prev) => ({ ...prev, [sel.hid]: (prev[sel.hid] ?? []).filter((r) => r.payment !== sel.pid) }));

  const tabs: [string, () => void, boolean][] = [
    ['Queue', () => (go('console'), setPane('queue')), view === 'console' && pane === 'queue'],
    ['Trace', () => (go('console'), setPane('trace')), view === 'console' && pane === 'trace'],
    ['Chat', () => (go('console'), setPane('chat')), view === 'console' && pane === 'chat'],
    ['Evals', () => go('evals'), view === 'evals'],
    ['Rules', () => go('rules'), view === 'rules'],
  ];

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img className="wordmark" src={wordmark} alt="nous" width={64} height={16} />
          <span className="product">Handover</span>
          <span className="sample-line">Sample households and transactions, hand-built for this concept.</span>
        </div>
        <nav className="views" aria-label="Views">
          <button className={view === 'console' ? 'on' : ''} onClick={() => go('console')}>Console</button>
          <button className={view === 'evals' ? 'on' : ''} onClick={() => go('evals')}>Evals</button>
          <button className={view === 'rules' ? 'on' : ''} onClick={() => go('rules')}>Rules</button>
        </nav>
      </header>
      <nav className="mobile-tabs" aria-label="Sections">
        {tabs.map(([label, onClick, on]) => (
          <button key={label} className={on ? 'on' : ''} onClick={onClick}>
            {label}
          </button>
        ))}
      </nav>

      <main className={`body view-${view} pane-${pane}`}>
        {view === 'console' && (
          <div className="console">
            <section className="col col-queue" aria-label="Queue">
              <Queue results={results} selected={sel} onSelect={select} />
            </section>
            <section className="col col-trace" aria-label="Decision trace">
              <Trace data={data} result={current} config={config} hover={hover} onHover={setHover} />
            </section>
            <section className="col col-chat" aria-label="WhatsApp">
              <Chat data={data} result={current} config={config} replies={(replies[sel.hid] ?? [])} highlight={hover} onReply={reply} onReset={resetReplies} />
            </section>
          </div>
        )}
        {view === 'evals' && <Evals main={evalNow.main} held={evalNow.held} config={config} onOpen={select} />}
        {view === 'rules' && (
          <Rules
            config={config}
            toggles={toggles}
            onToggle={(id, on) => setToggles((t) => ({ ...t, [id]: on }))}
            onReset={() => setToggles(allOn)}
            results={results}
            baseline={baseline}
            evalNow={evalNow.main}
            evalBase={evalBase}
            onOpen={select}
          />
        )}
      </main>
      <footer className="foot">An independent concept by Ayo Ahmed. Not affiliated with Nous.</footer>
    </div>
  );
}
