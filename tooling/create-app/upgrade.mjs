#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectProject } from './doctor.mjs';
import { resolveContractMode } from './contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ownPackage = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function sameReleaseLine(left, right) {
  const a = String(left).match(/^(\d+)\.(\d+)\./);
  const b = String(right).match(/^(\d+)\.(\d+)\./);
  return Boolean(a && b && a[1] === b[1] && a[2] === b[2]);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = { write: false, json: false };
  let projectDir;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--write') { options.write = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--help') { options.help = true; continue; }
    if (arg === '--target') {
      const value = args.shift();
      if (!value) throw new Error('Missing value for --target');
      options.target = value;
      continue;
    }
    if (arg?.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    if (projectDir) throw new Error('Only one project directory is allowed');
    projectDir = arg;
  }
  return { projectDir: projectDir ?? '.', options };
}

export function planUpgrade(projectDir, { target = ownPackage.version } = {}) {
  if (!semverPattern.test(target)) throw new Error(`Invalid target version: ${target}`);
  const root = resolve(projectDir);
  const packageFile = join(root, 'package.json');
  if (!existsSync(packageFile)) throw new Error(`package.json not found: ${root}`);
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const changes = [];
  const next = JSON.parse(JSON.stringify(pkg));
  const declaresApp = sections.some((section) => next[section]?.['@foundation/app'] !== undefined);
  for (const section of sections) {
    for (const [name, before] of Object.entries(next[section] ?? {})) {
      if (!name.startsWith('@foundation/')) continue;
      const after = `^${target}`;
      if (before === after) continue;
      next[section][name] = after;
      changes.push({ section, name, before, after });
    }
  }
  if (!declaresApp) throw new Error('Project does not declare @foundation/app');

  const foundationConfigFile = join(root, 'foundation.config.json');
  let foundationConfig;
  let foundationConfigChanged = false;
  if (existsSync(foundationConfigFile)) {
    foundationConfig = JSON.parse(readFileSync(foundationConfigFile, 'utf8'));
    if (foundationConfig.foundationVersion !== target) {
      foundationConfig = JSON.parse(JSON.stringify(foundationConfig));
      foundationConfig.foundationVersion = target;
      foundationConfigChanged = true;
    }
    if ((foundationConfig.contractMode ?? 'none') !== 'none' && sameReleaseLine(target, ownPackage.version)) {
      const resolvedMode = resolveContractMode(foundationConfig.contractMode);
      foundationConfig = JSON.parse(JSON.stringify(foundationConfig));
      foundationConfig.contracts = resolvedMode.contracts;
      foundationConfigChanged = true;
      next.devDependencies ??= {};
      for (const [name, version] of Object.entries(resolvedMode.devDependencies)) {
        const before = next.devDependencies[name];
        if (before === version) continue;
        next.devDependencies[name] = version;
        changes.push({ section: 'devDependencies', name, before, after: version });
      }
    }
  }
  return { root, packageFile, foundationConfigFile, target, changes, packageJson: next, foundationConfig, foundationConfigChanged };
}

export function upgradeProject(projectDir, options = {}) {
  const plan = planUpgrade(projectDir, options);
  if (options.write) {
    writeFileSync(plan.packageFile, `${JSON.stringify(plan.packageJson, null, 2)}\n`, 'utf8');
    if (plan.foundationConfigChanged && plan.foundationConfig) {
      writeFileSync(plan.foundationConfigFile, `${JSON.stringify(plan.foundationConfig, null, 2)}\n`, 'utf8');
    }
  }
  const doctor = options.write ? inspectProject(plan.root, { target: plan.target }) : undefined;
  return { ...plan, written: Boolean(options.write), doctor };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { projectDir, options } = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: foundation-upgrade [project-dir] [--target <version>] [--write] [--json]');
      console.log('Default is dry-run. --write updates Foundation version ranges and foundation.config.json metadata; it never rewrites application source.');
      process.exit(0);
    }
    const result = upgradeProject(projectDir, { target: options.target ?? ownPackage.version, write: options.write });
    if (options.json) {
      console.log(JSON.stringify({ target: result.target, written: result.written, changes: result.changes, doctor: result.doctor }, null, 2));
    } else {
      console.log(`Foundation upgrade ${result.written ? 'applied' : 'plan'}: ${result.root}`);
      console.log(`Target: ${result.target}`);
      for (const change of result.changes) console.log(`${change.section}.${change.name}: ${change.before} -> ${change.after}`);
      if (result.foundationConfigChanged) console.log(`foundation.config.json.foundationVersion -> ${result.target}`);
      if (!result.changes.length) console.log('No Foundation version changes required');
      if (!result.written && (result.changes.length || result.foundationConfigChanged)) console.log('Dry-run only. Re-run with --write to update project Foundation metadata.');
      if (result.doctor?.issues.length) {
        for (const issue of result.doctor.issues) console.error(`ERROR: ${issue}`);
        process.exitCode = 1;
      }
      for (const warning of result.doctor?.warnings ?? []) console.warn(`WARN: ${warning}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
