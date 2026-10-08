import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const source = readFileSync(resolve(root, 'apps/designer/src/file-access.ts'), 'utf8');
const compiled = stripTypeScriptTypes(source, { mode: 'strip' });
const fileAccess = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const blueprint = {
  schemaVersion: 1,
  project: { id: 'designer.file', title: 'Designer File' },
  foundation: {},
  pages: []
};

test('designer direct-save writes deterministic formatted Project Blueprint bytes', async () => {
  let written = '';
  let closed = false;
  const handle = {
    name: 'foundation.project.json',
    async getFile() { throw new Error('not used'); },
    async createWritable() {
      return {
        async write(value) { written = String(value); },
        async close() { closed = true; }
      };
    }
  };
  const returned = await fileAccess.saveProjectFile(blueprint, handle);
  assert.equal(returned, handle);
  assert.equal(written, `${JSON.stringify(blueprint, null, 2)}\n`);
  assert.equal(closed, true);
});

test('designer import fallback parses the same Project Blueprint JSON shape', async () => {
  const pseudoFile = { async text() { return JSON.stringify(blueprint); } };
  const parsed = await fileAccess.readFallbackFile(pseudoFile);
  assert.deepEqual(parsed, blueprint);
});

test('designer file parser rejects JSON that is not a minimally safe Project Blueprint', () => {
  assert.throws(() => fileAccess.parseProjectBlueprintText('[]'), /must be a JSON object/);
  assert.throws(() => fileAccess.parseProjectBlueprintText(JSON.stringify({ schemaVersion: 2, project: {}, foundation: {}, pages: [] })), /schemaVersion must be 1/);
  assert.throws(() => fileAccess.parseProjectBlueprintText(JSON.stringify({ schemaVersion: 1, project: { id: 'x', title: 'X' }, foundation: {}, pages: {} })), /pages must be an array/);
  assert.throws(() => fileAccess.parseProjectBlueprintText(JSON.stringify({ schemaVersion: 1, project: { id: 'x', title: 'X' }, foundation: {}, pages: [{}] })), /must define string id and title/);
});
