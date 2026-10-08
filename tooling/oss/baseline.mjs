#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packageNames = ['core','ui','data','forms','app','security','api','async','file','visualization','theme','observability','testing'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const report = {};
for (const name of packageNames) {
  const src = join(root, 'packages', name, 'src');
  const files = walk(src).filter((file) => /\.(ts|tsx)$/.test(file));
  const loc = files.reduce((sum, file) => sum + readFileSync(file, 'utf8').split(/\r?\n/).length, 0);
  const index = readFileSync(join(src, 'index.ts'), 'utf8');
  report[name] = { files: files.length, loc, topLevelExportStatements: (index.match(/^export\s/gm) ?? []).length };
}
console.log(JSON.stringify(report, null, 2));
