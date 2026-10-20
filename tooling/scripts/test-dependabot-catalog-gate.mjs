import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogs, resolvedPackages, checkCatalog, checkUpgrade, checkEvent } from './dependabot-catalog-gate.mjs';

const workspace = [
  'packages:', '  - packages/*', 'catalog:',
  "  '@tanstack/react-query': ^5.104.0",
  '  storybook: ^10.6.1',
  "  '@types/node': ^22.0.0", ''
].join('\n');
const lock = (react='5.104.1', storybook='10.6.1', reorder=false) => [
  "lockfileVersion: '9.0'", 'catalogs:', '  default:',
  "    '@tanstack/react-query':", '      specifier: ^5.104.0', '      version: ' + react,
  "    '@types/node':", '      specifier: ^22.0.0', '      version: 22.20.5',
  '    storybook:', '      specifier: ^10.6.1', '      version: ' + storybook,
  'importers:', '  .: {}',
  ...(reorder ? ['  packages/b: {}', '  packages/a: {}'] : ['  packages/a: {}', '  packages/b: {}']),
  'packages:', "  '@tanstack/react-query@" + react + "':",
  '    resolution: {integrity: demo}', '  storybook@' + storybook + ':',
  '    resolution: {integrity: demo}', "  '@types/node@22.20.5':",
  '    resolution: {integrity: demo}', ''
].join('\n');
const title = 'chore(deps): bump @tanstack/react-query from 5.104.1 to 5.104.3 in runtime group';
const bot = {pull_request:{user:{login:'dependabot[bot]'},title}};
test('catalog and snapshot parsers handle quoted scoped packages', () => {
  assert.equal(catalogs(lock(),'lock').get('@tanstack/react-query').version,'5.104.1');
  assert.equal(catalogs(workspace,'workspace').get('storybook').specifier,'^10.6.1');
  assert(resolvedPackages(lock()).has('@tanstack/react-query@5.104.1'));
});
test('importer reordering does not pass as a dependency upgrade', () => {
  assert.throws(()=>checkUpgrade(lock(),lock(undefined,undefined,true),title),/claimed upgrade/);
  assert.throws(()=>checkUpgrade(lock(),lock(undefined,undefined,true),'chore(deps): bump a group with 2 updates'),/only reordered/);
});
test('target catalog version must really match the PR title', () => {
  assert.match(checkUpgrade(lock(),lock('5.104.3'),title),/5.104.3/);
  assert.throws(()=>checkUpgrade(lock(),lock('5.104.1','10.6.2'),title),/claimed upgrade/);
});
test('standalone non-catalog bump requires package snapshot change', () => {
  assert.throws(()=>checkUpgrade(lock(),lock(),'build(deps): bump other from 1.0.0 to 1.0.1'),/without new resolved package/);
});
test('frozen-lockfile caveat: reject workspace/lock catalog specifier drift', () => {
  assert.equal(checkCatalog(workspace,lock()),3);
  assert.throws(()=>checkCatalog(workspace.replace('^5.104.0','^5.104.3'),lock()),/catalog\/lockfile drift/);
});
test('check event skips humans and normal pushes', () => {
  assert.match(checkEvent(null,workspace,lock(),null),/skipped/);
  assert.match(checkEvent({pull_request:{user:{login:'human'},title}},workspace,lock(),null),/skipped/);
});
test('Dependabot PR verifies title and resolved version', () => {
  assert.throws(()=>checkEvent(bot,workspace,lock(undefined,undefined,true),lock(),['pnpm-lock.yaml']),/claimed upgrade/);
  assert.match(checkEvent(bot,workspace,lock('5.104.3'),lock(),['pnpm-lock.yaml']),/real upgrade/);
});
test('valid GitHub Actions-only Dependabot PR is not blocked', () => {
  assert.match(checkEvent(bot,workspace,lock(),lock(),['.github/workflows/ci.yml']),/Workflow-only/);
  assert.throws(()=>checkEvent(bot,workspace,lock(),lock(),['.github/workflows/ci.yml','pnpm-lock.yaml']),/claimed upgrade/);
});
