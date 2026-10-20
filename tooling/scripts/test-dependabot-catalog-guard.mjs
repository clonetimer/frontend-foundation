import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readCatalogLock, readWorkspaceCatalog, readPackages,
  assertCatalogMatchesWorkspace, checkAdvertisedUpgrade
} from './dependabot-catalog-guard.mjs';

const workspace = (foo='^1.0.0', bar='^2.0.0') => [
  'packages:', '  - packages/*', 'catalog:',
  '  "@example/foo": '+foo,'  bar: '+bar,''
].join('\n');
const lock = ({foo='1.0.0',bar='2.0.0',fooRange='^1.0.0',barRange='^2.0.0',extra='3.0.0',order='first'}={}) => [
  "lockfileVersion: '9.0'",'',
  'catalogs:','  default:',
  "    '@example/foo':",'      specifier: '+fooRange,'      version: '+foo,
  '    bar:','      specifier: '+barRange,'      version: '+bar,'',
  'importers:','',
  '  .:','    dependencies:',
  ...(order==='first'
    ? ["      '@example/foo':",'        specifier: catalog:','        version: '+foo,'      bar:','        specifier: catalog:','        version: '+bar]
    : ['      bar:','        specifier: catalog:','        version: '+bar,"      '@example/foo':",'        specifier: catalog:','        version: '+foo]),
  '','packages:',
  "  '@example/foo@"+foo+"':",'    resolution: {integrity: sha512-test}',
  '  bar@'+bar+':','    resolution: {integrity: sha512-test}',
  '  transitive@'+extra+':','    resolution: {integrity: sha512-test}',
  '','snapshots:',"  '@example/foo@"+foo+"': {}",''
].join('\n');
const input = (before,after,title,fromWorkspace=workspace(),toWorkspace=workspace()) => ({
  title,oldLock:before,newLock:after,
  oldWorkspace:fromWorkspace,newWorkspace:toWorkspace
});

test('read a scoped pnpm 11 default catalog, packages and declaration ranges',()=>{
  assert.deepEqual([...readCatalogLock(lock()).keys()],['@example/foo','bar']);
  assert.equal(readCatalogLock(lock()).get('@example/foo').version,'1.0.0');
  assert.equal(readWorkspaceCatalog(workspace()).get('@example/foo'),'^1.0.0');
  assert.deepEqual([...readPackages(lock()).get('bar')],['2.0.0']);
  assert.equal(assertCatalogMatchesWorkspace(workspace(),lock()).size,2);
});

test('regression #68: importer ordering is not a resolved dependency update',()=>{
  assert.throws(()=>checkAdvertisedUpgrade(input(lock(),lock({order:'second'}),
    'build(deps): bump @example/foo from 1.0.0 to 1.0.1 in group')),
    /still resolves 1.0.0/);
  assert.throws(()=>checkAdvertisedUpgrade(input(lock(),lock({order:'second'}),
    'build(deps): bump the runtime group with 2 updates')),
    /no package version changed/);
});

test('real catalog resolved bump passes when package snapshots also change',()=>{
  assert.equal(checkAdvertisedUpgrade(input(lock(),lock({foo:'1.0.1'}),
    'build(deps): bump @example/foo from 1.0.0 to 1.0.1')),
    '@example/foo: 1.0.0 -> 1.0.1');
});

test('catalog-only bump without real package resolution is rejected',()=>{
  const noPackageChange = lock({foo:'1.0.1'}).replaceAll('@example/foo@1.0.1','@example/foo@1.0.0');
  assert.throws(()=>checkAdvertisedUpgrade(input(lock(),noPackageChange,
    'build(deps): bump @example/foo from 1.0.0 to 1.0.1')),
    /package resolution was not upgraded/);
});

test('unrelated dependency changes cannot stand in for advertised target',()=>{
  assert.throws(()=>checkAdvertisedUpgrade(input(lock(),lock({bar:'2.0.1'}),
    'build(deps): bump @example/foo from 1.0.0 to 1.0.1')),
    /still resolves 1.0.0/);
});

test('workspace and lock catalog mismatch blocks even otherwise valid updates',()=>{
  assert.throws(()=>assertCatalogMatchesWorkspace(workspace('^1.0.1'),lock()),
    /specifier mismatch/);
  assert.throws(()=>checkAdvertisedUpgrade(input(lock(),lock({foo:'1.0.1'}),
    'build(deps): bump @example/foo from 1.0.0 to 1.0.1',
    workspace(),workspace('^1.0.1'))),
    /specifier mismatch/);
});

test('grouped and transitives must resolve a genuinely new package version',()=>{
  assert.match(checkAdvertisedUpgrade(input(lock(),lock({extra:'3.0.1'}),
    'build(deps): bump the security group with 3 updates')),
    /new resolved package version: transitive/);
  assert.equal(checkAdvertisedUpgrade(input(lock(),lock({extra:'3.0.1'}),
    'build(deps): bump transitive from 3.0.0 to 3.0.1')),
    'transitive: 3.0.0 -> 3.0.1');
});

test('no empty catalogs, missing packages or fabricated prior versions',()=>{
  assert.throws(()=>readCatalogLock('importers:\n'),/missing default/);
  assert.throws(()=>readPackages('catalogs:\n'),/missing lockfile package/);
  assert.throws(()=>checkAdvertisedUpgrade(input(lock(),lock({foo:'1.0.1'}),
    'build(deps): bump @example/foo from 0.9.0 to 1.0.1')),
    /expected 1.0.1/);
});
