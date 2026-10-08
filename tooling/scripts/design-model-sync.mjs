#!/usr/bin/env node
import { copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const canonical = resolve(root, 'packages/design-model/composition.json');
const packedMirror = resolve(root, 'tooling/create-app/composition.json');
const write = process.argv.includes('--write');

if (write) {
  copyFileSync(canonical, packedMirror);
  console.log('Design model registry mirror synchronized');
} else {
  const a = readFileSync(canonical);
  const b = readFileSync(packedMirror);
  if (!a.equals(b)) {
    console.error('Design model registry mirror drift: run node tooling/scripts/design-model-sync.mjs --write');
    process.exit(1);
  }
  console.log('Design model registry mirror verified');
}
