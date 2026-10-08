import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../index.mjs';
import { inspectProject } from '../doctor.mjs';
import { generateModule } from '../generate.mjs';
import { normalizeResourceSpec } from '../resource.mjs';

function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'foundation-resource-'));
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function resourceSpec(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'records',
    title: 'Records',
    route: 'records',
    idField: 'id',
    api: {
      list: { method: 'GET', path: 'records' },
      detail: { method: 'GET', path: 'records/{id}' },
      update: { method: 'PUT', path: 'records/{id}' }
    },
    permissions: { read: 'records.read', update: 'records.update' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', list: true, detail: true, editable: false },
      { name: 'title', label: '标题', type: 'string', required: true, list: true, detail: true, editable: true, searchable: true },
      { name: 'status', label: '状态', type: 'enum', values: ['draft', 'ready', 'archived'], required: true, list: true, detail: true, editable: true, filterable: true },
      { name: 'enabled', label: '启用', type: 'boolean', list: true, detail: true, editable: true, filterable: true },
      { name: 'score', label: '分数', type: 'number', list: true, detail: true, editable: true }
    ],
    ...overrides
  };
}

function writeSpec(root, spec = resourceSpec()) {
  const file = join(root, 'records.resource.json');
  writeFileSync(file, JSON.stringify(spec, null, 2));
  return file;
}

test('normalizes Resource Blueprint v1 and rejects unsafe shapes', () => {
  const normalized = normalizeResourceSpec(resourceSpec());
  assert.equal(normalized.id, 'records');
  assert.equal(normalized.permissions.read, 'records.read');
  assert.equal(normalized.api.update.method, 'PUT');
  assert.throws(() => normalizeResourceSpec(resourceSpec({ id: 'Bad Id' })), /lowercase slug/);
  assert.throws(() => normalizeResourceSpec(resourceSpec({ idField: 'missing' })), /not declared/);
  const duplicate = resourceSpec();
  duplicate.fields = [...duplicate.fields, duplicate.fields[0]];
  assert.throws(() => normalizeResourceSpec(duplicate), /Duplicate resource field/);
  const unsupported = resourceSpec();
  unsupported.fields[1] = { ...unsupported.fields[1], type: 'object' };
  assert.throws(() => normalizeResourceSpec(unsupported), /unsupported type/);
});



test('resource HTTP contract rejects unsafe paths and invalid update verbs', () => {
  const absolute = resourceSpec();
  absolute.api = { ...absolute.api, list: { method: 'GET', path: 'https://example.test/records' } };
  assert.throws(() => normalizeResourceSpec(absolute), /safe relative API path/);

  const parentTraversal = resourceSpec();
  parentTraversal.api = { ...parentTraversal.api, detail: { method: 'GET', path: '../records/{id}' } };
  assert.throws(() => normalizeResourceSpec(parentTraversal), /safe relative API path/);

  const wrongPlaceholder = resourceSpec();
  wrongPlaceholder.api = { ...wrongPlaceholder.api, detail: { method: 'GET', path: 'records/{recordId}' } };
  assert.throws(() => normalizeResourceSpec(wrongPlaceholder), /only supports the \{id\} placeholder/);

  const listPlaceholder = resourceSpec();
  listPlaceholder.api = { ...listPlaceholder.api, list: { method: 'GET', path: 'records/{id}' } };
  assert.throws(() => normalizeResourceSpec(listPlaceholder), /list\.path must not contain \{id\}/);

  const invalidUpdate = resourceSpec();
  invalidUpdate.api = { ...invalidUpdate.api, update: { method: 'GET', path: 'records/{id}' } };
  assert.throws(() => normalizeResourceSpec(invalidUpdate), /update method must be PUT or PATCH/);
});

test('generates list detail edit resource module from explicit JSON', () => withTemp((root) => {
  createApp([root, '--profile', 'management']);
  const specFile = writeSpec(root);
  const result = generateModule(['resource', specFile, '--project', root]);
  assert.equal(result.resource, true);
  assert.equal(result.module, 'records');

  const moduleRoot = join(root, 'src/modules/records');
  const manifest = JSON.parse(readFileSync(join(moduleRoot, 'foundation.module.json'), 'utf8'));
  assert.equal(manifest.pattern, 'management');
  assert.equal(manifest.resource.spec, 'foundation.resource.json');
  assert.equal(manifest.resource.generatorVersion, 1);
  assert.equal(manifest.resource.sha256.length, 64);
  assert.deepEqual(manifest.contracts, []);

  const routes = readFileSync(join(moduleRoot, 'routes.ts'), 'utf8');
  const list = readFileSync(join(moduleRoot, 'pages/list.route.tsx'), 'utf8');
  const detail = readFileSync(join(moduleRoot, 'pages/detail.route.tsx'), 'utf8');
  const edit = readFileSync(join(moduleRoot, 'pages/edit.route.tsx'), 'utf8');
  const api = readFileSync(join(moduleRoot, 'api.ts'), 'utf8');
  const types = readFileSync(join(moduleRoot, 'types.ts'), 'utf8');
  assert.match(routes, /records\.detail/);
  assert.match(routes, /records\.edit/);
  assert.match(list, /DataTable<RecordsItem>/);
  assert.match(list, /PermissionGate permission="records.update"/);
  assert.match(list, /搜索标题/);
  assert.match(detail, /Descriptions/);
  assert.match(detail, /PermissionGate permission="records.update"/);
  assert.match(edit, /applyAppErrorToForm/);
  assert.match(edit, /z\.enum\(\["draft", "ready", "archived"\]\)/);
  assert.match(api, /transport\.fetch/);
  assert.match(types, /export interface RecordsItem/);

  const doctor = inspectProject(root, { target: '0.12.0' });
  assert.deepEqual(doctor.issues, []);
}));

test('resource generation requires management API capabilities', () => withTemp((root) => {
  createApp([root, '--profile', 'minimal']);
  const specFile = writeSpec(root);
  assert.throws(() => generateModule(['resource', specFile, '--project', root]), /requires missing capabilities/);
}));

test('doctor detects resource spec drift and missing generated files', () => withTemp((root) => {
  createApp([root, '--profile', 'management']);
  const specFile = writeSpec(root);
  generateModule(['resource', specFile, '--project', root]);
  const moduleRoot = join(root, 'src/modules/records');
  writeFileSync(join(moduleRoot, 'foundation.resource.json'), `${readFileSync(join(moduleRoot, 'foundation.resource.json'), 'utf8')}\n`);
  rmSync(join(moduleRoot, 'pages/detail.route.tsx'));
  const result = inspectProject(root, { target: '0.12.0' });
  assert.ok(result.issues.some((issue) => issue.includes('resource spec hash drift')));
  assert.ok(result.issues.some((issue) => issue.includes('pages/detail.route.tsx')));
}));

test('resource routes cannot collide with existing modules', () => withTemp((root) => {
  createApp([root, '--profile', 'management']);
  generateModule(['module', 'existing', '--project', root, '--pattern', 'page', '--route', 'records']);
  const specFile = writeSpec(root);
  assert.throws(() => generateModule(['resource', specFile, '--project', root]), /already declared/);
}));
