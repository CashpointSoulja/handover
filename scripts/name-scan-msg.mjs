#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const names = [['cla','ude'],['anth','ropic'],['open','ai'],['chat','gpt'],['co','pilot'],['gem','ini'],['co','dex'],['co-auth','ored-by'],['generated ','with']].map((p) => p.join(''));
const msg = readFileSync(process.argv[2], 'utf8');
const hit = names.find((n) => msg.toLowerCase().includes(n));
if (hit) {
  console.error(`Commit message mentions "${hit}". Use a plain message.`);
  process.exit(1);
}
