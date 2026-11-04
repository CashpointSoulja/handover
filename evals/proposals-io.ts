// Shared by eval:live, eval:export and eval:import: which proposals are still needed, the exact
// prompt each one gets, and how a recorded proposal is written to fixtures/proposals.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { PROMPT_VERSION, proposalInput, replyMessages, runHousehold, SYSTEM_PROMPT, userPrompt, type ProposalStore } from '../engine/index';
import { loadConfig, loadHouseholds, loadProposals, ROOT } from '../engine/load-node';
import type { Config, HouseholdData, Proposal, RecordedProposal } from '../engine/types';
import { requiredProposals, type RequiredProposal } from './required';
import type { EvalCase } from './score';

export { SYSTEM_PROMPT, PROMPT_VERSION };

export interface PromptRequest extends RequiredProposal {
  user: string;
}

export function loadAllCases(): EvalCase[] {
  return ['evals/cases', 'evals/heldout'].flatMap((dir) =>
    existsSync(join(ROOT, dir))
      ? readdirSync(join(ROOT, dir))
          .filter((f) => f.endsWith('.yaml'))
          .sort()
          .map((f) => parse(readFileSync(join(ROOT, dir, f), 'utf8')) as EvalCase)
      : [],
  );
}

function promptFor(data: HouseholdData, req: RequiredProposal, config: Config, proposals: ProposalStore): string {
  const replies = req.reply ? [req.reply] : [];
  const result = runHousehold(data, config, proposals, { replies }).find((r) => r.payment.id === req.payment)!;
  return userPrompt(proposalInput(data, result.payment, [...data.chat, ...replyMessages(data, replies)]));
}

/**
 * Every proposal the product needs, with its current status and exact user prompt.
 * Pass 1: one per recurring payment. Pass 2: reply branches, which only exist once pass 1 is recorded.
 */
export function allRequests(only: string | null = null): PromptRequest[] {
  const config = loadConfig();
  const households = loadHouseholds().filter((h) => !only || h.household.id === only);
  const cases = loadAllCases().filter((c) => !only || c.household === only);
  const proposals = loadProposals();
  return requiredProposals(households, config, proposals, cases).map((req) => ({
    ...req,
    user: promptFor(households.find((h) => h.household.id === req.household)!, req, config, proposals),
  }));
}

export function pendingRequests(pass: 1 | 2, opts: { force?: boolean; only?: string | null } = {}): PromptRequest[] {
  const all = allRequests(opts.only ?? null);
  if (pass === 2) {
    const base = all.filter((r) => r.branch === null && r.status !== 'recorded');
    if (base.length) throw new Error(`Pass 1 is not complete: ${base.length} base proposal(s) still missing or stale. Import pass 1 first.`);
  }
  return all.filter((r) => (pass === 1 ? r.branch === null : r.branch !== null) && (opts.force || r.status !== 'recorded'));
}

export function proposalPath(req: Pick<RequiredProposal, 'household' | 'payment' | 'branch'>): string {
  return join(ROOT, 'fixtures/proposals', req.household, `${req.payment}${req.branch ? `@${req.branch}` : ''}.json`);
}

/** Write one recorded proposal. The input hash is the one the engine computes for the current data. */
export function writeRecorded(
  req: RequiredProposal,
  proposal: Proposal,
  meta: { model: string; source: 'live-api' | 'chat-recorded'; runAt?: string },
): string {
  const recorded: RecordedProposal = {
    meta: {
      model: meta.model,
      run_at: meta.runAt ?? new Date().toISOString(),
      prompt_version: PROMPT_VERSION,
      input_hash: req.inputHash,
      household: req.household,
      payment: req.payment,
      branch: req.branch,
      source: meta.source,
    },
    proposal,
  };
  const file = proposalPath(req);
  mkdirSync(join(ROOT, 'fixtures/proposals', req.household), { recursive: true });
  writeFileSync(file, JSON.stringify(recorded, null, 2) + '\n');
  return file;
}

/** A KEY line: "KEY H1/apple_bill_999", tolerating markdown wrappers such as **, ###, ` or ===. */
const KEY_LINE = /^[\s>#*=`_-]*(?:KEY\s*:?\s*)?(H\d+\/[a-z0-9_]+(?:@[a-z0-9_-]+)?)[\s*=`_-]*$/i;

export interface Answer {
  key: string;
  body: string;
  line: number;
}

/** Split a pasted chat reply into answers: each KEY line, then everything up to the next KEY line. */
export function splitAnswers(text: string): Answer[] {
  const out: Answer[] = [];
  let cur: { key: string; body: string[]; line: number } | null = null;
  const flush = () => {
    if (cur) out.push({ key: cur.key, body: cur.body.join('\n'), line: cur.line });
  };
  text.split(/\r?\n/).forEach((l, i) => {
    const m = l.match(KEY_LINE);
    if (m) {
      flush();
      cur = { key: m[1], body: [], line: i + 1 };
    } else if (cur) cur.body.push(l);
  });
  flush();
  return out;
}
