import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '../..');
export const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function workspaceManifests() {
  const groups = ['packages', 'apps', 'tooling'];
  const items = [];
  for (const group of groups) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const file = join(base, entry, 'package.json');
      if (!existsSync(file)) continue;
      items.push({ group, entry, dir: join(base, entry), file, manifest: readJson(file) });
    }
  }
  return items;
}

export function publishableManifests() {
  return workspaceManifests().filter(({ manifest }) => manifest.name?.startsWith('@foundation/') && !manifest.private);
}

export function foundationLibraryManifests() {
  return publishableManifests().filter(({ group }) => group === 'packages');
}

export function dependencyNames(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {})
  ]);
}

export function topologicalPublishOrder(items = publishableManifests()) {
  const byName = new Map(items.map((item) => [item.manifest.name, item]));
  const visiting = new Set();
  const visited = new Set();
  const result = [];

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Publish dependency cycle at ${name}`);
    visiting.add(name);
    const item = byName.get(name);
    if (!item) return;
    for (const dep of dependencyNames(item.manifest)) {
      if (byName.has(dep)) visit(dep);
    }
    visiting.delete(name);
    visited.add(name);
    result.push(item);
  }

  for (const name of [...byName.keys()].sort()) visit(name);
  return result;
}
