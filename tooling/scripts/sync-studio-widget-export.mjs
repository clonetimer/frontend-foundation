#!/usr/bin/env node
/** Preserve a byte-for-byte copy of widget components for downloadable TSX projects. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(root, 'apps/showcase/src/modules/pattern-atlas/studio');
const catalog = readFileSync(resolve(dir, 'widgets.ts'), 'utf8');
const preview = readFileSync(resolve(dir, 'WidgetPreview.tsx'), 'utf8');
const out = '/** Frozen source mirrors of live Studio widgets; copied verbatim into standalone exports. */\n' +
  'export const exportedWidgetCatalog = ' + JSON.stringify(catalog) + ';\n' +
  'export const exportedWidgetPreview = ' + JSON.stringify(preview) + ';\n';
const p5FileNames = [
  'p5_capability_contract.mjs',
  'p5_r3c_scoped_journal.mjs',
  'p5_r3c2_runtime_adapter.mjs'
];
const p5Sources = p5FileNames.map((name) => ({
  name: 'p5-reference/' + name,
  base64: readFileSync(resolve(root, 'tooling/scripts/aas_p0', name)).toString('base64')
}));
const p5Out = '/** Synthetic-only P5 reference module source, mirrored byte-for-byte; NOT auto-activated. */\n'
  + 'export const exportedP5ReferenceSources = ' + JSON.stringify(p5Sources) + ' as const;\n';
const p5Target = resolve(dir, 'exported-p5-reference.ts');
const target = resolve(dir, 'exported-widgets.ts');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== out) {
    process.stderr.write('Studio widget source snapshots are outdated; run sync-studio-widget-export.mjs\n');
    process.exitCode = 1;
  } else console.log('Widget source snapshots match');
  if (readFileSync(p5Target, 'utf8') !== p5Out) {
    process.stderr.write('P5 reference source snapshots are outdated; run sync-studio-widget-export.mjs\n');
    process.exitCode = 1;
  }
} else {
  writeFileSync(target, out);
  writeFileSync(p5Target, p5Out);
  console.log('Studio widget and P5 reference snapshots synchronized');
}
