import type { Config, RuleConfig } from './types';

export interface RawConfig {
  merchants: { merchants: Config['merchants']; aggregators: Config['aggregators'] };
  prices: { services: Config['prices'] };
  policies: { policies: Config['policies'] };
  rules: { version: string; rules: RuleConfig[] };
  messages: { templates: Config['messages'] };
}

export const RULE_IDS = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12', 'R13', 'R14'] as const;

/** Build and check the engine config from the parsed YAML files in config/. */
export function buildConfig(raw: RawConfig): Config {
  const rules = raw.rules.rules;
  const ids = rules.map((r) => r.id);
  if (ids.join() !== RULE_IDS.join()) throw new Error(`config/rules.yaml must list ${RULE_IDS.join(', ')} in order; got ${ids.join(', ')}`);
  for (const r of rules) if (!r.protects) throw new Error(`${r.id} has no protects line`);
  for (const p of raw.policies.policies) {
    if (p.status === 'verified' && (!p.source_url || !p.verified_on)) throw new Error(`Policy ${p.provider} is verified without a source_url and verified_on`);
  }
  return {
    merchants: raw.merchants.merchants,
    aggregators: raw.merchants.aggregators,
    prices: raw.prices.services,
    policies: raw.policies.policies,
    rules,
    rulesVersion: raw.rules.version,
    messages: raw.messages.templates,
  };
}

/** Return a copy of the config with some rules switched on or off. Locked rules stay on. */
export function withRuleToggles(config: Config, enabled: Record<string, boolean>): Config {
  return {
    ...config,
    rules: config.rules.map((r) => (r.id in enabled && !r.locked ? { ...r, enabled: enabled[r.id] } : r)),
  };
}
