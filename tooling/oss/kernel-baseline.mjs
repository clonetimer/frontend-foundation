#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const baselineFile = join(root, 'docs/oss/kernel-owned-hashes.json');
const kernelPackages = ['core', 'observability', 'security', 'api', 'theme', 'ui', 'app', 'testing'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

export function createKernelOwnedBaseline() {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const sha256 = {};
  for (const name of kernelPackages) {
    const src = join(root, 'packages', name, 'src');
    for (const file of walk(src).filter((file) => /\.(ts|tsx)$/.test(file)).sort()) {
      sha256[relative(root, file).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(file)).digest('hex');
    }
  }
  return {
    schemaVersion: 1,
    baselineVersion: version,
    purpose: 'Owned Runtime Kernel isolation baseline for OSS shadow-PoC contamination checks',
    sha256
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const baseline = createKernelOwnedBaseline();
  if (process.argv.includes('--write')) {
    writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(`Kernel owned baseline written: ${relative(root, baselineFile)} (${Object.keys(baseline.sha256).length} files)`);
  } else {
    if (!existsSync(baselineFile)) {
      console.log(JSON.stringify(baseline, null, 2));
    } else {
      const expected = JSON.parse(readFileSync(baselineFile, 'utf8'));
      const current = baseline;
      const changed = [];
      const keys = new Set([...Object.keys(expected.sha256 ?? {}), ...Object.keys(current.sha256)]);
      for (const key of keys) if (expected.sha256?.[key] !== current.sha256[key]) changed.push(key);
      if (changed.length) {
        console.error(`Kernel owned baseline drift (${changed.length} files):\n${changed.join('\n')}`);
        process.exitCode = 1;
      } else console.log(`Kernel owned baseline verified (${keys.size} files)`);
    }
  }
}
