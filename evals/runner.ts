/**
 * npm run eval                       replay recorded proposals, score the 40 cases and the held-out set,
 *                                    write evals/results/<timestamp>.json and docs/test-results.md
 * npm run eval -- --compare <file>   also print the per-case diff against a previous result, and fail
 *                                    if weighted cost went up
 * npm run eval -- --no-unit          skip running the unit tests
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { runHousehold } from '../engine/index';
import { loadConfig, loadHouseholds, loadProposals, ROOT } from '../engine/load-node';
import { requiredProposals } from './required';
import { CATEGORY_LABELS, decisionCounts, diffResults, runEval, type CaseResult, type EvalCase } from './score';

const args = process.argv.slice(2);
const compareTo = args.includes('--compare') ? args[args.indexOf('--compare') + 1] : null;
const withUnit = !args.includes('--no-unit');

const loadCases = (dir: string): EvalCase[] => {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => parse(readFileSync(join(full, f), 'utf8')) as EvalCase);
};

const config = loadConfig();
const households = loadHouseholds();
const proposals = loadProposals();
const cases = loadCases('evals/cases');
const heldout = loadCases('evals/heldout');

const main = runEval(cases, households, config, proposals);
const held = heldout.length ? runEval(heldout, households, config, proposals) : null;
const required = requiredProposals(households, config, proposals, [...cases, ...heldout]);
const counts = decisionCounts(households, config, proposals);

// Rule coverage on the base data: which households each rule fired in.
const coverage: Record<string, string[]> = Object.fromEntries(config.rules.map((r) => [r.id, []]));
for (const h of households) {
  for (const r of runHousehold(h, config, proposals)) {
    for (const f of r.fired) if (!coverage[f.id].includes(h.household.id)) coverage[f.id].push(h.household.id);
  }
}

interface UnitSummary {
  total: number;
  passed: number;
  failed: number;
  files: { name: string; passed: number; failed: number }[];
}
let unit: UnitSummary | null = null;
if (withUnit) {
  let raw = '';
  try {
    raw = execSync('npx vitest run --reporter=json', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    raw = (e as { stdout?: string }).stdout ?? '';
  }
  const json = JSON.parse(raw.slice(raw.indexOf('{')));
  unit = {
    total: json.numTotalTests,
    passed: json.numPassedTests,
    failed: json.numFailedTests,
    files: json.testResults.map((f: { name: string; assertionResults: { status: string }[] }) => ({
      name: f.name.replace(ROOT, ''),
      passed: f.assertionResults.filter((a) => a.status === 'passed').length,
      failed: f.assertionResults.filter((a) => a.status === 'failed').length,
    })),
  };
}

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const result = {
  run_at: now.toISOString(),
  rules_version: config.rulesVersion,
  enabled_rules: config.rules.filter((r) => r.enabled || r.locked).map((r) => r.id),
  proposals: {
    required: required.length,
    recorded: required.filter((r) => r.status === 'recorded').length,
    stale: required.filter((r) => r.status === 'stale').length,
    missing: required.filter((r) => r.status === 'missing').length,
    by_source: [...proposals.values()].reduce<Record<string, number>>((acc, p) => {
      const s = p.meta.source ?? 'unlabelled';
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {}),
  },
  metrics: main.metrics,
  asks_per_household: main.asks,
  decision_counts: counts,
  rule_coverage: coverage,
  cases: main.results,
  heldout: held ? { metrics: held.metrics, cases: held.results } : null,
  unit_tests: unit,
};

mkdirSync(join(ROOT, 'evals/results'), { recursive: true });
const resultFile = `evals/results/${stamp}.json`;
writeFileSync(join(ROOT, resultFile), JSON.stringify(result, null, 2) + '\n');

// ---------- docs/test-results.md ----------
const pct = (n: number | null) => (n === null ? 'n/a' : `${n}%`);
const gateText = (m: typeof main.metrics) =>
  m.gate === 'red' ? `**${m.falseCancels} (fail)**` : m.gate === 'green' ? '**0 (pass)**' : `0 so far (${m.pending} cases pending)`;
const row = (r: CaseResult) =>
  `| \`${r.id}\` | ${r.household} | \`${r.payment}\` | ${r.mode} | ${r.expected.decision} · ${r.expected.decided_by} | ${r.decision ?? 'pending'} · ${r.decidedBy ?? '-'} | ${r.status}${r.falseCancel ? ' (false cancel)' : ''}${r.missingAttachments.length ? ` (missing ${r.missingAttachments.join(', ')})` : ''} |`;
const caseTable = (rs: CaseResult[]) =>
  ['| Case | Household | Payment | Mode | Expected | Actual | Result |', '|---|---|---|---|---|---|---|', ...rs.map(row)].join('\n');
const headline = (m: typeof main.metrics, asks?: typeof main.asks) =>
  [
    '| False cancels (hard gate) | Decision accuracy | Attribution accuracy | Weighted cost | Asks per household |',
    '|---|---|---|---|---|',
    `| ${gateText(m)} | ${pct(m.decisionAccuracy)} of ${m.scored} scored | ${pct(m.attributionAccuracy)} of ${m.scored} scored | ${m.weightedCost} | ${asks ? `${asks.value} (${asks.pending} decisions pending)` : 'n/a'} |`,
  ].join('\n');

const byCat = Object.keys(CATEGORY_LABELS).map((cat) => {
  const rs = main.results.filter((r) => r.category === cat);
  const n = (s: string) => rs.filter((r) => r.status === s).length;
  return `| ${CATEGORY_LABELS[cat]} | ${rs.length} | ${n('pass')} | ${n('fail')} | ${n('pending')} |`;
});

const md = `# Test results

Generated by \`npm run eval\` on ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC. Do not edit by hand; every number in the docs comes from this file.

Ruleset \`${config.rulesVersion}\`. Recorded proposals: **${result.proposals.recorded} of ${result.proposals.required}** (${result.proposals.missing} missing, ${result.proposals.stale} stale).${Object.keys(result.proposals.by_source).length ? ` Proposal files by source: ${Object.entries(result.proposals.by_source).map(([k, v]) => `${k} ${v}`).join(', ')}.` : ''}${result.proposals.recorded < result.proposals.required ? ' A case is **pending** when its decision needs a recorded proposal that does not exist yet; record them with `npm run eval:live` (model key) or `npm run eval:export` and `npm run eval:import` (chat).' : ''}${result.proposals.by_source['chat-recorded'] ? '\n\n**Chat-recorded proposals.** These proposals came from running the classifier prompt in a chat and importing the answers with `npm run eval:import`. They are not live API runs. The scores below are eval scores on this case set, not production accuracy.' : ''}

## Eval set: ${main.metrics.cases} cases

Eval scores on this case set only. They are not member outcomes.

${headline(main.metrics, main.asks)}

Scored ${main.metrics.scored} of ${main.metrics.cases}: ${main.metrics.passed} passed, ${main.metrics.failed} failed, ${main.metrics.pending} pending.

| Category | Cases | Pass | Fail | Pending |
|---|---|---|---|---|
${byCat.join('\n')}

${caseTable(main.results)}

## Held-out set: ${heldout.length} cases

Author-written after \`rules-v1\` was frozen. Not independent: the same person wrote the rules and these cases. Reported separately, whatever the score.

${held ? `${headline(held.metrics)}\n\nScored ${held.metrics.scored} of ${held.metrics.cases}: ${held.metrics.passed} passed, ${held.metrics.failed} failed, ${held.metrics.pending} pending.\n\n${caseTable(held.results)}` : 'No held-out cases yet.'}

## Decisions across the 6 sample households

| CANCEL | FLAG | ASK | HUMAN | LEAVE | Pending |
|---|---|---|---|---|---|
| ${counts.CANCEL} | ${counts.FLAG} | ${counts.ASK} | ${counts.HUMAN} | ${counts.LEAVE} | ${counts.pending} |

## Rule coverage

Households each rule fired in, on the sample data.

| Rule | Fired in |
|---|---|
${config.rules.map((r) => `| ${r.id} ${r.name} | ${coverage[r.id].length ? coverage[r.id].join(', ') : r.id === 'R06' ? 'none yet (needs recorded proposals)' : 'none'} |`).join('\n')}

## Unit tests

${unit ? `${unit.passed} of ${unit.total} passed${unit.failed ? `, **${unit.failed} failed**` : ''} (Vitest).\n\n| File | Passed | Failed |\n|---|---|---|\n${unit.files.map((f) => `| \`${f.name}\` | ${f.passed} | ${f.failed} |`).join('\n')}` : 'Not run (--no-unit).'}

Raw result: \`${resultFile}\`.
`;
writeFileSync(join(ROOT, 'docs/test-results.md'), md);

// ---------- console ----------
const m = main.metrics;
console.log(`Eval: ${m.scored}/${m.cases} scored, ${m.passed} pass, ${m.failed} fail, ${m.pending} pending`);
console.log(`False cancels: ${m.falseCancels} (gate ${m.gate}) · decision ${pct(m.decisionAccuracy)} · attribution ${pct(m.attributionAccuracy)} · weighted cost ${m.weightedCost} · asks/household ${main.asks.value}`);
if (held) console.log(`Held-out: ${held.metrics.scored}/${held.metrics.cases} scored, ${held.metrics.passed} pass, false cancels ${held.metrics.falseCancels}`);
console.log(`Proposals: ${result.proposals.recorded}/${result.proposals.required} recorded`);
if (unit) console.log(`Unit tests: ${unit.passed}/${unit.total} passed`);
console.log(`Wrote ${resultFile} and docs/test-results.md`);

let exit = 0;
if (m.falseCancels > 0) {
  console.error('FAIL: false cancels > 0');
  exit = 1;
}
if (unit && unit.failed > 0) exit = 1;
if (compareTo) {
  const prev = JSON.parse(readFileSync(join(ROOT, compareTo), 'utf8'));
  const diff = diffResults(prev.cases, main.results);
  console.log(`\nCompared with ${compareTo}: ${diff.length} case${diff.length === 1 ? '' : 's'} changed`);
  for (const d of diff) console.log(`  ${d.id}: ${d.before}  ->  ${d.after}`);
  console.log(`Weighted cost: ${prev.metrics.weightedCost} -> ${m.weightedCost}`);
  if (m.weightedCost > prev.metrics.weightedCost) {
    console.error('FAIL: weighted cost went up');
    exit = 1;
  }
}
process.exit(exit);
