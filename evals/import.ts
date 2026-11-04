/**
 * npm run eval:import -- <file> --model "<model label>" [--source chat-recorded] [--force] [--dry-run]
 *
 * Reads answers in the export format: a KEY line (e.g. "KEY H1/apple_bill_999"), then the raw
 * JSON object the classifier prompt asks for. Each answer goes through parseProposal and is
 * written to fixtures/proposals/<household>/<payment>[@branch].json with:
 *   model          the label passed with --model, verbatim (required; never guessed)
 *   run_at         the time of this import
 *   prompt_version, input_hash   exactly as eval:live records them
 *   source         chat-recorded (default) or live-api
 * Malformed answers, unknown keys, duplicates, already-recorded keys (without --force) and keys
 * whose input changed since export are rejected loudly, and the command exits non-zero.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseProposal } from '../engine/index';
import { allRequests, splitAnswers, writeRecorded } from './proposals-io';

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const file = args.find((a, i) => !a.startsWith('--') && !['--model', '--source'].includes(args[i - 1]));
const model = arg('--model');
const source = (arg('--source') ?? 'chat-recorded') as 'chat-recorded' | 'live-api';
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

if (!file || !existsSync(file)) {
  console.error('Usage: npm run eval:import -- <answers file> --model "<model label>"');
  process.exit(1);
}
if (!model || !model.trim()) {
  console.error('--model is required: pass the model label exactly as it should be recorded.');
  process.exit(1);
}
if (source !== 'chat-recorded' && source !== 'live-api') {
  console.error('--source must be chat-recorded or live-api');
  process.exit(1);
}

// Input hashes recorded at export time, when the manifest is still around.
const manifests: Record<string, string> = {};
for (const pass of [1, 2]) {
  const m = `/tmp/proposal-requests-pass${pass}.json`;
  if (existsSync(m)) Object.assign(manifests, JSON.parse(readFileSync(m, 'utf8')).requests);
}

const requests = new Map(allRequests().map((r) => [r.key, r]));
const answers = splitAnswers(readFileSync(file, 'utf8'));
const seen = new Set<string>();
const errors: string[] = [];
let written = 0;
const runAt = new Date().toISOString();

for (const a of answers) {
  const where = `${a.key} (line ${a.line})`;
  if (seen.has(a.key)) {
    errors.push(`${where}: duplicate key`);
    continue;
  }
  seen.add(a.key);
  const req = requests.get(a.key);
  if (!req) {
    errors.push(`${where}: unknown key; not a proposal the product needs right now (for a reply branch, import pass 1 first)`);
    continue;
  }
  if (req.status === 'recorded' && !force) {
    errors.push(`${where}: already recorded; use --force to replace it`);
    continue;
  }
  if (manifests[a.key] && manifests[a.key] !== req.inputHash) {
    errors.push(`${where}: input changed since export (hash ${manifests[a.key]} → ${req.inputHash}); export again`);
    continue;
  }
  let proposal;
  try {
    proposal = parseProposal(a.body);
  } catch (e) {
    errors.push(`${where}: malformed answer: ${(e as Error).message}`);
    continue;
  }
  if (dryRun) console.log(`  would write ${a.key}: ${proposal.proposedAction} (${proposal.confidence}), input_hash ${req.inputHash}`);
  else writeRecorded(req, proposal, { model, source, runAt });
  written++;
}

const exported = Object.keys(manifests).filter((k) => requests.get(k)?.status !== 'recorded' && !seen.has(k));
console.log(`${dryRun ? 'Dry run: would import' : 'Imported'} ${written} of ${answers.length} answer(s) from ${file}.`);
if (exported.length) console.log(`Still missing from the export: ${exported.length} (${exported.slice(0, 8).join(', ')}${exported.length > 8 ? ', …' : ''})`);
if (!answers.length) errors.push('No KEY lines found. Each answer must start with a line like "KEY H1/apple_bill_999".');
if (errors.length) {
  console.error(`\nREJECTED ${errors.length}:`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
