#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPnpm } from '../scripts/pnpm-runner.mjs';
import { root } from './lib.mjs';
import { runPreflight } from './preflight.mjs';
import { createReleasePlan } from './plan.mjs';

export function parseArgs(argv) {
  const options = { execute: false, tag: 'latest' };
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

export function createPromotionCommands(options = {}) {
  const preflight = runPreflight();
  if (preflight.errors.length) throw new Error(`Release preflight failed:\n${preflight.errors.join('\n')}`);
  const registry = options.registry ?? process.env.FOUNDATION_REGISTRY;
  if (!registry) throw new Error('Registry is required via --registry or FOUNDATION_REGISTRY');
  if (!/^https?:\/\//.test(registry)) throw new Error(`Registry must be an http(s) URL: ${registry}`);
  const tag = options.tag ?? 'latest';
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(tag)) throw new Error(`Invalid dist-tag: ${tag}`);
  const plan = createReleasePlan();
  return plan.publishOrder.map((item) => ({
    name: item.name,
    version: preflight.version,
    args: ['dist-tag', 'add', `${item.name}@${preflight.version}`, tag, '--registry', registry]
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node tooling/release/promote.mjs --registry <url> [--tag latest] [--execute]');
      process.exit(0);
    }
    const commands = createPromotionCommands(options);
    console.log(`${options.execute ? 'Promoting' : 'Dry-run promotion plan for'} ${commands.length} packages:`);
    for (const command of commands) {
      console.log(`pnpm ${command.args.map((x) => JSON.stringify(x)).join(' ')}`);
      if (options.execute) runPnpm(command.args, { cwd: root, stdio: 'inherit' });
    }
    if (!options.execute) console.log('No registry tags changed. Re-run with --execute only after registry smoke passes.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
