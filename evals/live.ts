/**
 * npm run eval:live   re-run the classifier against a real model and write proposal fixtures.
 *
 * Needs a local key. Never run in CI or the browser.
 *   LLM_BASE_URL   chat-completions-compatible endpoint base, e.g. https://example.com/v1
 *   LLM_API_KEY    key for that endpoint
 *   LLM_MODEL      model id to request
 * Flags: --force (re-record even when a proposal matches its input), --only H1 (one household)
 *
 * Each proposal is saved to fixtures/proposals/<household>/<payment>[@<branch>].json with the
 * run date, model id, prompt version and the hash of the exact input it saw.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { parseProposal, PROMPT_VERSION, proposalInput, runHousehold, SYSTEM_PROMPT, userPrompt, replyMessages } from '../engine/index';
import { loadConfig, loadHouseholds, loadProposals, ROOT } from '../engine/load-node';
import type { RecordedProposal } from '../engine/types';
import { requiredProposals } from './required';
import type { EvalCase } from './score';

const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, CI } = process.env;
if (CI) {
  console.error('eval:live never runs in CI.');
  process.exit(1);
}
if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
  console.error('Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL to run the classifier against a real model.');
  process.exit(1);
}
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const config = loadConfig();
const households = loadHouseholds().filter((h) => !only || h.household.id === only);
const cases = ['evals/cases', 'evals/heldout'].flatMap((dir) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parse(readFileSync(join(ROOT, dir, f), 'utf8')) as EvalCase),
);

async function classify(system: string, user: string): Promise<{ text: string; model: string }> {
  const res = await fetch(`${LLM_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0,
      max_tokens: 400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.json();
  return { text: body.choices?.[0]?.message?.content ?? '', model: body.model ?? LLM_MODEL! };
}

// Two passes: base proposals first (branches depend on base decisions), then reply branches.
for (const pass of [1, 2]) {
  const proposals = loadProposals();
  const todo = requiredProposals(households, config, proposals, cases.filter((c) => !only || c.household === only)).filter(
    (r) => (pass === 1 ? r.branch === null : r.branch !== null) && (force || r.status !== 'recorded'),
  );
  console.log(`Pass ${pass}: ${todo.length} proposal${todo.length === 1 ? '' : 's'} to record`);
  for (const req of todo) {
    const data = households.find((h) => h.household.id === req.household)!;
    const replies = req.reply ? [req.reply] : [];
    const result = runHousehold(data, config, proposals, { replies }).find((r) => r.payment.id === req.payment)!;
    const chat = [...data.chat, ...replyMessages(data, replies)];
    const input = proposalInput(data, result.payment, chat);
    let recorded: RecordedProposal | null = null;
    for (let attempt = 1; attempt <= 2 && !recorded; attempt++) {
      try {
        const { text, model } = await classify(SYSTEM_PROMPT, userPrompt(input));
        recorded = {
          meta: {
            model,
            run_at: new Date().toISOString(),
            prompt_version: PROMPT_VERSION,
            input_hash: result.proposalInputHash,
            household: req.household,
            payment: req.payment,
            branch: req.branch,
          },
          proposal: parseProposal(text),
        };
      } catch (e) {
        console.error(`  ${req.key}: attempt ${attempt} failed: ${(e as Error).message}`);
      }
    }
    if (!recorded) continue;
    const dir = join(ROOT, 'fixtures/proposals', req.household);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${req.payment}${req.branch ? `@${req.branch}` : ''}.json`);
    writeFileSync(file, JSON.stringify(recorded, null, 2) + '\n');
    console.log(`  ${req.key}: ${recorded.proposal.proposedAction} (${recorded.proposal.confidence})`);
  }
}
console.log('Done. Run npm run eval to score.');
