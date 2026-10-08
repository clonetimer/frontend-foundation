import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../index.mjs';

function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'foundation-create-app-'));
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test('generates a standalone browser-router application', () => withTemp((root) => {
  const target = join(root, 'sample-app');
  const result = createApp([target, '--name', '@example/sample-app', '--app-id', 'sample.app', '--title', '示例应用']);
  assert.equal(result.routerMode, 'browser');
  assert.equal(result.shell, 'sidebar');

  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@example/sample-app');
  assert.equal(pkg.version, '0.1.0');
  const generatorPackage = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@foundation/app'], `^${generatorPackage.version}`);
  assert.equal(pkg.scripts.test, 'vitest run --passWithNoTests');
  assert.ok(!readFileSync(join(target, 'tsconfig.json'), 'utf8').includes('../../'));

  const config = JSON.parse(readFileSync(join(target, 'public/runtime-config.json'), 'utf8'));
  assert.equal(config.app.name, '示例应用');
  assert.equal(config.router.mode, 'browser');
  const application = readFileSync(join(target, 'src/app/application.ts'), 'utf8');
  assert.match(application, /id: 'sample\.app'/);
  assert.match(application, /shell: \{ preset: 'sidebar' \}/);
  assert.match(application, /projectBrandTheme/);
  assert.match(readFileSync(join(target, 'src/app/project-theme.ts'), 'utf8'), /projectBrandTheme = \{\}/);
  assert.ok(existsSync(join(target, '.gitignore')));
  assert.equal(pkg.scripts['foundation:project'], 'foundation-project');
}));

test('--help does not require a value', () => {
  const result = createApp(['--help']);
  assert.equal(result.help, true);
  assert.match(result.message, /Usage:/);
});

test('escapes the application title in HTML and JSON', () => withTemp((root) => {
  const target = join(root, 'escaped-title');
  createApp([target, '--title', '<Demo & "Test">']);
  const html = readFileSync(join(target, 'index.html'), 'utf8');
  const config = JSON.parse(readFileSync(join(target, 'public/runtime-config.json'), 'utf8'));
  assert.match(html, /&lt;Demo &amp; &quot;Test&quot;&gt;/);
  assert.equal(config.app.name, '<Demo & "Test">');
}));

