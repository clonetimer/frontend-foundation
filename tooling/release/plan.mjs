#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishableManifests, readJson, root, topologicalPublishOrder } from './lib.mjs';

export function createReleasePlan() {
  const rootPackage = readJson(join(root, 'package.json'));
  const all = publishableManifests();
  const libraries = all.filter(({ group }) => group === 'packages');
  const tools = all.filter(({ group }) => group !== 'packages');
  const order = [...topologicalPublishOrder(libraries), ...topologicalPublishOrder(tools)];
  return {
    version: rootPackage.version,
    generatedAt: new Date().toISOString(),
    registry: '${FOUNDATION_REGISTRY}',
    publishOrder: order.map(({ group, entry, manifest }, index) => ({
      order: index + 1,
      name: manifest.name,
      version: manifest.version,
      workspace: `${group}/${entry}`,
      command: `pnpm --dir ${group}/${entry} publish --no-git-checks --registry "${'${FOUNDATION_REGISTRY}'}"`
    }))
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const plan = createReleasePlan();
  const out = join(root, 'artifacts', 'release-plan.json');
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(`Release plan written to ${out}`);
  for (const item of plan.publishOrder) console.log(`${item.order}. ${item.name}@${item.version}`);
}
