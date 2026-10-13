#!/usr/bin/env node
/** Build the actual Studio ZIP in a new temp project outside this workspace. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import ts from 'typescript';
const __dirname = dirname(fileURLToPath(import.meta.url));
const loadCompiled = Module.createRequire(import.meta.url);
for (const extension of ['.ts', '.tsx']) {
  Module._extensions[extension] = (module, path) => {
    const result = ts.transpileModule(readFileSync(path, 'utf8'), {
      fileName: path, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    });
    const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, 'Cannot parse ' + path);
    module._compile(result.outputText, path);
  };
}
const studio = resolve(__dirname, '../../apps/showcase/src/modules/pattern-atlas/studio');
const { createStudioDocument } = loadCompiled(join(studio, 'model.ts'));
const { projectExportFiles, zipTextFiles } = loadCompiled(join(studio, 'exporter.ts'));
function exec(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, stdio:'inherit', timeout: 600000, env: { ...process.env, CI:'true' } });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, program + ' ' + args.join(' ') + ' failed');
}
(async () => {
  const destination = mkdtempSync(join(tmpdir(), 'pattern-atlas-export-'));
  try {
    const files = projectExportFiles(createStudioDocument());
    const data = new Uint8Array(await zipTextFiles(files).arrayBuffer());
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let cursor = 0, extracted = 0;
    while (cursor + 30 < data.length && view.getUint32(cursor,true) === 0x04034b50) {
      assert.equal(view.getUint16(cursor+8,true), 0, 'ZIP must have stored entries');
      const size = view.getUint32(cursor+18,true);
      const length = view.getUint16(cursor+26,true);
      const extra = view.getUint16(cursor+28,true);
      const name = new TextDecoder().decode(data.subarray(cursor+30,cursor+30+length));
      assert.match(name,/^(?!\/)(?!.*\.\.)[\w./-]+$/, 'Invalid ZIP filename');
      const begin = cursor+30+length+extra, end = begin+size;
      assert(end<=data.length,'Truncated ZIP');
      const filename = join(destination,name);
      mkdirSync(dirname(filename),{recursive:true});
      writeFileSync(filename,data.subarray(begin,end));
      extracted++;cursor=end;
    }
    assert.equal(view.getUint32(cursor,true),0x02014b50,'Missing ZIP directory');
    assert.equal(extracted,files.length,'Entries missing');
    const pkg = JSON.parse(readFileSync(join(destination,'package.json'),'utf8'));
    assert(!Object.keys(pkg.dependencies || {}).some((dep) => dep.startsWith('@foundation/')), 'Workspace dependency leaked');
    console.log('Extracted',extracted,'files into',destination);
    exec('npm',['install','--ignore-scripts','--no-audit','--no-fund'],destination);
    exec('npm',['run','build'],destination);
    const built = join(destination,'dist','index.html');
    assert(existsSync(built),'Vite production output missing');
    assert.match(readFileSync(built,'utf8'),/assets\//,'Vite bundle missing');
    console.log('STANDALONE EXPORT BUILD PASSED');
  } finally {
    if(process.env.KEEP_ATLAS_EXPORT==='1') console.log('Preserving',destination);
    else rmSync(destination,{recursive:true,force:true});
  }
})().catch((error) => { console.error('STANDALONE EXPORT BUILD FAILED',error);process.exitCode=1; });