test('supports hash router and explicit Foundation version', () => withTemp((root) => {
  const target = join(root, 'hash-app');
  createApp([target, '--router', 'hash', '--foundation-version', '1.2.3']);
  const config = JSON.parse(readFileSync(join(target, 'public/runtime-config.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(config.router.mode, 'hash');
  assert.equal(pkg.dependencies['@foundation/ui'], '^1.2.3');
}));

test('refuses a non-empty target unless --force is used', () => withTemp((root) => {
  const target = join(root, 'occupied');
  createApp([target]);
  writeFileSync(join(target, 'keep.txt'), 'keep');
  assert.throws(() => createApp([target]), /not empty/);
  createApp([target, '--force']);
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'keep');
}));

test('rejects invalid package, app id, router and version', () => withTemp((root) => {
  assert.throws(() => createApp([join(root, 'a'), '--name', 'Bad Name']), /Invalid package name/);
  assert.throws(() => createApp([join(root, 'b'), '--app-id', '9bad']), /Invalid application id/);
  assert.throws(() => createApp([join(root, 'c'), '--router', 'memory']), /Invalid router mode/);
  assert.throws(() => createApp([join(root, 'd'), '--foundation-version', 'latest']), /Invalid Foundation version/);
}));

test('template dependency snapshot stays aligned with workspace catalog', () => {
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const workspace = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const versions = JSON.parse(readFileSync(resolve(import.meta.dirname, '../versions.json'), 'utf8'));
  const rootPackage = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(versions.packageManager, rootPackage.packageManager);
  assert.equal(versions.node, rootPackage.engines.node);
  const keys = ['react', 'react-dom', 'react-router', 'antd', '@tanstack/react-query', 'zod', '@types/node', '@types/react', '@types/react-dom', '@vitejs/plugin-react', 'typescript', 'vite', 'vitest', 'react-hook-form', 'echarts'];
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quoted = new RegExp(`^\\s*["']${escaped}["']:\\s*([^#\\s]+)`, 'm');
    const bare = new RegExp(`^\\s*${escaped}:\\s*([^#\\s]+)`, 'm');
    const match = workspace.match(quoted) ?? workspace.match(bare);
    assert.ok(match, `catalog entry missing for ${key}`);
    assert.equal(versions[key], match[1], `version snapshot drift for ${key}`);
  }
});


test('lists domain-neutral project profiles', () => {
  const result = createApp(['--list-profiles']);
  assert.equal(result.listProfiles, true);
  assert.deepEqual(result.profiles.map((profile) => profile.name), ['minimal', 'management', 'data-workbench']);
  assert.deepEqual(result.profiles.find((profile) => profile.name === 'management')?.capabilities,
    ['application-shell', 'ui-patterns', 'data-table', 'forms', 'permission', 'error-model', 'api-transport']);
});

test('management profile installs management capabilities without OSS candidates', () => withTemp((root) => {
  const target = join(root, 'management-app');
  const result = createApp([target, '--profile', 'management']);
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(result.profile, 'management');
  assert.equal(pkg.foundation.profile, 'management');
  for (const name of ['@foundation/app', '@foundation/ui', '@foundation/data', '@foundation/forms', '@foundation/security', '@foundation/core', '@foundation/api']) {
    assert.ok(pkg.dependencies[name], `${name} missing`);
  }
  assert.equal(pkg.dependencies['react-hook-form'] !== undefined, true);
  assert.equal(pkg.dependencies['@foundation/async'], undefined);
  assert.equal(pkg.dependencies['@ant-design/pro-components'], undefined);
  assert.equal(pkg.dependencies['@refinedev/core'], undefined);
}));

test('data-workbench profile installs engineering/data capabilities', () => withTemp((root) => {
  const target = join(root, 'data-app');
  createApp([target, '--profile', 'data-workbench', '--router', 'hash']);
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(target, 'public/runtime-config.json'), 'utf8'));
  assert.equal(pkg.foundation.profile, 'data-workbench');
  for (const name of ['@foundation/app', '@foundation/ui', '@foundation/file', '@foundation/async', '@foundation/visualization']) {
    assert.ok(pkg.dependencies[name], `${name} missing`);
  }
  assert.equal(pkg.dependencies.echarts !== undefined, true);
  assert.equal(pkg.dependencies['react-hook-form'], undefined);
  assert.equal(config.router.mode, 'hash');
}));

test('rejects unknown project profile', () => withTemp((root) => {
  assert.throws(() => createApp([join(root, 'bad-profile'), '--profile', 'enterprise-everything']), /Unknown profile/);
}));

test('lists built-in application shells independently from capability profiles', () => {
  const result = createApp(['--list-shells']);
  assert.equal(result.listShells, true);
  assert.deepEqual(result.shells.map((shell) => shell.id), ['sidebar', 'top-nav', 'workspace', 'bare']);
});

