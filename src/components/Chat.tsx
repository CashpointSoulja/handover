import { Fragment, useEffect, useMemo, useRef } from 'react';
import { money, runPayment, type Reply } from '../../engine/index';
import type { ChatMessage, Config, DecisionResult, Evidence, HouseholdData, MemberMessage } from '../../engine/types';
import { proposals } from '../data';
import { label } from './Queue';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
const time = (iso: string) => iso.slice(11, 16);

interface Item {
  key: string;
  at: string;
  out: boolean; // sent by the member
  text: string;
  about: string[];
  sourceId?: string;
  buttons?: MemberMessage['buttons'];
  active?: boolean;
  system?: string;
}

function Ticks() {
  return (
    <svg className="ticks" viewBox="0 0 16 11" width="16" height="11" aria-label="Read">
      <path d="M11.07.65 4.98 7.12 2.4 4.4l-.93.98 3.51 3.7L12 1.63z M15.07.65 8.98 7.12l-.83-.87-.93.98 1.76 1.85L16 1.63z" fill="currentColor" />
    </svg>
  );
}

export function Chat({
  data,
  result,
  payments,
  config,
  replies,
  highlight,
  onReply,
  onReset,
}: {
  data: HouseholdData;
  result: DecisionResult;
  payments: DecisionResult[];
  config: Config;
  replies: Reply[];
  highlight: Evidence | null;
  onReply: (r: Reply) => void;
  onReset: () => void;
}) {
  const pid = result.payment.id;
  const others = replies.filter((r) => r.payment !== pid);
  const mine = replies.filter((r) => r.payment === pid);

  const items = useMemo(() => {
    const out: Item[] = data.chat.map((m: ChatMessage) => ({ key: m.id, sourceId: m.id, at: m.at, out: m.from === 'member', text: m.text, about: m.about ?? [] }));
    const asOf = data.household.asOf;
    for (let i = 0; i <= mine.length; i++) {
      if (i > 0) {
        out.push({ key: `reply-${i}`, at: `${asOf}T12:${String(i * 2).padStart(2, '0')}:00`, out: true, text: mine[i - 1].label, about: [pid] });
        if (!mine[i - 1].signal) break; // a reply that only records an answer; nothing to re-run
      }
      const step = runPayment(data, config, proposals, pid, { replies: [...others, ...mine.slice(0, i)] })!;
      const at = i === 0 ? `${asOf}T09:00:00` : `${asOf}T12:${String(i * 2 + 1).padStart(2, '0')}:00`;
      if (step.message) out.push({ key: `decision-${i}`, at, out: false, text: step.message.text, about: [pid], buttons: step.message.buttons, active: i === mine.length });
      else out.push({ key: `decision-${i}`, at, out: false, text: '', about: [pid], system: step.decision === 'LEAVE' ? 'No message: LEAVE sends nothing' : 'No message yet: waiting on a recorded proposal' });
    }
    return out;
  }, [data, config, pid, JSON.stringify(replies)]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [items]);

  const lit = new Set(highlight?.messages ?? []);
  const PER = { weekly: '/wk', monthly: '/mo', annual: '/yr' } as const;
  const aboutLabel = (id: string) => {
    const r = payments.find((x) => x.payment.id === id);
    return r ? `${label(r)} ${money(r.payment.amount)}${PER[r.payment.cadence]}` : id;
  };
  let lastDay = '';
  let lastSide: boolean | null = null;

  return (
    <div className="wa">
      <div className="wa-head">
        <span className="wa-avatar" aria-hidden="true">
          n
        </span>
        <span className="wa-name">Nous</span>
        {mine.length > 0 && (
          <button className="wa-reset" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
      <div className="wa-body" ref={scroller}>
        {items.map((it) => {
          const day = it.at.slice(0, 10);
          const showDay = day !== lastDay;
          lastDay = day;
          if (it.system) {
            lastSide = null;
            return (
              <Fragment key={it.key}>
                {showDay && <div className="wa-day">{longDate(day)}</div>}
                <div className="wa-system">{it.system}</div>
              </Fragment>
            );
          }
          const tail = showDay || lastSide !== it.out;
          lastSide = it.out;
          return (
            <Fragment key={it.key}>
              {showDay && <div className="wa-day">{longDate(day)}</div>}
              <div className={`wa-row ${it.out ? 'out' : 'in'} ${it.about.length && !it.about.includes(pid) ? 'other' : ''}`}>
                <div className={`wa-msg ${tail ? 'tail' : ''}`}>
                  <div className={`wa-bubble ${it.sourceId && lit.has(it.sourceId) ? 'lit' : ''}`}>
                    <span className="wa-text">{it.text}</span>
                    <span className="wa-meta">
                      {time(it.at)}
                      {it.out && <Ticks />}
                    </span>
                  </div>
                  {it.about.length > 0 && (
                    <div className={`wa-about ${it.about.includes(pid) ? 'this' : ''}`}>
                      About {it.about.map(aboutLabel).join(' and ')}
                    </div>
                  )}
                  {it.buttons && it.buttons.length > 0 && (
                    <div className="wa-buttons">
                      {it.buttons.map((b) => (
                        <button
                          key={b.label}
                          disabled={!it.active}
                          onClick={() => onReply({ payment: pid, label: b.label, signal: b.signal })}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                            <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" fill="currentColor" />
                          </svg>
                          {b.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
