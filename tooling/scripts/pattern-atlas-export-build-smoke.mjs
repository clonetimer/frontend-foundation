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
const { createStudioDocument, createNode, insertNode, setDecoration } = loadCompiled(join(studio, 'model.ts'));
const { runExportedBrowserSmoke } = await import('./pattern-atlas-export-browser-check.mjs');
const { projectExportFiles, zipTextFiles } = loadCompiled(join(studio, 'exporter.ts'));
const { newDemoSource } = loadCompiled(join(studio, 'data-sources.ts'));
function exec(program, args, cwd) {
  // npm is a .cmd wrapper on Windows, which must be launched via cmd.exe.
  // This helper is only called with fixed internal commands/flags, never user input.
  const windowsNpm = process.platform === 'win32' && program === 'npm';
  const command = windowsNpm ? (process.env.ComSpec || 'cmd.exe') : program;
  const commandArgs = windowsNpm ? ['/d', '/c', 'npm', ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd, stdio:'inherit', timeout: 600000, env: { ...process.env, CI:'true' } });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, program + ' ' + args.join(' ') + ' failed');
}
(async () => {
  const destination = mkdtempSync(join(tmpdir(), 'pattern-atlas-export-'));
  try {
    const browserAcceptance = process.argv.includes('--browser');
    let document = createStudioDocument();
    if (browserAcceptance) {
      const pageId = document.blueprint.pages[0].id;
      document.dataSources = [
        { ...newDemoSource('overlay-edit'), saveUrl: 'http://127.0.0.1:4198/api/edit/{id}' },
        { ...newDemoSource('isolated-table-shared'), name: '共享远程表格源',
          listUrl: 'http://127.0.0.1:4198/api/table?view=shared',
          detailUrl: 'http://127.0.0.1:4198/api/row/{id}',
          deleteUrl: 'http://127.0.0.1:4198/api/delete/{id}',
          itemsPath: 'data.items', totalPath: 'data.total', detailPath: 'data',
          idField: 'id', labelField: 'name', pageSize: 2,
          paginationMode: 'server', pageParam: 'page', sizeParam: 'pageSize', searchParam: 'search',
          filterField: 'status', filterParam: 'filter', filterValues: ['进行中','待开始','已完成'],
          sortField: 'name', sortParam: 'sort', sortDirectionParam: 'order',
          fieldMappings: [{field:'name',responsePath:'alias.name',saveField:'name'}]
        }
      ];
      const fixtures = [
        { id: 'browserModal', kind: 'modal', props: { title: '验收弹窗', triggerText: '打开验收弹窗', description: '验收弹窗内容', okText: '确认', cancelText: '取消' } },
        { id: 'browserDrawer', kind: 'drawer', props: { title: '验收抽屉', triggerText: '打开验收抽屉', description: '验收抽屉内容', placement: 'right', width: 420 } },
        { id: 'browserConfirm', kind: 'popconfirm', props: { title: '验收提示', triggerText: '执行验收确认', description: '请确认是否继续', okText: '确认', cancelText: '取消' } },
        { id: 'formModal21', kind: 'modal', props: { title: '新增记录表单', triggerText: '填写新增记录', description: '请输入记录字段', formFields: 'name|姓名|text|required\nemail|邮箱|email|required\namount|金额|number|optional', submitUrl: 'http://127.0.0.1:4198/api/save', okText: '提交保存', cancelText: '取消',
          successWorkflow: JSON.stringify({steps:[
            {id:'branch-name',type:'branch',source:'draft.name',operator:'equals',expected:'张三',
              onTrue:[{id:'named-success',type:'notify',text:'条件命中：{{draft.name}}'}],onFalse:[{id:'not-named',type:'notify',text:'未命中'}]},
            {id:'highlight-list',type:'emit',targetId:'formList21',action:'highlight'}
          ]}) } },
        { id: 'followupModal21c', kind: 'modal', props: { title: '接口联动表单', triggerText: '提交并执行后续请求', formFields:'name|姓名|text|required', submitUrl:'http://127.0.0.1:4198/api/save', okText:'提交',
          successWorkflow: JSON.stringify({steps:[{id:'confirm-extra',type:'confirm',text:'允许执行后续业务请求？'},
            {id:'call-extra',type:'request',method:'POST',url:'http://127.0.0.1:4198/api/followup',body:'{"name":"{{draft.name}}"}'},
            {id:'extra-notify',type:'notify',text:'后续操作成功'}]}) } },
        { id: 'editModal21b', kind: 'modal', props: { title: '编辑选中记录', triggerText: '编辑当前记录', description: '自动预填', formMode: 'edit-selected', submitMethod: 'PATCH', sourceId: 'overlay-edit', formFields: 'name|姓名|text|required', submitUrl: '', okText: '更新记录', cancelText: '取消' } },
        { id: 'formDrawer21', kind: 'drawer', props: { title: '失败反馈表单', triggerText: '打开错误示例', description: '模拟服务端失败', formFields: 'name|姓名|text|required', submitUrl: 'http://127.0.0.1:4198/api/fail', okText: '尝试保存', cancelText: '取消', failureWorkflow: JSON.stringify({steps:[{id:'fail-notify',type:'notify',text:'提交失败分支执行'}]}) } },
        { id: 'remoteTable22', kind: 'table', props: { title: '远程业务表格', dataUrl: 'http://127.0.0.1:4198/api/table', itemsPath: 'data.items', totalPath: 'data.total', idField: 'id', tableColumns: 'name|名称\nstatus|状态', filterField: 'status', filterValues: '进行中,待开始,已完成', sortField: 'name', pageSize: 2 } },
        { id: 'browserChart', kind: 'line-chart', props: { title: '验收多序列曲线', items: ['A', 'B', 'C'], series: '温度:-20,0,120;参考:0,10,30', values: '', unit: '℃', dataUrl: '/chart-feed.json', dataPath: 'data', refreshMs: 0 } }
      ];
      for (const fixture of fixtures) {
        const page = document.blueprint.pages[0];
        page.composition = insertNode(page.composition, page.composition.id, createNode(fixture.kind, fixture.id), 'inside');
        document = setDecoration(document, pageId + ':' + fixture.id, { widgetKind: fixture.kind, widgetProps: fixture.props });
      }
      const page = document.blueprint.pages[0];
      page.composition = insertNode(page.composition, page.composition.id, createNode('records', 'formList21'), 'inside');
      document = setDecoration(document, pageId + ':formList21', {
        recordList: { url: 'http://127.0.0.1:4198/api/list', itemsPath: 'data.items', idField: 'id', labelField: 'name', pageSize: 8 }
      });
      // A second page has no record-list binding at all. The table must own
      // selection and optional detail retrieval without relying on list paging.
      const isolated = { ...document.blueprint.pages[0], id: 'isolated', title: '无列表表格验证', index: false, composition: createNode('stack', 'isolatedRoot') };
      isolated.composition = insertNode(isolated.composition, isolated.composition.id, createNode('table', 'isolatedTable22'), 'inside');
      isolated.composition = insertNode(isolated.composition, isolated.composition.id, createNode('modal', 'isolatedEdit22'), 'inside');
      document.blueprint.pages.push(isolated);
      document = setDecoration(document, 'isolated:isolatedTable22', {
        widgetKind: 'table',
        widgetProps: { title: '无列表远程表格', sourceId: 'isolated-table-shared',
          dataUrl: '/should-never-be-used', detailUrl: '/should-never-delete/{id}',
          deleteUrl: '/should-never-delete/{id}', deleteEtagField: 'etag',
          tableColumns: 'name|名称\nstatus|状态' }
      });
      document = setDecoration(document, 'isolated:isolatedEdit22', {
        widgetKind: 'modal',
        widgetProps: { title: '跨页编辑表单', triggerText: '编辑跨页记录', formMode: 'edit-selected', submitMethod: 'PATCH',
          sourceId: 'overlay-edit', formFields: 'name|姓名|text|required\nemail|邮箱|email|optional', submitUrl: '' }
      });
    }
    const files = projectExportFiles(document);
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
    if (browserAcceptance) {
      mkdirSync(join(destination, 'public'), { recursive: true });
      writeFileSync(join(destination, 'public', 'chart-feed.json'), JSON.stringify({
        data: { items: ['A', 'B', 'C'], series: [
          { name:'温度', values:[-35, 5, 280] }, { name:'参考', values:[0, 10, 30] }
        ] }
      }), 'utf8');
    }
    const pkg = JSON.parse(readFileSync(join(destination,'package.json'),'utf8'));
    assert(!Object.keys(pkg.dependencies || {}).some((dep) => dep.startsWith('@foundation/')), 'Workspace dependency leaked');
    console.log('Extracted',extracted,'files into',destination);
    exec('npm',['install','--ignore-scripts','--no-audit','--no-fund'],destination);
    exec('npm',['run','build'],destination);
    const built = join(destination,'dist','index.html');
    assert(existsSync(built),'Vite production output missing');
    assert.match(readFileSync(built,'utf8'),/assets\//,'Vite bundle missing');
    if (browserAcceptance) await runExportedBrowserSmoke(destination);
    console.log('STANDALONE EXPORT BUILD PASSED');
  } finally {
    if(process.env.KEEP_ATLAS_EXPORT==='1') console.log('Preserving',destination);
    else rmSync(destination,{recursive:true,force:true});
  }
})().catch((error) => { console.error('STANDALONE EXPORT BUILD FAILED',error);process.exitCode=1; });
