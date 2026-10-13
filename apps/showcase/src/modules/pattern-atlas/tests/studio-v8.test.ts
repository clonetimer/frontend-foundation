import { describe, expect, it, vi } from 'vitest';
import { buildProjectBlueprint } from '../builder/project-blueprint';
import { displayApiValue, normalizeApiBinding, readResponsePath, requestStudioApi, validApiUrl, validResponsePath } from '../studio/api';
import { createStudioDocument, normalizeGeometry, parseStudioFile, serializeStudioDocument, setDecoration } from '../studio/model';
import { generateReactPage, generateStudioApp, projectExportFiles } from '../studio/exporter';

describe('phase 8 design studio', () => {
  it('keeps old v1 Studio files usable and gives them a default navigation shell', () => {
    const doc = createStudioDocument();
    const legacy = JSON.parse(serializeStudioDocument(doc)) as Record<string, unknown>;
    delete legacy.shell;
    expect(parseStudioFile(JSON.stringify(legacy)).shell).toEqual({ navigation: 'sidebar', sidebarWidth: 188 });
  });
  it('round trips sidebar mode, multiple pages and geometry without changing Blueprint', () => {
    const original = createStudioDocument();
    const newBlueprint = buildProjectBlueprint({ mode: 'existing', projectId: original.blueprint.project.id, projectTitle: original.blueprint.project.title, pageId: 'reports', pageTitle: '分析报表', template: 'blank', existingBlueprint: original.blueprint });
    const draft = setDecoration({ ...original, blueprint: newBlueprint, shell: { navigation: 'sidebar', sidebarWidth: 226 } }, 'overview:taskCount', { geometry: { x: 20, y: -8, width: 240, height: 130 } });
    const restored = parseStudioFile(serializeStudioDocument(draft));
    expect(restored.blueprint).toEqual(newBlueprint);
    expect(restored.shell).toEqual({ navigation: 'sidebar', sidebarWidth: 226 });
    expect(restored.decorations['overview:taskCount']?.geometry?.width).toBe(240);
    expect(generateStudioApp(restored)).toContain('"reports": Page1');
    expect(generateStudioApp(restored)).toContain('atlas-app-sidebar');
    expect(projectExportFiles(restored).map((item) => item.name)).toContain('pages/reports.tsx');
  });
  it('validates size and offset bounds and strips unexpected fields', () => {
    expect(normalizeGeometry({ x: -20, y: 8, width: 390, height: 180 })).toEqual({ x: -20, y: 8, width: 390, height: 180 });
    expect(normalizeGeometry({ x: 99999, y: '20', width: 0, height: Infinity })).toBeUndefined();
    const d = createStudioDocument();
    const m = setDecoration(d, 'overview:taskCount', { geometry: { width: 260 } });
    expect(generateReactPage(m, 'overview')).toContain('"width":260');
    expect(generateReactPage(m, 'overview')).toContain('"maxWidth":"100%"');
  });
  it('accepts valid URLs and rejects unsupported protocols or embedded credentials', () => {
    expect(validApiUrl('/api/tasks')).toBe(true);
    expect(validApiUrl('https://api.example.test/v1/metrics')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', '//evil.test', 'https://u:p@example.test/x', '/\\evil', 'http://example.test/x y']) expect(validApiUrl(bad)).toBe(false);
  });
  it('allows safe JSON paths only', () => {
    expect(validResponsePath('data.items.0.name')).toBe(true);
    expect(readResponsePath({ data: { items: [{ name: '甲' }] } }, 'data.items.0.name')).toBe('甲');
    for (const bad of ['__proto__', 'constructor', 'data[0]', 'data.__proto__.constructor']) expect(validResponsePath(bad)).toBe(false);
  });
  it('GET and POST bindings are validated and restored from the same design file', () => {
    const doc = createStudioDocument();
    let edited = setDecoration(doc, 'overview:taskCount', { api: { method: 'GET', url: '/api/dashboard', responsePath: 'data.count' } });
    edited = setDecoration(edited, 'overview:overviewTitle', { api: { method: 'GET', url: '/api/title', responsePath: 'data.title' } });
    const button = { method: 'POST' as const, url: '/api/save', body: '{"ok":true}' };
    expect(normalizeApiBinding(button, 'POST')).toEqual(button);
    expect(normalizeApiBinding({ ...button, body: '{' })).toBeUndefined();
    const restored = parseStudioFile(serializeStudioDocument(edited));
    expect(restored.decorations['overview:taskCount']?.api?.url).toBe('/api/dashboard');
    expect(restored.decorations['overview:overviewTitle']?.api?.responsePath).toBe('data.title');
    const src = generateReactPage(restored, 'overview');
    expect(src).toContain('StudioRemoteValue');
    expect(src).toContain('data.count');
    expect(src).toContain('data.title');
    expect(projectExportFiles(restored).map((file) => file.name)).toContain('studio-api.tsx');
  });
  it('performs an actual GET and selects response field; sends POST with JSON body', async () => {
    const previous = globalThis.fetch;
    const mock = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ data: { count: 17 } }) });
    globalThis.fetch = mock as typeof fetch;
    try {
      expect(await requestStudioApi({ method: 'GET', url: '/api/summary', responsePath: 'data.count' })).toBe(17);
      expect(displayApiValue(17)).toBe('17');
      expect(await requestStudioApi({ method: 'POST', url: '/api/actions', body: '{"sent":1}' })).toEqual({ data: { count: 17 } });
      expect(mock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', body: '{"sent":1}' });
    } finally { globalThis.fetch = previous; }
  });
  it('exports a complete multi-page app entry using hash navigation', () => {
    const doc = createStudioDocument();
    const copy = { ...doc, shell: { navigation: 'top' as const, sidebarWidth: 188 } };
    const app = generateStudioApp(copy);
    expect(app).toContain("window.addEventListener('hashchange'");
    expect(app).toContain("href={'#/' + item.target}");
    expect(app).toContain('atlas-app-top');
  });
});
