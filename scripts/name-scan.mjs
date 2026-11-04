#!/usr/bin/env node
// Fails if any tracked (or new, unignored) file names a coding tool, assistant, model vendor or
// model family, in its path or its contents. No exceptions: fixtures and package files included.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { NAME_PATTERN } from './names.mjs';

const files = execSync('git ls-files -z --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((f) => !f.startsWith('node_modules/'));

const hits = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  if (NAME_PATTERN.test(file)) hits.push(`${file}: file name`);
  const buf = readFileSync(file);
  if (buf.includes(0)) continue; // binary
  buf
    .toString('utf8')
    .split('\n')
    .forEach((line, i) => {
      if (NAME_PATTERN.test(line)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
}

if (hits.length) {
  console.error('Name scan failed. Remove these mentions:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`Name scan passed (${files.length} files, pattern ${NAME_PATTERN.source.length} chars, no exceptions).`);
