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
const target = resolve(dir, 'exported-widgets.ts');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== out) {
    process.stderr.write('Studio widget source snapshots are outdated; run sync-studio-widget-export.mjs\n');
    process.exitCode = 1;
  } else console.log('Widget source snapshots match');
} else { writeFileSync(target, out); console.log('Studio widget export synchronized'); }
