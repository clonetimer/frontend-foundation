#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPnpm } from '../scripts/pnpm-runner.mjs';
import { root } from './lib.mjs';
import { runPreflight } from './preflight.mjs';
import { createReleasePlan } from './plan.mjs';

export function parseArgs(argv) {
  const options = { execute: false, tag: 'candidate' };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--') continue;
    if (arg === '--execute') { options.execute = true; continue; }
    if (arg === '--registry') {
      options.registry = args.shift();
      if (!options.registry) throw new Error('Missing value for --registry');
      continue;
    }
    if (arg === '--tag') {
      options.tag = args.shift();
      if (!options.tag) throw new Error('Missing value for --tag');
      continue;
    }
    if (arg === '--help') { options.help = true; continue; }
    throw new Error(`Unknown option ${arg}`);
  }
  return options;
}

function loadArtifacts() {
  const dir = join(root, 'artifacts', 'packages');
  const file = join(dir, 'manifest.json');
  if (!existsSync(file)) throw new Error('Missing artifacts/packages/manifest.json. Run pnpm pack:foundation first.');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  return { dir, manifest };
}


export function verifyArtifactFile({ name, path, file, expected }) {
  if (!existsSync(path)) throw new Error(`Artifact file is missing for ${name}: ${file}`);
  if (!expected) throw new Error(`Artifact integrity metadata is missing for ${name}`);
  if (expected.file !== file) throw new Error(`Artifact integrity filename mismatch for ${name}: ${expected.file} != ${file}`);
  const bytes = readFileSync(path);
  if (expected.sizeBytes !== bytes.length) throw new Error(`Artifact size mismatch for ${name}: ${bytes.length} != ${expected.sizeBytes}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (expected.sha256 !== sha256) throw new Error(`Artifact SHA-256 mismatch for ${name}`);
  return { sizeBytes: bytes.length, sha256 };
}

export function createPublishCommands(options) {
  const preflight = runPreflight();
  if (preflight.errors.length) throw new Error(`Release preflight failed:\n${preflight.errors.join('\n')}`);
  const registry = options.registry ?? process.env.FOUNDATION_REGISTRY;
  if (!registry) throw new Error('Registry is required via --registry or FOUNDATION_REGISTRY');
  if (!/^https?:\/\//.test(registry)) throw new Error(`Registry must be an http(s) URL: ${registry}`);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(options.tag ?? 'candidate')) throw new Error(`Invalid dist-tag: ${options.tag}`);
  const { dir, manifest } = loadArtifacts();
  if (manifest.version !== preflight.version) throw new Error(`Artifact version ${manifest.version} does not match workspace ${preflight.version}`);
  const artifactsByName = { ...(manifest.packages ?? {}), ...(manifest.tools ?? {}) };
  const plan = createReleasePlan();
  const names = plan.publishOrder.map((item) => item.name);
  if (!names.length) throw new Error('Release plan contains no packages');
  return names.map((name) => {
    const file = artifactsByName[name];
    if (!file) throw new Error(`Artifact manifest is missing ${name}`);
    const path = join(dir, file);
    const expected = manifest.integrity?.[name];
    verifyArtifactFile({ name, path, file, expected });
    return { name, file: path, args: ['publish', path, '--registry', registry, '--tag', options.tag ?? 'candidate', '--no-git-checks'] };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node tooling/release/publish.mjs --registry <url> [--tag candidate|latest] [--execute]');
      process.exit(0);
    }
    const commands = createPublishCommands(options);
    console.log(`${options.execute ? 'Publishing' : 'Dry-run publish plan for'} ${commands.length} tarballs:`);
    for (const command of commands) {
      console.log(`pnpm ${command.args.map((x) => JSON.stringify(x)).join(' ')}`);
      if (options.execute) runPnpm(command.args, { cwd: root, stdio: 'inherit' });
    }
    if (!options.execute) console.log('No registry writes performed. Re-run with --execute after validation.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
