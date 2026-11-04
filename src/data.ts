// Browser loader: the same config, fixtures and cases the CLI reads, bundled at build time.
import { parse } from 'yaml';
import { buildConfig } from '../engine/config';
import type { ChatMessage, Household, HouseholdData, RecordedProposal, Transaction } from '../engine/types';
import type { CaseResult, EvalCase, Metrics } from '../evals/score';

const cfg = import.meta.glob('../config/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const y = (name: string) => parse(cfg[`../config/${name}.yaml`]);

export const baseConfig = buildConfig({
  merchants: y('merchants'),
  prices: y('prices'),
  policies: y('policies'),
  rules: y('rules'),
  messages: y('messages'),
});

const hhFiles = import.meta.glob('../fixtures/households/*/*.json', { import: 'default', eager: true }) as Record<string, unknown>;
const ids = [...new Set(Object.keys(hhFiles).map((k) => k.split('/')[3]))].sort();
export const households: HouseholdData[] = ids.map((id) => ({
  household: hhFiles[`../fixtures/households/${id}/household.json`] as Household,
  transactions: hhFiles[`../fixtures/households/${id}/transactions.json`] as Transaction[],
  chat: hhFiles[`../fixtures/households/${id}/chat.json`] as ChatMessage[],
}));

const propFiles = import.meta.glob('../fixtures/proposals/*/*.json', { import: 'default', eager: true }) as Record<string, RecordedProposal>;
export const proposals = new Map<string, RecordedProposal>(
  Object.entries(propFiles).map(([path, p]) => {
    const [hh, file] = path.split('/').slice(-2);
    return [`${hh}/${file.replace(/\.json$/, '')}`, p];
  }),
);

const toCases = (files: Record<string, string>) =>
  Object.keys(files)
    .sort()
    .map((k) => parse(files[k]) as EvalCase);
export const cases = toCases(import.meta.glob('../evals/cases/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
export const heldout = toCases(import.meta.glob('../evals/heldout/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);

interface StoredResult {
  run_at: string;
  metrics: Metrics;
  cases: CaseResult[];
}
const resultFiles = import.meta.glob('../evals/results/*.json', { import: 'default', eager: true }) as Record<string, StoredResult>;
const latestKey = Object.keys(resultFiles).sort().pop();
/** The last run of the CLI runner that was committed: the "previous run" for the in-browser diff. */
export const lastCliRun: StoredResult | null = latestKey ? resultFiles[latestKey] : null;
