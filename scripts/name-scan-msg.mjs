#!/usr/bin/env node
// commit-msg hook: rejects commit messages that name a tool or carry a credit trailer.
import { readFileSync } from 'node:fs';
import { NAME_PATTERN } from './names.mjs';

const msg = readFileSync(process.argv[2], 'utf8');
const generated = /generated (with|by) /i;
const hit = msg.match(NAME_PATTERN) ?? msg.match(generated);
if (hit) {
  console.error(`Commit message mentions "${hit[0]}". Use a plain message.`);
  process.exit(1);
}
