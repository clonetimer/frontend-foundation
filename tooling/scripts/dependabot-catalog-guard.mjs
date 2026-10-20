#!/usr/bin/env node
/**
 * Fail closed on Dependabot pnpm catalog PRs that only reserialize lockfile
 * importer ordering instead of changing the advertised resolved dependency.
 *
 * No registry queries, package installs, GitHub tokens or shell evaluation.
 * The base revision is a validated immutable SHA from GITHUB_EVENT_PATH.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const unquote = value => value.replace(/^(['"])(.*)\1$/, '$2');
const fail = message => { throw Error('Dependabot catalog admission refused: ' + message); };

export function readCatalogLock(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf('catalogs:');
  if (start < 0 || lines[start + 1] !== '  default:') fail('missing default pnpm lockfile catalog');
  const entries = new Map();
  let name = null;
  for (const line of lines.slice(start + 2)) {
    if (line && !line.startsWith(' ')) break;
    const match = /^    (.+):$/.exec(line);
    if (match) {
      name = unquote(match[1]);
      if (entries.has(name)) fail('duplicate catalog entry: ' + name);
      entries.set(name, {specifier:null,version:null});
      continue;
    }
    if (!name) continue;
    const field = /^      (specifier|version):\s*(.+)$/.exec(line);
    if (field) entries.get(name)[field[1]] = unquote(field[2]);
  }
  if (entries.size === 0) fail('empty default catalog');
  for (const [key, entry] of entries) {
    if (!entry.specifier || !VERSION.test(entry.version || '')) {
      fail('missing specifier or semantic resolved version for ' + key);
    }
  }
  return entries;
}

export function readWorkspaceCatalog(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf('catalog:');
  if (start < 0) fail('missing source pnpm workspace catalog');
  const entries = new Map();
  for (const line of lines.slice(start + 1)) {
    if (line && !line.startsWith(' ') && !line.startsWith('#')) break;
    const match = /^  (.+?):\s*(\S+)\s*$/.exec(line);
    if (!match) continue;
    const key = unquote(match[1]);
    if (entries.has(key)) fail('duplicate workspace catalog entry: ' + key);
    entries.set(key, unquote(match[2]));
  }
  if (entries.size === 0) fail('empty workspace catalog');
  return entries;
}

export function assertCatalogMatchesWorkspace(workspaceSource, lockSource) {
  const expected = readWorkspaceCatalog(workspaceSource);
  const actual = readCatalogLock(lockSource);
  for (const [name, entry] of actual) {
    if (expected.get(name) !== entry.specifier) {
      fail('workspace/lock catalog specifier mismatch for ' + name);
    }
  }
  for (const name of expected.keys()) {
    if (!actual.has(name)) fail('workspace catalog omitted from lockfile: ' + name);
  }
  return actual;
}

/** Map package name to the set of versions actually present under packages:. */
export function readPackages(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf('packages:');
  if (start < 0) fail('missing lockfile package resolutions');
  const versions = new Map();
  for (const line of lines.slice(start + 1)) {
    if (line && !line.startsWith(' ')) break;
    const match = /^  (.+):$/.exec(line);
    if (!match) continue;
    const key = unquote(match[1]);
    const parsed = /^(.*)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(key);
    if (!parsed) continue;
    if (!versions.has(parsed[1])) versions.set(parsed[1], new Set());
    versions.get(parsed[1]).add(parsed[2]);
  }
  if (versions.size === 0) fail('no resolved packages found');
  return versions;
}

export function checkAdvertisedUpgrade({title, oldLock, newLock, oldWorkspace, newWorkspace}) {
  const before = assertCatalogMatchesWorkspace(oldWorkspace, oldLock);
  const after = assertCatalogMatchesWorkspace(newWorkspace, newLock);
  const oldPackages = readPackages(oldLock);
  const newPackages = readPackages(newLock);
  const claim = /\bbump\s+(@?[\w./-]+)\s+from\s+(\d+\.\d+\.\d+(?:-[\w.-]+)?)\s+to\s+(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?=\s|$)/i.exec(title);
  if (claim) {
    const [,name,oldVersion,newVersion] = claim;
    if (oldVersion === newVersion) fail('advertised from/to versions are identical');
    const oldResolved = before.get(name)?.version;
    const newResolved = after.get(name)?.version;
    if (oldResolved !== undefined || newResolved !== undefined) {
      if (oldResolved !== oldVersion || newResolved !== newVersion) {
        fail(name + ' catalog still resolves ' + (newResolved ?? '(missing)')
          + ', expected ' + newVersion + ' (was ' + oldVersion + ')');
      }
    } else if (!oldPackages.get(name)?.has(oldVersion)) {
      fail(name + ' old package resolution ' + oldVersion + ' not in base');
    }
    if (!newPackages.get(name)?.has(newVersion)
      || oldPackages.get(name)?.has(newVersion)) {
      fail(name + ' package resolution was not upgraded to ' + newVersion);
    }
    return name + ': ' + oldVersion + ' -> ' + newVersion;
  }
  // Grouped and security update titles need not name an individual package.
  // Still require at least one real version change, never importer key order.
  for (const [name, values] of newPackages) {
    const previous = oldPackages.get(name);
    if ([...values].some(version => !previous?.has(version))) {
      return 'new resolved package version: ' + name;
    }
  }
  fail('no package version changed; importer/order-only Dependabot PR');
}

function run() {
  const mode = process.argv[2] || '--check-catalog';
  const lock = readFileSync('pnpm-lock.yaml', 'utf8');
  const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
  assertCatalogMatchesWorkspace(workspace, lock);
  if (mode === '--check-catalog') {
    console.log('pnpm catalog declaration/resolution consistency PASS');
    return;
  }
  if (mode !== '--dependabot-pr') fail('unknown mode: ' + mode);
  if (!process.env.GITHUB_EVENT_PATH) fail('GITHUB_EVENT_PATH required');
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pull = event.pull_request;
  if (pull?.user?.login !== 'dependabot[bot]'
    || !pull.head?.ref?.startsWith('dependabot/npm_and_yarn/')) {
    fail('npm Dependabot pull request event required');
  }
  const base = pull.base?.sha;
  if (!/^[a-f0-9]{40}$/i.test(base || '')) fail('invalid immutable base SHA');
  const oldLock = execFileSync('git', ['show', base + ':pnpm-lock.yaml'], {encoding:'utf8'});
  const oldWorkspace = execFileSync('git', ['show', base + ':pnpm-workspace.yaml'], {encoding:'utf8'});
  const result = checkAdvertisedUpgrade({
    title:pull.title || '',oldLock,newLock:lock,oldWorkspace,newWorkspace:workspace
  });
  console.log('Dependabot resolved-version admission PASS:',result);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL('file://' + process.argv[1]))) {
  try { run(); } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
