#!/usr/bin/env node
/**
 * Pnpm catalog invariant and Dependabot version-claim gate (no dependencies).
 * Dependabot version PRs that only reorder pnpm-lock.yaml must not go green.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const unquote = value => value.replace(/^['"]|['"]$/g, '');

export function catalogs(text, type) {
  const output = new Map();
  let section = '', active = false, item = '';
  for (const line of text.split(/\r?\n/)) {
    const top = /^([^\s#][^:]*):\s*(?:#.*)?$/.exec(line);
    if (top) { section = top[1]; active = false; item = ''; }
    if (type === 'workspace') {
      if (section !== 'catalog') continue;
      const entry = /^ {2}([^:]+):\s*(\S.*)$/.exec(line);
      if (entry) output.set(unquote(entry[1]), {specifier:unquote(entry[2].replace(/\s+#.*$/, '').trim())});
      continue;
    }
    if (section !== 'catalogs') continue;
    if (/^ {2}default:\s*$/.test(line)) { active = true; continue; }
    if (/^ {2}\S/.test(line)) { active = false; item = ''; }
    if (!active) continue;
    const entry = /^ {4}(.+):\s*$/.exec(line);
    if (entry) { item = unquote(entry[1]); output.set(item, {specifier:null,version:null}); continue; }
    const field = /^ {6}(specifier|version):\s*(\S.*)$/.exec(line);
    if (item && field) output.get(item)[field[1]] = unquote(field[2].trim());
  }
  return output;
}

export function resolvedPackages(lock) {
  const keys = new Set();
  let section = '';
  for (const line of lock.split(/\r?\n/)) {
    const top = /^([^\s#][^:]*):\s*(?:#.*)?$/.exec(line);
    if (top) section = top[1];
    if (section !== 'packages') continue;
    const entry = /^ {2}(.+):\s*$/.exec(line);
    if (entry) keys.add(unquote(entry[1]));
  }
  return keys;
}

export function checkCatalog(workspace, lock) {
  const expected = catalogs(workspace, 'workspace');
  const actual = catalogs(lock, 'lock');
  if (!expected.size || !actual.size) throw new Error('default pnpm catalog missing');
  for (const [name, value] of expected) {
    const locked = actual.get(name);
    if (!locked || locked.specifier !== value.specifier || !locked.version)
      throw new Error('catalog/lockfile drift: ' + name);
  }
  for (const name of actual.keys()) if (!expected.has(name))
    throw new Error('stale catalog lock entry: ' + name);
  return expected.size;
}

export function checkUpgrade(baseLock, headLock, title) {
  const before = catalogs(baseLock, 'lock');
  const after = catalogs(headLock, 'lock');
  const claim = /\bbump\s+(\S+)\s+from\s+(v?\d+\S*)\s+to\s+(v?\d+\S*)/i.exec(title);
  if (claim) {
    const name = claim[1], oldVersion = claim[2], targetVersion = claim[3];
    if (before.has(name) || after.has(name)) {
      if (before.get(name)?.version !== oldVersion || after.get(name)?.version !== targetVersion ||
          oldVersion === targetVersion)
        throw new Error('Dependabot claimed upgrade ' + name + ' ' + oldVersion + ' -> ' +
          targetVersion + ', resolved catalog: ' + String(before.get(name)?.version) + ' -> ' +
          String(after.get(name)?.version));
      // A catalog version alone is not sufficient: the actual pnpm packages
      // resolution must also move to the advertised version. A catalog-only
      // diff can otherwise pass even when the installed package stays old.
      const oldPackages = resolvedPackages(baseLock);
      const newPackages = resolvedPackages(headLock);
      if (!oldPackages.has(name + '@' + oldVersion) ||
          !newPackages.has(name + '@' + targetVersion) ||
          oldPackages.has(name + '@' + targetVersion))
        throw new Error('Dependabot catalog changed without a new resolved package: ' + name);
      return name + ' ' + oldVersion + ' -> ' + targetVersion;
    }
    const p0 = resolvedPackages(baseLock), p1 = resolvedPackages(headLock);
    if (!p0.has(name + '@' + oldVersion) || !p1.has(name + '@' + targetVersion) ||
        p0.has(name + '@' + targetVersion))
      throw new Error('Dependabot claimed upgrade without new resolved package: ' + name);
    return name + ' ' + oldVersion + ' -> ' + targetVersion;
  }
  if ([...after].some(([name, value]) => before.get(name)?.version !== value.version))
    return 'catalog versions changed';
  const p0 = resolvedPackages(baseLock);
  if ([...resolvedPackages(headLock)].some(name => !p0.has(name)))
    return 'resolved package versions changed';
  throw new Error('Dependabot PR only reordered lockfile; no dependency version changed');
}

export function checkEvent(event, workspace, headLock, baseLock, changedPaths = []) {
  const count = checkCatalog(workspace, headLock);
  if (event?.pull_request?.user?.login !== 'dependabot[bot]')
    return 'Catalog consistent (' + count + ' entries); bot-only audit skipped';
  if (typeof baseLock !== 'string')
    throw new Error('Dependabot PR needs baseline lockfile from first merge parent');
  // GitHub Actions updates have no npm lockfile: do not reject their
  // workflow-only version bumps. Any npm/lockfile change remains audited.
  if (changedPaths.length && changedPaths.every(path => path.startsWith('.github/workflows/')))
    return 'Workflow-only Dependabot update (npm catalog audit not applicable)';
  return 'Catalog consistent; real upgrade: ' +
    checkUpgrade(baseLock, headLock, event.pull_request.title || '');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 3 || args[0] !== '--expect' ||
        !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(args[1]) ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(args[2])))
      throw new Error('Usage: node tooling/scripts/dependabot-catalog-gate.mjs [--expect <package> <version>]');
    const event = process.env.GITHUB_EVENT_PATH
      ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : null;
    const workspace = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
    const headLock = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8');
    const baseLock = event?.pull_request?.user?.login === 'dependabot[bot]'
      ? execFileSync('git', ['show', 'HEAD^1:pnpm-lock.yaml'], {cwd:root,encoding:'utf8'})
      : null;
    const changedPaths = baseLock === null ? [] : execFileSync('git',
      ['diff', '--name-only', 'HEAD^1', 'HEAD'], {cwd:root,encoding:'utf8'})
      .split(/\r?\n/).filter(Boolean);
    console.log(checkEvent(event, workspace, headLock, baseLock, changedPaths));
    if (args.length) {
      const version = catalogs(headLock, 'lock').get(args[1])?.version;
      if (version !== args[2] || !resolvedPackages(headLock).has(args[1] + '@' + args[2]))
        throw new Error('Expected catalog and resolved package ' + args[1] + '@' + args[2] +
          ', actual catalog ' + String(version));
      console.log('Verified catalog and resolved package: ' + args[1] + '@' + version);
    }
  } catch (error) {
    console.error('Dependabot pnpm catalog gate failed:', error.message);
    process.exitCode = 1;
  }
}
