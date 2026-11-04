import { CAP_RANK, isCapLevel, NEEDS_PROPOSAL, RULES, type RuleContext } from './rules';
import type { Attachment, CapLevel, Decision, FiredRule, RuleId } from './types';

export interface GateResult {
  fired: FiredRule[];
  notFired: RuleId[];
  notReached: RuleId[];
  waiting: RuleId[];
  disabled: RuleId[];
  ceiling: CapLevel | null;
  decision: Decision | null;
  decidedBy: 'llm' | RuleId | null;
  attachments: Attachment[];
}

/**
 * Run the ruleset in order, then combine it with the proposal.
 * - A terminal rule sets the decision and stops evaluation.
 * - A cap rule sets the most autonomous decision still allowed; the final decision is the
 *   proposal lowered to the strictest cap. Order: CANCEL > FLAG > ASK > HUMAN.
 * - An attach rule adds a side action without changing the decision.
 * A cap "binds" when the decision sits at that cap; decidedBy names the first rule that set it.
 * No rule and no proposal can raise a decision above its cap.
 */
export function gate(ctx: RuleContext): GateResult {
  const out: GateResult = {
    fired: [],
    notFired: [],
    notReached: [],
    waiting: [],
    disabled: [],
    ceiling: null,
    decision: null,
    decidedBy: null,
    attachments: [],
  };
  let stopped = false;
  for (const rule of ctx.config.rules) {
    const enabled = rule.enabled || rule.locked;
    if (!enabled) {
      out.disabled.push(rule.id);
      continue;
    }
    if (stopped) {
      out.notReached.push(rule.id);
      continue;
    }
    const fn = RULES[rule.id];
    if (!fn) throw new Error(`No implementation for ${rule.id}`);
    const res = fn(ctx, rule);
    if (res === NEEDS_PROPOSAL) {
      out.waiting.push(rule.id);
      continue;
    }
    if (!res) {
      out.notFired.push(rule.id);
      continue;
    }
    out.fired.push({ id: rule.id, type: rule.type, ...res });
    if (rule.type === 'terminal') {
      out.decision = res.effect;
      out.decidedBy = rule.id;
      stopped = true;
    }
  }

  const seen = new Set<string>();
  for (const f of out.fired) {
    for (const a of f.attachments) {
      const k = `${a.kind}|${a.value ?? ''}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.attachments.push(a);
      }
    }
  }
  if (stopped) return out;

  const caps = out.fired.filter((f) => f.type !== 'terminal' && isCapLevel(f.effect));
  for (const c of caps) {
    const level = c.effect as CapLevel;
    if (!out.ceiling || CAP_RANK[level] < CAP_RANK[out.ceiling]) out.ceiling = level;
  }

  if (!ctx.proposal) return out; // pending: no recorded proposal to lower

  const proposed = ctx.proposal.proposedAction;
  if (out.ceiling && isCapLevel(proposed) && CAP_RANK[out.ceiling] <= CAP_RANK[proposed]) {
    out.decision = out.ceiling;
    out.decidedBy = caps.find((c) => c.effect === out.ceiling)!.id;
  } else {
    out.decision = proposed;
    out.decidedBy = 'llm';
  }

  // Manual mode is never auto-cancelled, whatever the toggles say.
  if (ctx.mode === 'manual' && out.decision === 'CANCEL') {
    out.decision = 'FLAG';
    out.decidedBy = 'R04';
  }
  return out;
}
