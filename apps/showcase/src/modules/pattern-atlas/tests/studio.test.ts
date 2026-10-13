import { describe, expect, it } from 'vitest';
import { buildProjectBlueprint } from '../builder/project-blueprint';
import { createNode, createStudioDocument, editPageDocument, findNode, freshNodeId, insertNode, moveNode, parseStudioFile, removeNode, serializeStudioDocument, setDecoration, validateTree, walkNodes } from '../studio/model';
import { generateReactPage, projectExportFiles, zipTextFiles } from '../studio/exporter';

describe('integrated page studio', () => {
  it('starts from a real Foundation Blueprint', () => {
    const doc = createStudioDocument();
    expect(doc.blueprint.schemaVersion).toBe(1);
    expect(doc.blueprint.pages[0]?.composition).toBeDefined();
    validateTree(doc.blueprint.pages[0]!.composition!);
  });

  it('inserts components into the page composition and enforces unique IDs', () => {
    const doc = createStudioDocument();
    const page = doc.blueprint.pages[0]!;
    const root = page.composition!;
    const id = freshNodeId(root, 'button');
    const next = editPageDocument(doc, page.id, (tree) => insertNode(tree, tree.id, createNode('button', id)));
    expect(findNode(next.blueprint.pages[0]!.composition!, id)?.type).toBe('button');
    expect(() => insertNode(next.blueprint.pages[0]!.composition!, root.id, createNode('button', id))).toThrow();
  });

  it('preserves split regions and prevents circular moves', () => {
    const split = createNode('split', 'split1');
    expect(split.children).toHaveLength(2);
    expect(() => removeNode(split, split.children![0]!.id)).toThrow();
    const root = insertNode(createNode('stack', 'root'), 'root', split);
    expect(() => moveNode(root, 'split1', split.children![0]!.id, 'inside')).toThrow();
  });

  it('supports safe sibling reordering', () => {
    let root = createNode('stack', 'root');
    root = insertNode(root, 'root', createNode('text', 'textOne'));
    root = insertNode(root, 'root', createNode('text', 'textTwo'));
    root = moveNode(root, 'textOne', 'textTwo', 'after');
    expect(root.children!.map((item) => item.id)).toEqual(['textTwo', 'textOne']);
  });

  it('round-trips presentation metadata without modifying the Blueprint schema', () => {
    const doc = createStudioDocument();
    const page = doc.blueprint.pages[0]!;
    const root = page.composition!;
    const next = setDecoration(doc, `${page.id}:${root.id}`, { effect: 'fade-up', pattern: 'bento' });
    const restored = parseStudioFile(serializeStudioDocument(next));
    expect(restored.blueprint).toEqual(doc.blueprint);
    expect(restored.decorations[`${page.id}:${root.id}`]).toEqual({ effect: 'fade-up', pattern: 'bento' });
  });

  it('accepts a Foundation project file and discards invalid effect references', () => {
    const doc = createStudioDocument();
    const restored = parseStudioFile(JSON.stringify(doc.blueprint));
    expect(restored.blueprint).toEqual(doc.blueprint);
    const modified = JSON.parse(serializeStudioDocument(doc)) as Record<string, unknown>;
    modified.decorations = { 'overview:patternAtlasRoot': { effect: 'unknown-animation' }, 'missing:node': { effect: 'ripple' } };
    const normalized = parseStudioFile(JSON.stringify(modified));
    expect(normalized.decorations['missing:node']).toBeUndefined();
    expect(normalized.decorations['overview:patternAtlasRoot']?.effect).toBeUndefined();
  });

  it('keeps existing pages and studio decorations when an additional page is added', () => {
    const doc = createStudioDocument();
    const oldPage = doc.blueprint.pages[0]!;
    const decorated = setDecoration(doc, `${oldPage.id}:${oldPage.composition!.id}`, { effect: 'hover-lift' });
    const appended = buildProjectBlueprint({ mode: 'existing', projectId: doc.blueprint.project.id, projectTitle: doc.blueprint.project.title, pageId: 'new-page', pageTitle: '新增页面', template: 'blank', existingBlueprint: decorated.blueprint });
    const merged = { ...decorated, blueprint: appended };
    expect(merged.blueprint.pages).toHaveLength(2);
    expect(merged.decorations[`${oldPage.id}:${oldPage.composition!.id}`]?.effect).toBe('hover-lift');
  });

  it('exports a React component with visual effects and click interaction', () => {
    let doc = createStudioDocument();
    const pageId = doc.blueprint.pages[0]!.id;
    const root = doc.blueprint.pages[0]!.composition!;
    const id = freshNodeId(root, 'button');
    doc = editPageDocument(doc, pageId, (tree) => insertNode(tree, tree.id, createNode('button', id)));
    doc = setDecoration(doc, `${pageId}:${id}`, { effect: 'success-check', interaction: 'notice', feedback: '保存成功' });
    const source = generateReactPage(doc, pageId);
    expect(source).toContain("import '../studio-effects.css'");
    expect(source).toContain('data-effect={"success-check"}');
    expect(source).toContain('handlePress');
    expect(source).toContain('保存成功');
  });

  it('exports a complete source bundle without external ZIP dependencies', async () => {
    const doc = createStudioDocument();
    const files = projectExportFiles(doc);
    expect(files.map((entry) => entry.name)).toContain('foundation.project.json');
    expect(files.map((entry) => entry.name)).toContain('atlas.studio.json');
    expect(files.map((entry) => entry.name)).toContain('studio-effects.css');
    expect(files.map((entry) => entry.name)).toContain('pages/overview.tsx');
    const zipped = await zipTextFiles(files).arrayBuffer();
    expect(new DataView(zipped).getUint32(0, true)).toBe(0x04034b50);
    expect(zipped.byteLength).toBeGreaterThan(1000);
  });

  it('limits complex pages to a safe maximum component count', () => {
    const root = createNode('stack', 'root');
    root.children = Array.from({ length: 301 }, (_, index) => createNode('text', `item${index}`));
    expect(() => validateTree(root)).toThrow();
    let count = 0;
    expect(() => walkNodes(createNode('stack', 'other'), () => { count += 1; })).not.toThrow();
    expect(count).toBe(1);
  });
});
