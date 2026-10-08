import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { runPnpm } from './pnpm-runner.mjs';

const root = resolve(import.meta.dirname, '../..');
const out = resolve(root, 'artifacts/packages');


async function verifyLibraryArtifacts(item) {
  if (item.group !== 'packages') return;
  const rootExport = item.packageJson.exports?.['.'];
  for (const field of ['import', 'types']) {
    const target = rootExport?.[field];
    if (typeof target !== 'string') throw new Error(`${item.packageJson.name} missing exports["."].${field}`);
    const absolute = join(item.dir, target.replace(/^\.\//, ''));
    let fileStat;
    try { fileStat = await stat(absolute); }
    catch { throw new Error(`${item.packageJson.name} missing built ${field} artifact: ${target}`); }
    if (!fileStat.isFile()) throw new Error(`${item.packageJson.name} ${field} artifact is not a file: ${target}`);
    if (field === 'import' && fileStat.size > 100 * 1024) {
      throw new Error(`${item.packageJson.name} entry bundle ${fileStat.size} bytes exceeds 100 KiB budget`);
    }
  }
}

async function discoverPublishable() {
  const groups = ['packages', 'tooling'];
  const items = [];
  for (const group of groups) {
    const base = join(root, group);
    for (const entry of await readdir(base)) {
      const packageFile = join(base, entry, 'package.json');
      let packageJson;
      try { packageJson = JSON.parse(await readFile(packageFile, 'utf8')); }
      catch { continue; }
      if (!packageJson.name?.startsWith('@foundation/') || packageJson.private) continue;
      items.push({ group, entry, dir: join(base, entry), packageJson });
    }
  }
  return items.sort((a, b) => a.packageJson.name.localeCompare(b.packageJson.name));
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const libraries = {};
const tools = {};
const integrity = {};
for (const item of await discoverPublishable()) {
  await verifyLibraryArtifacts(item);
  const before = new Set((await readdir(out)).filter((file) => file.endsWith('.tgz')));
  runPnpm(['--dir', item.dir, 'pack', '--pack-destination', out], { stdio: 'inherit' });
  const after = (await readdir(out)).filter((file) => file.endsWith('.tgz'));
  const created = after.filter((file) => !before.has(file));
  if (created.length !== 1) {
    throw new Error(`Expected one tarball for ${item.packageJson.name}, found ${created.length}`);
  }
  const file = basename(created[0]);
  const target = item.group === 'packages' ? libraries : tools;
  target[item.packageJson.name] = file;
  const bytes = await readFile(join(out, file));
  integrity[item.packageJson.name] = {
    file,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await writeFile(resolve(out, 'manifest.json'), `${JSON.stringify({ version: rootPackage.version, packages: libraries, tools, integrity }, null, 2)}\n`, 'utf8');
console.log(`Packed Foundation release artifacts to ${out}`);
