import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const sourceNames=[
  'p5_capability_contract.mjs',
  'p5_r3c_scoped_journal.mjs',
  'p5_r3c2_runtime_adapter.mjs'
];
function published(){
  const raw=read('apps/showcase/src/modules/pattern-atlas/studio/exported-p5-reference.ts');
  const prefix='export const exportedP5ReferenceSources = ';
  const start=raw.indexOf(prefix);
  assert(start>=0,'P5 snapshots missing');
  assert(raw.endsWith(' as const;\n'),'P5 snapshots are not frozen generated source');
  return JSON.parse(raw.slice(start+prefix.length,-' as const;\n'.length));
}
test('standalone P5 source files are exact source mirrors including imports',()=>{
  const assets=published();
  assert.deepEqual(assets.map(x=>x.name),
    sourceNames.map(x=>'p5-reference/'+x));
  for(let i=0;i<sourceNames.length;i++){
    assert.equal(Buffer.from(assets[i].base64,'base64').toString('utf8'),read('tooling/scripts/aas_p0/'+sourceNames[i]),
      'Standalone source drift: '+sourceNames[i]);
  }
  assert.match(Buffer.from(assets[2].base64,'base64').toString('utf8'),/\.\/p5_capability_contract\.mjs/);
  assert.match(Buffer.from(assets[2].base64,'base64').toString('utf8'),/\.\/p5_r3c_scoped_journal\.mjs/);
});
test('exporter packages optional source without importing or activating it',()=>{
  const exporter=read('apps/showcase/src/modules/pattern-atlas/studio/exporter.ts');
  assert.match(exporter,/import \{ exportedP5ReferenceSources \} from '\.\/exported-p5-reference';/);
  assert.match(exporter,/\.\.\.exportedP5ReferenceSources\.map\(/);
  assert.doesNotMatch(exporter,/import .*p5_r3c2_runtime_adapter\.mjs/);
  const preview=read('apps/showcase/src/modules/pattern-atlas/studio/WidgetPreview.tsx');
  const provider=read('apps/showcase/src/modules/pattern-atlas/studio/StudioRecords.tsx');
  assert.doesNotMatch(preview,/createP5R3c2ReferenceAdapter|p5_r3c2_runtime_adapter/);
  assert.doesNotMatch(provider,/createP5R3c2ReferenceAdapter|p5_r3c2_runtime_adapter/);
});
test('Studio source settings display fail-closed source eligibility from shared adapter',()=>{
  const route=read('apps/showcase/src/modules/pattern-atlas/studio/pages.route.tsx');
  assert.match(route,/doc\.dataSources\.filter\(p5R3c2SourceIsEligible\)\.length/);
  const adapter=read('tooling/scripts/aas_p0/p5_r3c2_runtime_adapter.mjs');
  assert.match(adapter,/export function p5R3c2SourceIsEligible\(source\)/);
  assert.match(adapter,/return false;/);
  assert.match(adapter,/enabledByDefault:false/);
  assert.doesNotMatch(adapter,/createElement|addEventListener|intercept/);
});
