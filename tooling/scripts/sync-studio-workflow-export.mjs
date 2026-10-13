#!/usr/bin/env node
/** Check or regenerate the exact Studio workflow runtime embedded in export ZIPs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = resolve(import.meta.dirname, '../../apps/showcase/src/modules/pattern-atlas/studio');
const source = readFileSync(resolve(dir, 'studio-workflows.ts'), 'utf8');
const expected = '/** Standalone workflow runtime copied from the editor. Keep synchronized with studio-workflows.ts. */\n' +
  'export const exportedWorkflowRuntime = ' + JSON.stringify(source) + ';\n';
const output = resolve(dir, 'exported-workflows.ts');
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== expected) {
    console.error('Studio workflow source mirror has changed. Run: node tooling/scripts/sync-studio-workflow-export.mjs');
    process.exitCode = 1;
  } else console.log('Workflow source mirror matches');
} else { writeFileSync(output, expected); console.log('Workflow source mirror synchronized'); }
