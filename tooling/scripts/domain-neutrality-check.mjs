#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json']);
const forbidden = [
  { label: 'satellite business vocabulary', pattern: /\bsatellite\b/i },
  { label: 'orbit business vocabulary', pattern: /\borbit\b/i },
  { label: 'ADCS business vocabulary', pattern: /\bADCS\b/ },
  { label: 'mission package scope', pattern: /@mission\//i },
  { label: 'mission registry namespace', pattern: /\bmission\.[a-z0-9_-]+/i },
  { label: 'mission fixture naming', pattern: /mission-widgets/i }
];

const scanRoots = [
  ...readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'domain-widgets-fixture')
    .map((entry) => join(root, 'packages', entry.name, 'src')),
  join(root, 'apps', 'designer', 'src'),
  join(root, 'tooling', 'create-app')
];

const issues = [];

function visit(path) {
  let stat;
  try { stat = statSync(path); } catch { return; }
  if (stat.isDirectory()) {
    const base = path.split('/').at(-1);
    if (['tests', 'examples', 'template', 'patterns', 'contract-fixtures', 'deployments'].includes(base)) return;
    for (const entry of readdirSync(path)) visit(join(path, entry));
    return;
  }
  if (!allowedExtensions.has(extname(path)) || /\.test\.[cm]?[jt]sx?$/.test(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) issues.push(`${relative(root, path)}: ${rule.label}`);
  }
}

for (const path of scanRoots) visit(path);

if (issues.length) {
  console.error(`Domain neutrality check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log('Domain neutrality check passed: Foundation mainline contains no retained product-domain vocabulary.');
}
