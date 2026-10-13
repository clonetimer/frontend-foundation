/** Uses the existing Project Compiler in a temporary directory; does not mutate the workspace. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileProjectBlueprint } from '../create-app/project.mjs';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch { throw new Error('TypeScript dependency not installed. Run pnpm install --frozen-lockfile first.'); }

// bridge.ts has no imports; transpile it with the repository's TypeScript dependency.
const code = readFileSync(resolve(import.meta.dirname, '../../apps/showcase/src/modules/pattern-atlas/bridge.ts'), 'utf8');
const cjs = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
const module = { exports: {} };
new Function('module', 'exports', cjs)(module, module.exports);
const { buildCompositionSnippet } = module.exports;

for (const pattern of ['bento', 'master-detail']) {
  const target = mkdtempSync(join(tmpdir(), 'foundation-atlas-compile-'));
  try {
    const blueprint = {
      schemaVersion: 1,
      project: { id: 'pattern.check', packageName: 'pattern-check', title: 'Pattern Compiler Check' },
      foundation: { profile: 'minimal', shell: 'workspace', router: 'browser', deployment: 'none', contract: 'none' },
      pages: [{ id: 'overview', title: 'Overview', pattern: 'dashboard', index: true, composition: buildCompositionSnippet(pattern) }],
      navigation: { items: [{ target: 'overview', label: 'Overview', order: 0 }] },
      resources: []
    };
    const input = join(target, 'foundation.project.json');
    writeFileSync(input, JSON.stringify(blueprint, null, 2));
    const result = compileProjectBlueprint(input);
    const pageFile = join(target, 'src/modules/overview/pages/index.route.tsx');
    assert(existsSync(pageFile));
    const page = readFileSync(pageFile, 'utf8');
    assert.match(page, pattern === 'bento' ? /GridLayout/ : /SplitLayout/);
    assert.match(page, /foundation-node:patternAtlasRoot/);
    console.log(`${pattern}: passed full Blueprint compile, ${result.written.length} written files`);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}
