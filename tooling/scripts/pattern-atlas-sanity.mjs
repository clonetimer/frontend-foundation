/** Dependency-free structural checks; real TS typecheck/Vite build still require pnpm install. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
function read(file) { return readFileSync(resolve(root, file), 'utf8'); }
const route = read('apps/showcase/src/modules/pattern-atlas/routes.ts');
const app = read('apps/showcase/src/app/application.ts');
const demo = read('apps/showcase/src/modules/pattern-atlas/effects/EffectDemo.tsx');
const styles = read('apps/showcase/src/modules/pattern-atlas/effects/styles.css');
const config = read('apps/showcase/src/modules/pattern-atlas/effects/config.ts');
const readme = read('docs/PATTERN_ATLAS_ITERATION_RECORD.md');
assert(route.includes("path: 'patterns/effects'"));
assert(route.includes("path: 'patterns/config'"));
assert(route.includes("path: 'patterns'"));
assert(app.includes('patternAtlasModule'));
assert(demo.includes('role="progressbar"'));
assert(demo.includes('aria-pressed'));
assert(demo.includes('onPointerMove'));
assert(styles.includes('prefers-reduced-motion:reduce'));
assert(styles.includes('[data-motion="off"]'));
assert(config.includes('normalizeDesignConfig'));
assert(config.includes('typeScale'));
assert(read('apps/showcase/src/modules/pattern-atlas/effects/brief.ts').includes('version: 2'));
assert(read('apps/showcase/src/modules/pattern-atlas/center/model.ts').includes('normalizeEffectBindings'));
assert(read('apps/showcase/src/modules/pattern-atlas/center/styles.css').includes('prefers-reduced-motion:reduce'));
assert(readme.includes('Pattern Atlas'));
const adapter = read('apps/showcase/src/modules/pattern-atlas/center/theme-adapter.ts');
const centerPage = read('apps/showcase/src/modules/pattern-atlas/center/pages/config.route.tsx');
assert(adapter.includes("import type { BrandTheme"));
assert(adapter.includes('previewOnly'));
assert(adapter.includes('toFoundationThemeExport'));
assert(centerPage.includes('<ThemeBridgePreview'));
assert(centerPage.includes('setScopedThemeEnabled'));
assert(read('apps/showcase/src/modules/pattern-atlas/center/theme-bridge.css').includes('.pa-theme-bridge'));
assert(read('apps/showcase/package.json').includes('"@foundation/theme"'));
assert(read('pnpm-lock.yaml').includes("      '@foundation/theme':\n        specifier: workspace:*\n        version: link:../../packages/theme"));

for (const file of [
  'apps/showcase/src/modules/pattern-atlas/effects/pages/effects.route.tsx',
  'apps/showcase/src/modules/pattern-atlas/tests/effects.test.ts',
  'apps/showcase/src/modules/pattern-atlas/effects/brief.ts',
  'apps/showcase/src/modules/pattern-atlas/center/pages/config.route.tsx',
  'apps/showcase/src/modules/pattern-atlas/tests/center.test.ts',
  'apps/showcase/src/modules/pattern-atlas/tests/theme-adapter.test.ts'
]) assert(existsSync(resolve(root, file)), `${file} missing`);
const recordsRoute = read('apps/showcase/src/modules/records/routes.ts');
const recordsList = read('apps/showcase/src/modules/records/pages/records-list.route.tsx');
const pilot = read('apps/showcase/src/modules/records/pages/records-pilot.route.tsx');
const runtime = JSON.parse(read('apps/showcase/public/runtime-config.json'));
assert(recordsRoute.includes("path: 'pilot'"));
assert(recordsRoute.includes("permission: 'records.read'"));
assert(recordsList.includes('getActivePilotRevision'));
assert(recordsList.includes('ScopedRecordsTheme'));
assert(pilot.includes('parsePilotFile'));
assert(pilot.includes('query.data?.items'));
assert(pilot.includes('activatePilotRevision'));
assert(read('apps/showcase/src/modules/pattern-atlas/pilot/model.ts').includes('PILOT_MAX_REVISIONS'));
assert(read('apps/showcase/src/modules/pattern-atlas/pilot/styles.css').includes('.pa-pilot-page'));
assert(runtime.features.patternAtlasPilot === true);
console.log('Pattern Atlas structural sanity passed (not a full build)');
