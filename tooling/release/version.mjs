#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, root, semverPattern, workspaceManifests, writeJson } from './lib.mjs';

export function setWorkspaceVersion(version) {
  if (!semverPattern.test(version)) throw new Error(`Invalid version: ${version}`);
  const rootFile = join(root, 'package.json');
  const rootPackage = readJson(rootFile);
  rootPackage.version = version;
  writeJson(rootFile, rootPackage);

  for (const { file, manifest } of workspaceManifests()) {
    if (!manifest.name?.startsWith('@foundation/')) continue;
    manifest.version = version;
    writeJson(file, manifest);
  }

  const releaseDir = join(root, 'docs', 'releases');
  mkdirSync(releaseDir, { recursive: true });
  const releaseFile = join(releaseDir, `${version}.md`);
  if (!existsSync(releaseFile)) {
    writeFileSync(releaseFile, `# Frontend Foundation ${version}\n\nStatus: Candidate\n\n## Summary\n\n- TODO: describe release scope.\n\n## Compatibility\n\n- Kernel public contract: TODO\n- Migration requirement: TODO\n\n## Validation gates\n\n- [ ] verify:offline\n- [ ] lint\n- [ ] typecheck\n- [ ] test\n- [ ] build\n- [ ] consumer:test\n- [ ] storybook:build\n\n`, 'utf8');
  }
  return version;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const version = process.argv.slice(2).find((arg) => arg !== '--');
  if (!version) {
    console.error('Usage: node tooling/release/version.mjs <version>');
    process.exitCode = 1;
  } else {
    try {
      setWorkspaceVersion(version);
      console.log(`Workspace version set to ${version}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
