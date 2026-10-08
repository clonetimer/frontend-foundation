import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectProject } from '../doctor.mjs';

function project(pkg, source = '') {
  const root = mkdtempSync(join(tmpdir(), 'foundation-doctor-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2));
  writeFileSync(join(root, 'src/index.ts'), source);
  writeFileSync(join(root, 'public/runtime-config.json'), '{}');
  return root;
}

test('doctor accepts aligned Foundation packages', () => {
  const root = project({ packageManager: 'pnpm@11.7.0', dependencies: { '@foundation/app': '^0.4.0', '@foundation/ui': '^0.4.0' } });
  try {
    const result = inspectProject(root, { target: '0.4.0' });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.warnings, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('doctor blocks mixed minor lines and deep imports', () => {
  const root = project(
    { packageManager: 'pnpm@11.7.0', dependencies: { '@foundation/app': '^0.4.0', '@foundation/ui': '^0.3.2' } },
    `import { x } from '@foundation/ui/src/internal';\nvoid x;\n`
  );
  try {
    const result = inspectProject(root, { target: '0.4.0' });
    assert.ok(result.issues.some((x) => x.includes('multiple minor lines')));
    assert.ok(result.issues.some((x) => x.includes('Deep Foundation import')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('doctor validates generated profile capability dependencies', () => {
  const root = project({
    packageManager: 'pnpm@11.7.0',
    foundation: { profile: 'management' },
    dependencies: {
      '@foundation/app': '^0.7.0',
      '@foundation/ui': '^0.7.0',
      '@foundation/data': '^0.7.0',
      '@foundation/forms': '^0.7.0',
      '@foundation/security': '^0.7.0',
      '@foundation/core': '^0.7.0',
      '@foundation/api': '^0.7.0',
      'react-hook-form': '^7.89.0'
    }
  });
  try {
    const result = inspectProject(root, { target: '0.7.0' });
    assert.deepEqual(result.issues, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('doctor detects profile dependency drift', () => {
  const root = project({
    packageManager: 'pnpm@11.7.0',
    foundation: { profile: 'data-workbench' },
    dependencies: {
      '@foundation/app': '^0.7.0',
      '@foundation/ui': '^0.7.0',
      '@foundation/file': '^0.7.0',
      '@foundation/async': '^0.7.0'
    }
  });
  try {
    const result = inspectProject(root, { target: '0.7.0' });
    assert.ok(result.issues.some((issue) => issue.includes('@foundation/visualization')));
    assert.ok(result.issues.some((issue) => issue.includes('echarts')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('doctor detects missing deployment assets declared by generated metadata', () => {
  const root = project({
    packageManager: 'pnpm@11.7.0',
    foundation: { profile: 'minimal', deployment: 'nginx' },
    dependencies: { '@foundation/app': '^0.8.0', '@foundation/ui': '^0.8.0' }
  });
  try {
    const result = inspectProject(root, { target: '0.8.0' });
    assert.ok(result.issues.some((issue) => issue.includes('Deployment nginx requires deploy/nginx/Dockerfile')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('doctor validates generated module manifests against resolved project capabilities', () => {
  const root = project({
    packageManager: 'pnpm@11.7.0',
    foundation: { profile: 'minimal' },
    dependencies: { '@foundation/app': '^0.9.0', '@foundation/ui': '^0.9.0' }
  });
  try {
    mkdirSync(join(root, 'src/modules/example'), { recursive: true });
    mkdirSync(join(root, 'src/modules'), { recursive: true });
    writeFileSync(join(root, 'src/modules/index.ts'), 'export const modules = [];\n');
    writeFileSync(join(root, 'src/modules/example/routes.ts'), 'export const module = {};\n');
    writeFileSync(join(root, 'src/modules/example/index.ts'), 'export { module } from "./routes";\n');
    writeFileSync(join(root, 'src/modules/example/foundation.module.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'example',
      pattern: 'management',
      route: { path: 'example' },
      requiredCapabilities: ['application-shell', 'ui-patterns', 'data-table']
    }, null, 2));
    writeFileSync(join(root, 'foundation.config.json'), JSON.stringify({
      schemaVersion: 1,
      foundationVersion: '0.9.0',
      profile: {
        name: 'minimal',
        source: 'builtin',
        capabilities: ['application-shell', 'ui-patterns'],
        foundationPackages: ['app', 'ui'],
        dependencies: []
      },
      deployment: 'none',
      modules: { directory: 'src/modules', routeFile: 'routes.ts', exportName: 'module' }
    }, null, 2));
    const result = inspectProject(root, { target: '0.9.0' });
    assert.ok(result.issues.some((issue) => issue.includes('requires missing capability data-table')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('doctor rejects module contract references that are not declared by the project', () => {
  const root = project({
    packageManager: 'pnpm@11.7.0',
    foundation: { profile: 'minimal', contract: 'none' },
    dependencies: { '@foundation/app': '^0.10.0', '@foundation/ui': '^0.10.0' }
  });
  try {
    mkdirSync(join(root, 'src/modules/example'), { recursive: true });
    writeFileSync(join(root, 'src/modules/index.ts'), 'export const modules = [];\n');
    writeFileSync(join(root, 'src/modules/example/routes.ts'), 'export const module = {};\n');
    writeFileSync(join(root, 'src/modules/example/index.ts'), 'export { module } from "./routes";\n');
    writeFileSync(join(root, 'src/modules/example/foundation.module.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'example',
      pattern: 'page',
      route: { path: 'example' },
      requiredCapabilities: ['application-shell', 'ui-patterns'],
      contracts: ['api']
    }, null, 2));
    writeFileSync(join(root, 'foundation.config.json'), JSON.stringify({
      schemaVersion: 1,
      foundationVersion: '0.10.0',
      profile: {
        name: 'minimal',
        source: 'builtin',
        capabilities: ['application-shell', 'ui-patterns'],
        foundationPackages: ['app', 'ui'],
        dependencies: []
      },
      deployment: 'none',
      contractMode: 'none',
      contracts: [],
      modules: { directory: 'src/modules', routeFile: 'routes.ts', exportName: 'module' }
    }, null, 2));
    const result = inspectProject(root, { target: '0.10.0' });
    assert.ok(result.issues.some((issue) => issue.includes('references unknown contract api')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('doctor validates configured application shell metadata', () => {
  const root = project({
    packageManager: 'pnpm@11.7.0',
    foundation: { profile: 'minimal', shell: 'workspace' },
    dependencies: { '@foundation/app': '^0.12.0', '@foundation/ui': '^0.12.0' }
  });
  try {
    mkdirSync(join(root, 'src/modules'), { recursive: true });
    writeFileSync(join(root, 'foundation.config.json'), JSON.stringify({
      schemaVersion: 1,
      foundationVersion: '0.12.0',
      profile: {
        name: 'minimal',
        source: 'builtin',
        capabilities: ['application-shell', 'ui-patterns'],
        foundationPackages: ['app', 'ui'],
        dependencies: []
      },
      ui: { shell: 'floating-dashboard' },
      deployment: 'none',
      contractMode: 'none',
      contracts: [],
      modules: { directory: 'src/modules', routeFile: 'routes.ts', exportName: 'module' }
    }, null, 2));
    writeFileSync(join(root, 'src/modules/index.ts'), 'export const modules = [];\n');
    const result = inspectProject(root, { target: '0.12.0' });
    assert.ok(result.issues.some((issue) => issue.includes('Unknown foundation.config.json ui.shell')));
    assert.ok(result.issues.some((issue) => issue.includes('differs from package.json foundation.shell')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
