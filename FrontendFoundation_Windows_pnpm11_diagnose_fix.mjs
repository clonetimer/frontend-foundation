/**
 * Frontend Foundation 0.21.0 P0 Windows installation diagnostic.
 * Requires Node.js 22.13+ or 24. No dependencies, no network calls.
 *
 * Usage (run from repository root):
 *   node C:\\path\\FrontendFoundation_Windows_pnpm11_diagnose_fix.mjs
 *   node C:\\path\\FrontendFoundation_Windows_pnpm11_diagnose_fix.mjs --fix
 * Or explicitly pass: --root D:\\Project\\frontend-foundation\\frontend-foundation
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const rootIdx = args.indexOf('--root');
if (rootIdx !== -1 && !args[rootIdx + 1]) {
  console.error('Missing directory after --root');
  process.exit(2);
}
const input = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd();
let root = resolve(input);
const isFoundationRoot = (candidate) => {
  try {
    const pkg = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8'));
    return pkg.name === 'frontend-foundation'
      && existsSync(join(candidate, 'tooling', 'scripts', 'repository-check.mjs'));
  } catch { return false; }
};
if (!isFoundationRoot(root) && isFoundationRoot(join(root, 'frontend-foundation'))) {
  root = join(root, 'frontend-foundation');
}
if (!isFoundationRoot(root)) {
  console.error(`Could not identify the Frontend Foundation repo root: ${root}`);
  console.error('Run the script from the frontend-foundation directory, or pass --root <actual repo path>.');
  process.exit(2);
}
const packagePath = join(root, 'package.json');
const source = readFileSync(packagePath, 'utf8');
const manifest = JSON.parse(source);
const installed = manifest.packageManager;
const sha = createHash('sha256').update(source).digest('hex');
console.log(`Repository root : ${root}`);
console.log(`package.json    : ${packagePath}`);
console.log(`packageManager  : ${JSON.stringify(installed ?? null)}`);
console.log(`Expected        : pnpm@11.7.0 (repository check accepts pnpm@11.x)`);
console.log(`SHA-256 before  : ${sha}`);

if (typeof installed !== 'string' || !installed.startsWith('pnpm@11.')) {
  console.log('DIAGNOSIS       : packageManager does not meet this repository check.');
  if (!fix) {
    console.log('No files changed. To repair, run the same command with --fix.');
    process.exitCode = 2;
  } else {
    const backupPath = join(dirname(root), `frontend-foundation.package.json.before-pnpm11-fix.${Date.now()}.bak`);
    copyFileSync(packagePath, backupPath);
    // Keep the rest of the root package.json byte-for-byte unchanged where possible.
    const field = /("packageManager"\s*:\s*)("(?:[^"\\]|\\.)*")/g;
    const matches = [...source.matchAll(field)];
    let edited;
    if (matches.length === 1) {
      edited = source.replace(field, '$1"pnpm@11.7.0"');
    } else if (matches.length === 0) {
      manifest.packageManager = 'pnpm@11.7.0';
      edited = JSON.stringify(manifest, null, 2) + (source.endsWith('\n') ? '\n' : '');
    } else {
      console.error('Multiple packageManager properties: refusing to change ambiguous manifest.');
      process.exit(2);
    }
    const verify = JSON.parse(edited);
    if (verify.name !== 'frontend-foundation' || verify.packageManager !== 'pnpm@11.7.0') {
      console.error('Repair validation failed before writing.');
      process.exit(2);
    }
    writeFileSync(packagePath, edited, 'utf8');
    console.log(`Backup written  : ${backupPath}`);
    console.log('FIX APPLIED     : root packageManager reset to pnpm@11.7.0');
  }
} else {
  console.log('DIAGNOSIS       : packageManager already satisfies pnpm 11.x.');
  console.log('If your local check still fails, verify that it is reading this same repository root.');
}

if (process.exitCode !== 2) {
  try {
    execFileSync(process.execPath, [join(root, 'tooling', 'scripts', 'repository-check.mjs')], {cwd:root, stdio:'inherit'});
    console.log('RESULT          : repository-check PASS');
  } catch (error) {
    console.error(`RESULT          : repository-check failed with code ${error.status ?? 'unknown'}.`);
    process.exitCode = error.status || 1;
  }
}
