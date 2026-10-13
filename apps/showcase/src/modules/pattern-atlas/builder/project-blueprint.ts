import { buildCompositionSnippet, type CompositionNode } from '../bridge';

export type PageTemplate = 'blank' | 'bento' | 'master-detail';
export type ProjectMode = 'new' | 'existing';

export interface PageBuilderOptions {
  mode: ProjectMode;
  projectId: string;
  projectTitle: string;
  pageId: string;
  pageTitle: string;
  template: PageTemplate;
  primaryColor?: string;
  existingBlueprint?: unknown;
}

export interface ProjectPage {
  id: string;
  title: string;
  pattern?: string;
  index?: boolean;
  route?: string;
  composition?: CompositionNode;
  [key: string]: unknown;
}

export interface ProjectBlueprintDocument {
  schemaVersion: 1;
  project: { id: string; title: string; packageName?: string; [key: string]: unknown };
  foundation: Record<string, unknown>;
  pages: ProjectPage[];
  navigation: { items: Array<{ target: string; label: string; order: number }> };
  [key: string]: unknown;
}

const ID_PATTERN = /^[a-z][a-z0-9.-]*$/;
const PAGE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_BLUEPRINT_BYTES = 250_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function makeComposition(template: PageTemplate, pageTitle: string): CompositionNode {
  if (template === 'blank') return {
    id: 'pageRoot', kind: 'layout', type: 'stack', props: { gap: 16 }, children: [
      { id: 'pageHeading', kind: 'widget', type: 'text', props: { text: pageTitle, variant: 'title' } },
      { id: 'pageContent', kind: 'widget', type: 'placeholder', props: { title: '页面内容', description: '在拖拽设计器中放入布局和组件' } }
    ]
  };
  const source = buildCompositionSnippet(template);
  if (!source) throw new Error('目前只支持空白页、Bento 和主从分栏的可编译结构。');
  // Preserve the published Composition Registry types and identities.
  const composition = structuredClone(source);
  const heading = composition.children?.find((item) => item.kind === 'widget' && item.type === 'text');
  if (heading) heading.props = { ...heading.props, text: pageTitle };
  return composition;
}

/** Accept an existing Project Blueprint without stripping pages, state, data or resource declarations. */
export function parseExistingBlueprint(text: string): ProjectBlueprintDocument {
  if (new TextEncoder().encode(text).length > MAX_BLUEPRINT_BYTES) throw new Error('项目文件过大（上限 250KB），请在 Designer 内直接编辑。');
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; }
  catch { throw new Error('文件不是有效的 JSON。'); }
  if (!record(parsed) || parsed.schemaVersion !== 1 || !record(parsed.project) || !record(parsed.foundation) || !Array.isArray(parsed.pages)) {
    throw new Error('这不是有效的 Foundation Project Blueprint v1 文件。请导入 foundation.project.json，而不是 UI 方案 JSON。');
  }
  if (typeof parsed.project.id !== 'string' || !ID_PATTERN.test(parsed.project.id) || typeof parsed.project.title !== 'string') {
    throw new Error('原项目 project.id / project.title 无效。');
  }
  if (typeof parsed.foundation.version === 'string' && !/^0\.21\.\d+/.test(parsed.foundation.version)) {
    throw new Error('当前项目构建器仅支持 Foundation 0.21.x 的 Blueprint；请先升级或在原版本设计器里编辑。');
  }
  if (!parsed.pages.every((page) => record(page) && typeof page.id === 'string' && typeof page.title === 'string')) {
    throw new Error('原项目的 pages 条目不完整。');
  }
  if (parsed.navigation !== undefined && (!record(parsed.navigation) || !Array.isArray(parsed.navigation.items))) {
    throw new Error('原项目 navigation.items 无效。');
  }
  if (parsed.navigation && !(parsed.navigation as { items: unknown[] }).items.every((item) => record(item) && typeof item.target === 'string' && typeof item.label === 'string' && Number.isInteger(item.order))) {
    throw new Error('原项目导航条目无效。');
  }
  return parsed as unknown as ProjectBlueprintDocument;
}

/** Only adds a page and a navigation entry. It never silently overwrites an existing project page. */
export function buildProjectBlueprint(options: PageBuilderOptions): ProjectBlueprintDocument {
  const pageId = options.pageId.trim();
  const pageTitle = options.pageTitle.trim();
  if (!PAGE_ID_PATTERN.test(pageId)) throw new Error('页面标识需要以小写英文字母开头，只能包含小写字母、数字及短横线。');
  if (!pageTitle || pageTitle.length > 100) throw new Error('请输入不超过 100 个字符的页面名称。');
  const page: ProjectPage = {
    id: pageId,
    title: pageTitle,
    pattern: options.template === 'master-detail' ? 'master-detail' : options.template === 'bento' ? 'dashboard' : 'page',
    composition: makeComposition(options.template, pageTitle)
  };

  if (options.mode === 'existing') {
    // Re-parse a JSON clone to guard against accidental in-place edits to the imported project.
    const original = options.existingBlueprint;
    const doc = parseExistingBlueprint(JSON.stringify(original ?? null));
    if (doc.pages.some((item) => item.id === pageId) || doc.navigation?.items.some((item) => item.target === pageId)) throw new Error(`原项目已存在页面或导航目标 ${pageId}，请换一个页面标识。`);
    const isFirst = doc.pages.length === 0;
    const pages = [...doc.pages, { ...page, ...(isFirst ? { index: true } : { route: pageId }) }];
    const existingItems = doc.navigation?.items ?? [];
    const maxOrder = Math.max(-10, ...existingItems.map((item) => item.order));
    if (maxOrder > 99990) throw new Error('原项目的导航顺序已达到上限，请先调整原 Blueprint 的 navigation.items。');
    return {
      ...doc,
      pages,
      navigation: { ...doc.navigation, items: [...existingItems, { target: pageId, label: pageTitle, order: maxOrder + 10 }] }
    };
  }

  const projectId = options.projectId.trim();
  const projectTitle = options.projectTitle.trim();
  if (!ID_PATTERN.test(projectId)) throw new Error('项目标识以小写字母开头，只能包含字母、数字、点号或短横线。');
  if (!projectTitle || projectTitle.length > 100) throw new Error('请输入不超过 100 个字符的项目名称。');
  const primaryColor = options.primaryColor ?? '#1677ff';
  if (!HEX_COLOR.test(primaryColor)) throw new Error('主题色必须是 #RRGGBB 格式。');
  return {
    schemaVersion: 1,
    project: { id: projectId, packageName: projectId.replaceAll('.', '-'), title: projectTitle },
    foundation: { version: '0.21.0', profile: 'management', shell: 'workspace', router: 'browser', deployment: 'none', contract: 'none' },
    theme: { primaryColor, layout: { contentPadding: 20 } },
    navigation: { items: [{ target: pageId, label: pageTitle, order: 0 }] },
    pages: [{ ...page, index: true }],
    resources: []
  };
}

export function serializeBlueprint(blueprint: ProjectBlueprintDocument): string {
  return `${JSON.stringify(blueprint, null, 2)}\n`;
}
