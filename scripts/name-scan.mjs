#!/usr/bin/env node
// Fails if any tracked (or staged) file mentions a coding tool or assistant by name.
// The single allowed match is the "model" field inside fixtures/proposals/*.json,
// because the model id is part of the product's own recorded evidence.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// Built from fragments so this file does not match itself.
const names = [
  ['cla', 'ude'],
  ['anth', 'ropic'],
  ['open', 'ai'],
  ['chat', 'gpt'],
  ['co', 'pilot'],
  ['gem', 'ini'],
  ['co', 'dex'],
  ['wind', 'surf'],
  ['co-auth', 'ored-by'],
  ['g', 'pt-[0-9]'],
].map((p) => p.join(''));
const pattern = new RegExp(`(${names.join('|')})`, 'i');

const files = execSync('git ls-files -z --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((f) => !f.startsWith('node_modules/') && f !== 'package-lock.json');

const allowed = (file, line) =>
  /^fixtures\/proposals\/.*\.json$/.test(file) && /^\s*"model"\s*:/.test(line);

const hits = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  if (pattern.test(file)) hits.push(`${file}: file name`);
  let text;
  try {
    const buf = readFileSync(file);
    if (buf.includes(0)) continue; // binary
    text = buf.toString('utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    if (pattern.test(line) && !allowed(file, line)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}

if (hits.length) {
  console.error('Name scan failed. Remove these mentions:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`Name scan passed (${files.length} files).`);
