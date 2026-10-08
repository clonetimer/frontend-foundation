#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
if (/experiments\//.test(workspace)) errors.push('experiments/oss-convergence must remain outside the production workspace during shadow PoC');

const snapshot = readJson(join(root, 'docs/oss/upstream-snapshot.json'));
if (snapshot.upstreams.proComponents.decision !== 'approved-shadow-poc') errors.push('ProComponents decision must be approved-shadow-poc');
if (snapshot.upstreams.refineAntd.decision !== 'do-not-adopt-currently') errors.push('@refinedev/antd must stay blocked in current baseline');
if (snapshot.upstreams.refineReactRouter.decision !== 'do-not-adopt-currently') errors.push('@refinedev/react-router must stay blocked in current baseline');

const pro = readJson(join(root, 'experiments/oss-convergence/pro-components-poc/package.json'));
if (!pro.dependencies?.['@ant-design/pro-components']) errors.push('ProComponents PoC missing @ant-design/pro-components');
if (pro.dependencies?.['@refinedev/core']) errors.push('ProComponents PoC must isolate UI evaluation from Refine');

const refine = readJson(join(root, 'experiments/oss-convergence/refine-core-poc/package.json'));
if (!refine.dependencies?.['@refinedev/core']) errors.push('Refine Core PoC missing @refinedev/core');
for (const blocked of ['@refinedev/antd', '@refinedev/react-router']) {
  if (refine.dependencies?.[blocked] || refine.devDependencies?.[blocked]) errors.push(`Refine Core PoC must not depend on ${blocked}`);
}

// No production package may consume OSS convergence candidates before promotion.
for (const name of ['core','ui','data','forms','app','security','api','async','file','visualization','theme','observability','testing']) {
  const pkg = readJson(join(root, 'packages', name, 'package.json'));
  for (const field of ['dependencies','peerDependencies','optionalDependencies']) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (dep === '@ant-design/pro-components' || dep.startsWith('@refinedev/')) {
        errors.push(`${pkg.name} prematurely depends on OSS convergence candidate ${dep}`);
      }
    }
  }
}

// OSS experiments must not mutate the current owned Runtime Kernel baseline.
// Planned Kernel evolution updates this baseline in the same reviewed release;
// the historical 0.5 hash file remains as an audit artifact.
const hashSnapshot = readJson(join(root, 'docs/oss/kernel-owned-hashes.json'));
const currentKernelFiles = [];
for (const packageName of ['core','observability','security','api','theme','ui','app','testing']) {
  const src = join(root, 'packages', packageName, 'src');
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const file = join(dir, entry);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(ts|tsx)$/.test(file)) currentKernelFiles.push(file);
    }
  };
  walk(src);
}
const currentRelativeFiles = new Set(currentKernelFiles.map((file) => file.slice(root.length + 1).replaceAll('\\', '/')));
const expectedRelativeFiles = new Set(Object.keys(hashSnapshot.sha256 ?? {}));
for (const relativeFile of expectedRelativeFiles) {
  const file = join(root, relativeFile);
  if (!existsSync(file)) {
    errors.push(`Kernel owned baseline file missing: ${relativeFile}`);
    continue;
  }
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (actual !== hashSnapshot.sha256[relativeFile]) errors.push(`Kernel changed outside planned owned baseline: ${relativeFile}`);
}
for (const relativeFile of currentRelativeFiles) {
  if (!expectedRelativeFiles.has(relativeFile)) errors.push(`Kernel file added outside planned owned baseline: ${relativeFile}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OSS convergence checks passed');
