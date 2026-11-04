import type { Config, Normalised } from './types';

const PREFIXES = [/^CARD PAYMENT TO\s+/i, /^DD\s+/i, /^SO\s+/i, /^BGC\s+/i];

export function cleanDescriptor(descriptor: string): string {
  let s = descriptor.trim();
  for (const p of PREFIXES) s = s.replace(p, '');
  return s;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Keyed on the merchant table, which rule toggles never change.
const cache = new WeakMap<object, { re: RegExp; i: number; agg: boolean }[]>();
const memo = new WeakMap<object, Map<string, Normalised>>();

function compiled(config: Config) {
  let list = cache.get(config.merchants);
  if (!list) {
    list = [
      ...config.merchants.flatMap((m, i) => m.patterns.map((p) => ({ re: new RegExp(p, 'i'), i, agg: false }))),
      ...config.aggregators.flatMap((a, i) => a.patterns.map((p) => ({ re: new RegExp(p, 'i'), i, agg: true }))),
    ];
    cache.set(config.merchants, list);
  }
  return list;
}

/** Map a raw bank descriptor to a service key using config/merchants.yaml. */
export function normalise(descriptor: string, config: Config): Normalised {
  let m = memo.get(config.merchants);
  if (!m) memo.set(config.merchants, (m = new Map()));
  const hit = m.get(descriptor);
  if (hit) return hit;
  const out = normaliseUncached(descriptor, config);
  m.set(descriptor, out);
  return out;
}

function normaliseUncached(descriptor: string, config: Config): Normalised {
  const clean = cleanDescriptor(descriptor);
  for (const { re, i, agg } of compiled(config)) {
    if (!re.test(clean)) continue;
    if (agg) {
      const a = config.aggregators[i];
      return {
        serviceKey: a.key,
        serviceName: a.name,
        isAggregator: true,
        idBase: a.id === 'from_descriptor' ? slug(clean) : a.id,
        kind: 'aggregator',
        category: 'unknown',
      };
    }
    const m = config.merchants[i];
    return {
      serviceKey: m.key,
      serviceName: m.name,
      isAggregator: false,
      idBase: m.id === 'from_descriptor' ? slug(clean) : m.key,
      kind: m.kind,
      category: m.category,
      merchant: m,
    };
  }
  const s = slug(clean.replace(/[*#].*$/, ''));
  return { serviceKey: s, serviceName: clean, isAggregator: false, idBase: s, kind: 'unmatched', category: 'unknown' };
}
