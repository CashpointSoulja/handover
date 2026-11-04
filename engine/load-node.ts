// Node-only loader for the CLI and tests. The browser loads the same files through Vite.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { buildConfig } from './config';
import type { Config, HouseholdData, RecordedProposal } from './types';

export const ROOT = new URL('..', import.meta.url).pathname;

const yaml = (file: string) => parse(readFileSync(join(ROOT, file), 'utf8'));
const json = (file: string) => JSON.parse(readFileSync(join(ROOT, file), 'utf8'));

export function loadConfig(): Config {
  return buildConfig({
    merchants: yaml('config/merchants.yaml'),
    prices: yaml('config/prices.yaml'),
    policies: yaml('config/policies.yaml'),
    rules: yaml('config/rules.yaml'),
    messages: yaml('config/messages.yaml'),
  });
}

export function loadHouseholds(): HouseholdData[] {
  const dir = join(ROOT, 'fixtures/households');
  return readdirSync(dir)
    .sort()
    .map((id) => ({
      household: json(`fixtures/households/${id}/household.json`),
      transactions: json(`fixtures/households/${id}/transactions.json`),
      chat: json(`fixtures/households/${id}/chat.json`),
    }));
}

/** Recorded proposals, keyed "H1/apple_bill_999" or "H1/apple_bill_999@identified-disney_plus". */
export function loadProposals(): Map<string, RecordedProposal> {
  const out = new Map<string, RecordedProposal>();
  const dir = join(ROOT, 'fixtures/proposals');
  if (!existsSync(dir)) return out;
  for (const hh of readdirSync(dir)) {
    const sub = join(dir, hh);
    if (hh.startsWith('.') || !statSync(sub).isDirectory()) continue;
    for (const f of readdirSync(sub)) {
      if (!f.endsWith('.json')) continue;
      out.set(`${hh}/${f.replace(/\.json$/, '')}`, JSON.parse(readFileSync(join(sub, f), 'utf8')));
    }
  }
  return out;
}
