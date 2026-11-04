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
 * run date, the model id the endpoint reports, the prompt version, the hash of the exact input it
 * saw, and source: live-api. Without a key, use eval:export and eval:import instead.
 */
import { parseProposal } from '../engine/index';
import { pendingRequests, SYSTEM_PROMPT, writeRecorded } from './proposals-io';

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

async function classify(user: string): Promise<{ text: string; model: string }> {
  const res = await fetch(`${LLM_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0,
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.json();
  return { text: body.choices?.[0]?.message?.content ?? '', model: body.model ?? LLM_MODEL! };
}

// Two passes: base proposals first (reply branches depend on base decisions), then branches.
for (const pass of [1, 2] as const) {
  const todo = pendingRequests(pass, { force, only });
  console.log(`Pass ${pass}: ${todo.length} proposal${todo.length === 1 ? '' : 's'} to record`);
  for (const req of todo) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { text, model } = await classify(req.user);
        const proposal = parseProposal(text);
        writeRecorded(req, proposal, { model, source: 'live-api' });
        console.log(`  ${req.key}: ${proposal.proposedAction} (${proposal.confidence})`);
        break;
      } catch (e) {
        console.error(`  ${req.key}: attempt ${attempt} failed: ${(e as Error).message}`);
      }
    }
  }
}
console.log('Done. Run npm run eval to score.');
