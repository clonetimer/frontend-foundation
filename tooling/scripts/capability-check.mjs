#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const registry = JSON.parse(readFileSync(join(root, 'docs/capabilities/capability-registry.json'), 'utf8'));
const profiles = JSON.parse(readFileSync(join(root, 'tooling/create-app/profiles.json'), 'utf8'));
const errors = [];

const packageManifests = new Map();
for (const entry of readdirSync(join(root, 'packages'))) {
  const file = join(root, 'packages', entry, 'package.json');
  if (!existsSync(file)) continue;
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  packageManifests.set(manifest.name, manifest);
}

if (registry.schemaVersion !== 1) errors.push(`Unsupported capability registry schema ${registry.schemaVersion}`);
const capabilities = registry.capabilities ?? {};
const allowedOwnership = new Set(['strategic-owned', 'replaceable-implementation']);

for (const [name, capability] of Object.entries(capabilities)) {
  if (!capability.publicContract?.startsWith('@foundation/')) errors.push(`${name} has invalid publicContract`);
  if (!packageManifests.has(capability.publicContract)) errors.push(`${name} references missing package ${capability.publicContract}`);
  if (!allowedOwnership.has(capability.ownership)) errors.push(`${name} has invalid ownership ${capability.ownership}`);
  if (!String(capability.reason ?? '').trim()) errors.push(`${name} must explain its ownership decision`);
  for (const candidate of capability.candidates ?? []) {
    if (!candidate.package || !['shadow-poc', 'promoted', 'rejected'].includes(candidate.status)) {
      errors.push(`${name} has invalid candidate entry`);
    }
  }
}

for (const [profileName, profile] of Object.entries(profiles)) {
  const requiredContracts = new Set();
  for (const capabilityName of profile.capabilities ?? []) {
    const capability = capabilities[capabilityName];
    if (!capability) {
      errors.push(`Profile ${profileName} references unknown capability ${capabilityName}`);
      continue;
    }
    requiredContracts.add(capability.publicContract);
  }
  const declaredContracts = new Set((profile.foundationPackages ?? []).map((name) => `@foundation/${name}`));
  for (const contract of requiredContracts) {
    if (!declaredContracts.has(contract)) errors.push(`Profile ${profileName} capability contract ${contract} is not installed by the profile`);
  }
  for (const contract of declaredContracts) {
    if (!requiredContracts.has(contract)) errors.push(`Profile ${profileName} installs ${contract} without a declared capability`);
  }
}

// Shadow OSS candidates must not leak into production package dependencies before promotion.
for (const [capabilityName, capability] of Object.entries(capabilities)) {
  for (const candidate of capability.candidates ?? []) {
    if (candidate.status !== 'shadow-poc') continue;
    for (const manifest of packageManifests.values()) {
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        if (manifest[field]?.[candidate.package]) errors.push(`${manifest.name} prematurely consumes ${candidate.package} from ${capabilityName}`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Capability checks passed (${Object.keys(capabilities).length} capabilities, ${Object.keys(profiles).length} profiles)`);
