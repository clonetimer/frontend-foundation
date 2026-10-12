import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { createStudioDocument, parseStudioFile, serializeStudioDocument } from '../studio/model';
import { projectExportFiles } from '../studio/exporter';
describe('Phase 17 independent export files', () => {
  it('emits a complete React entry, package, typecheck and Vite scripts', () => {
    const doc = createStudioDocument(), files = projectExportFiles(doc);
    const pkg = JSON.parse(files.find((file)=>file.name==='package.json')!.text);
    expect(pkg.scripts.build).toBe('tsc --noEmit && vite build');
    expect(Object.keys(pkg.dependencies)).not.toContain('@foundation/core');
    expect(files.find((file)=>file.name==='src.tsx')?.text).toContain('createRoot');
    expect(files.find((file)=>file.name==='index.html')?.text).toContain('src="/src.tsx"');
    expect(files.find((file)=>file.name==='tsconfig.json')?.text).toContain('Bundler');
    expect(serializeStudioDocument(parseStudioFile(files.find((file)=>file.name==='atlas.studio.json')!.text))).toBe(serializeStudioDocument(doc));
  });
  it('parses every generated TypeScript file', () => {
    const files=projectExportFiles(createStudioDocument()).filter((entry)=>/\.tsx?$/.test(entry.name));
    for(const file of files) {
      const out=ts.transpileModule(file.text,{fileName:file.name,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
      expect((out.diagnostics||[]).filter((item)=>item.category===ts.DiagnosticCategory.Error),file.name).toEqual([]);
    }
  });
});
