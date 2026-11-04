import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

function block(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)) out[m[1]] = m[2];
  return out;
}

const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const light = block(css.slice(0, darkStart));
const dark = { ...light, ...block(css.slice(darkStart)) };

// [foreground token, background token]: every text-on-surface pair the UI uses.
const pairs: [string, string][] = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'bg-subtle'],
  ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-muted', 'bg-subtle'], ['text-muted', 'row-selected'],
  ['on-brand', 'brand'], ['on-brand', 'brand-hover'], ['brand-text', 'surface'], ['brand-text', 'brand-tint'],
  ['d-cancel-fg', 'd-cancel-bg'], ['d-flag-fg', 'd-flag-bg'], ['d-ask-fg', 'd-ask-bg'],
  ['d-human-fg', 'd-human-bg'], ['d-leave-fg', 'd-leave-bg'], ['d-pending-fg', 'd-pending-bg'],
  ['ok-fg', 'ok-bg'], ['bad-fg', 'bad-bg'], ['text', 'highlight-bg'],
  ['wa-text', 'wa-in'], ['wa-text', 'wa-out'], ['wa-meta-in', 'wa-in'], ['wa-meta-out', 'wa-out'],
  ['wa-header-text', 'wa-header-bg'], ['wa-button-text', 'wa-button-bg'], ['wa-system-text', 'wa-system-bg'],
  ['wa-avatar-text', 'wa-avatar-bg'],
];

describe('design tokens: contrast >= 4.5:1', () => {
  for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
    for (const [fg, bg] of pairs) {
      it(`${theme}: ${fg} on ${bg}`, () => {
        expect(tokens[fg], `missing --${fg}`).toBeTruthy();
        expect(tokens[bg], `missing --${bg}`).toBeTruthy();
        expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