test('supports explicit application shell selection', () => withTemp((root) => {
  const target = join(root, 'workspace-app');
  const result = createApp([target, '--shell', 'workspace']);
  assert.equal(result.shell, 'workspace');
  const config = JSON.parse(readFileSync(join(target, 'foundation.config.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  const application = readFileSync(join(target, 'src/app/application.ts'), 'utf8');
  assert.equal(config.ui.shell, 'workspace');
  assert.equal(pkg.foundation.shell, 'workspace');
  assert.match(application, /shell: \{ preset: 'workspace' \}/);
}));

test('rejects unknown application shell', () => withTemp((root) => {
  assert.throws(() => createApp([join(root, 'bad-shell'), '--shell', 'floating-dashboard']), /Unknown shell/);
}));

test('lists deployment targets independently from capability profiles', () => {
  const result = createApp(['--list-deployments']);
  assert.equal(result.listDeployments, true);
  assert.deepEqual(result.deployments.map((deployment) => deployment.name), ['none', 'nginx']);
  assert.match(result.deployments.find((deployment) => deployment.name === 'nginx')?.nginxImage ?? '', /^nginx:1\.30\.4-alpine$/);
});



test('lists contract modes independently from profiles and deployments', () => {
  const result = createApp(['--list-contracts']);
  assert.equal(result.listContracts, true);
  assert.deepEqual(result.contracts.map((contract) => contract.name), ['none', 'openapi']);
  assert.equal(result.contracts.find((contract) => contract.name === 'openapi')?.contracts[0]?.adapter, 'hey-api-typescript');
});

test('nginx deployment emits production delivery assets without changing profile capabilities', () => withTemp((root) => {
  const target = join(root, 'nginx-app');
  const result = createApp([target, '--profile', 'management', '--deployment', 'nginx']);
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(result.deployment, 'nginx');
  assert.equal(pkg.foundation.profile, 'management');
  assert.equal(pkg.foundation.deployment, 'nginx');
  for (const file of [
    '.dockerignore',
    'deploy/nginx/Dockerfile',
    'deploy/nginx/default.static.conf',
    'deploy/nginx/default.proxy.conf.template',
    'deploy/nginx/40-foundation-runtime.sh',
    'deploy/nginx/README.md'
  ]) assert.equal(readFileSync(join(target, file), 'utf8').length > 0, true, `${file} missing`);
  assert.equal(pkg.dependencies['@foundation/data'] !== undefined, true);
  assert.equal(pkg.dependencies.redis, undefined);
}));

test('default deployment target remains hosting-neutral', () => withTemp((root) => {
  const target = join(root, 'neutral-app');
  createApp([target]);
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.foundation.deployment, 'none');
  assert.equal(readFileSync(join(target, 'README.md'), 'utf8').includes('Deployment target: `none`'), true);
  assert.throws(() => readFileSync(join(target, 'deploy/nginx/Dockerfile'), 'utf8'));
}));

test('rejects unknown deployment target', () => withTemp((root) => {
  assert.throws(() => createApp([join(root, 'bad-deployment'), '--deployment', 'redis']), /Unknown deployment target/);
}));

test('writes resolved foundation config and local productivity tooling', () => withTemp((root) => {
  const target = join(root, 'configured-app');
  createApp([target, '--profile', 'management']);
  const config = JSON.parse(readFileSync(join(target, 'foundation.config.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.profile.name, 'management');
  assert.equal(config.profile.source, 'builtin');
  assert.equal(config.ui.shell, 'sidebar');
  assert.deepEqual(config.profile.foundationPackages, ['app', 'ui', 'data', 'forms', 'security', 'core', 'api']);
  assert.equal(config.modules.directory, 'src/modules');
  assert.ok(pkg.devDependencies['@foundation/create-app']);
  assert.equal(pkg.scripts['foundation:doctor'], 'foundation-doctor . --strict');
  assert.equal(pkg.scripts['foundation:generate'], 'foundation-generate');
  assert.match(readFileSync(join(target, 'src/modules/index.ts'), 'utf8'), /import\.meta\.glob/);
}));

test('supports JSON-defined custom profiles without overriding built-ins', () => withTemp((root) => {
  const profileFile = join(root, 'profiles.json');
  writeFileSync(profileFile, JSON.stringify({
    'internal-workbench': {
      extends: 'management',
      description: 'Organization-specific composition expressed as data.',
      capabilities: ['visualization'],
      foundationPackages: ['visualization'],
      dependencies: ['echarts']
    }
  }));
  const target = join(root, 'custom-app');
  createApp([target, '--profile', 'internal-workbench', '--profile-file', profileFile]);
  const config = JSON.parse(readFileSync(join(target, 'foundation.config.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(config.profile.name, 'internal-workbench');
  assert.equal(config.profile.source, 'custom');
  assert.ok(pkg.dependencies['@foundation/data']);
  assert.ok(pkg.dependencies['@foundation/forms']);
  assert.ok(pkg.dependencies['@foundation/security']);
  assert.ok(pkg.dependencies['@foundation/visualization']);
  assert.ok(pkg.dependencies['react-hook-form']);
  assert.ok(pkg.dependencies.echarts);

  writeFileSync(profileFile, JSON.stringify({ minimal: { description: 'bad', capabilities: [], foundationPackages: [], dependencies: [] } }));
  assert.throws(() => createApp([join(root, 'override'), '--profile-file', profileFile]), /cannot override built-in profile/);
}));


test('rejects custom profile inheritance cycles', () => withTemp((root) => {
  const profileFile = join(root, 'profiles-cycle.json');
  writeFileSync(profileFile, JSON.stringify({
    alpha: { extends: 'beta', description: 'alpha', capabilities: [], foundationPackages: [], dependencies: [] },
    beta: { extends: 'alpha', description: 'beta', capabilities: [], foundationPackages: [], dependencies: [] }
  }));
  assert.throws(() => createApp([join(root, 'cycle'), '--profile', 'alpha', '--profile-file', profileFile]), /inheritance cycle/);
}));
