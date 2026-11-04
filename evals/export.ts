/**
 * npm run eval:export -- --pass 1     write the classifier requests for every missing base proposal
 * npm run eval:export -- --pass 2     the same for reply branches (needs pass 1 imported first)
 * Options: --batch 25 (most blocks per chat message; batches are split evenly), --out <path>, --only H1
 *
 * Output: /tmp/proposal-requests-pass<N>.md, plus a .json manifest of each key's input hash so
 * eval:import can reject an answer whose input has changed since it was exported.
 *
 * The file holds the exact SYSTEM_PROMPT once, then one block per request: a KEY line and the
 * exact user prompt eval:live would send. Each batch starts with one line asking for answers in
 * the import format: the KEY line, then the JSON object.
 */
import { writeFileSync } from 'node:fs';
import { pendingRequests, PROMPT_VERSION, SYSTEM_PROMPT } from './proposals-io';

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const pass = Number(arg('--pass') ?? 1) as 1 | 2;
if (pass !== 1 && pass !== 2) {
  console.error('--pass must be 1 or 2');
  process.exit(1);
}
const maxBatch = Number(arg('--batch') ?? 25);
const out = arg('--out') ?? `/tmp/proposal-requests-pass${pass}.md`;

let reqs;
try {
  reqs = pendingRequests(pass, { only: arg('--only') });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
if (!reqs.length) {
  console.log(`Pass ${pass}: nothing to export; every proposal is recorded.`);
  process.exit(0);
}

const count = Math.ceil(reqs.length / maxBatch);
const size = Math.ceil(reqs.length / count);
const batches: (typeof reqs)[] = [];
for (let i = 0; i < reqs.length; i += size) batches.push(reqs.slice(i, i + size));

const ANSWER_LINE =
  'Answer every block below. For each one, write its KEY line exactly as given, then on the next line the JSON object only. No other text.';

const parts = [
  `HANDOVER CLASSIFIER REQUESTS · PASS ${pass} · ${reqs.length} REQUESTS IN ${batches.length} BATCHES · ${PROMPT_VERSION}`,
  '',
  '===== SYSTEM PROMPT (send once, before batch 1) =====',
  SYSTEM_PROMPT,
  ...batches.flatMap((b, i) => [
    '',
    `===== BATCH ${i + 1} OF ${batches.length} (send as one message) =====`,
    ANSWER_LINE,
    ...b.flatMap((r) => ['', `KEY ${r.key}`, r.user]),
  ]),
  '',
];
writeFileSync(out, parts.join('\n'));
writeFileSync(
  out.replace(/\.md$/, '') + '.json',
  JSON.stringify({ pass, prompt_version: PROMPT_VERSION, exported_at: new Date().toISOString(), requests: Object.fromEntries(reqs.map((r) => [r.key, r.inputHash])) }, null, 2) + '\n',
);
console.log(`Pass ${pass}: ${reqs.length} requests in ${batches.length} batches.`);
console.log(out);
