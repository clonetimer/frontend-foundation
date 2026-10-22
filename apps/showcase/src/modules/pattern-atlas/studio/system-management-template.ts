/** Opt-in, app-layer system management starter. No server, privileges or live data are fabricated. */
import type { CompositionNode } from '../bridge';
import { buildProjectBlueprint } from '../builder/project-blueprint';
import { newDemoSource } from './data-sources';
import { setDecoration, type StudioDocument } from './model';

export interface SystemPageDefinition {
  id: string;
  title: string;
  description: string;
  readonly: boolean;
  columns: readonly (readonly [string, string])[];
  form: readonly (readonly [string, string])[];
}


/** First-party service contracts; only applies to the seven built-in page IDs. */
function serviceResource(id: string): string {
  return id === 'system-operation-logs' ? 'logs/operations' :
    id === 'system-login-logs' ? 'logs/logins' : id.replace(/^system-/, '');
}
function managementDefaults(id: string) {
  const base = '/api/system/' + serviceResource(id);
  const readonly = id === 'system-operation-logs' || id === 'system-login-logs';
  return { listUrl: base, detailUrl: readonly ? '' : base + '/{id}',
    saveUrl: readonly ? '' : base + '/{id}',
    createUrl: readonly ? '' : base, deleteUrl: readonly ? '' : base + '/{id}' };
}
function operationDefaults(pageId: string, mode: ExtraAction['mode']): Record<string, string> {
  if (mode === 'role-users')
    return { optionsUrl:'/api/system/users/options', assignedUrl:'/api/system/roles/{id}/users',
      detailUrl:'', submitUrl:'/api/system/roles/{id}/users' };
  if (mode === 'role-permissions')
    return { optionsUrl:'/api/system/menus/tree', assignedUrl:'/api/system/roles/{id}/permissions',
      detailUrl:'', submitUrl:'/api/system/roles/{id}/permissions' };
  if (mode === 'menu-tree')
    return { optionsUrl:'/api/system/menus/tree', assignedUrl:'', detailUrl:'', submitUrl:'' };
  const base = '/api/system/' + serviceResource(pageId) + '/{id}';
  return { optionsUrl:'', assignedUrl:'', detailUrl:base, submitUrl:base };
}

/** IDs are deliberately stable: preview/export use them to render one grouped navigation entry. */
export const SYSTEM_MANAGEMENT_PAGES: readonly SystemPageDefinition[] = [
  { id: 'system-users', title: '人员管理', description: '查询人员、维护人员资料；角色关联与授权由业务后端负责。', readonly: false,
    columns: [['username','登录账号'],['name','人员姓名'],['department','所属部门'],['status','状态'],['createdAt','创建时间']],
    form: [['username','登录账号'],['name','人员姓名'],['department','所属部门']] },
  { id: 'system-roles', title: '角色管理', description: '维护角色信息；角色权限分配必须由后端实际校验和持久化。', readonly: false,
    columns: [['name','角色名称'],['code','权限字符'],['sort','显示顺序'],['status','状态'],['createdAt','创建时间']],
    form: [['name','角色名称'],['code','权限字符'],['sort','显示顺序']] },
  { id: 'system-menus', title: '菜单管理', description: '维护菜单记录；菜单树、按钮权限与路由授权须由业务端实现。', readonly: false,
    columns: [['name','菜单名称'],['parentId','上级菜单'],['path','路由地址'],['permission','权限字符'],['sort','排序'],['status','状态']],
    form: [['name','菜单名称'],['parentId','上级菜单'],['path','路由地址']] },
  { id: 'system-operation-logs', title: '操作日志', description: '只读查看后端提供的操作审计记录；不可从前端伪造审计日志。', readonly: true,
    columns: [['actor','操作人员'],['action','操作类型'],['resource','操作对象'],['result','执行结果'],['createdAt','操作时间']], form: [] },
  { id: 'system-login-logs', title: '登录日志', description: '只读查看后端记录的认证事件，需注意个人信息保护。', readonly: true,
    columns: [['username','用户'],['ip','来源地址'],['result','登录结果'],['createdAt','登录时间']], form: [] },
  { id: 'system-dictionaries', title: '字典管理', description: '维护系统选项字典；字段约束和引用一致性由后端验证。', readonly: false,
    columns: [['name','字典名称'],['code','字典编码'],['value','字典值'],['status','状态']],
    form: [['name','字典名称'],['code','字典编码'],['value','字典值']] },
  { id: 'system-parameters', title: '参数设置', description: '维护非机密业务参数；严禁将密钥和密码写入设计文件。', readonly: false,
    columns: [['name','参数名称'],['key','参数键'],['value','参数值'],['updatedAt','更新时间']],
    form: [['name','参数名称'],['key','参数键'],['value','参数值']] }
];

const systemIds = new Set(SYSTEM_MANAGEMENT_PAGES.map((entry) => entry.id));
export function isSystemManagementPage(id: string): boolean { return systemIds.has(id); }

function widget(id: string, title: string): CompositionNode {
  return { id, kind: 'widget', type: 'placeholder', props: { title, description: '通过右侧“接口管理”连接自己的后端' } };
}
function composition(spec: SystemPageDefinition): CompositionNode {
  const children: CompositionNode[] = [
    { id: 'systemHeading', kind: 'widget', type: 'text', props: { text: spec.title, variant: 'title' } },
    { id: 'systemNote', kind: 'widget', type: 'text', props: { text: spec.description + ' 请先在「接口管理」配置对应数据源。', variant: 'secondary' } },
  ];
  if (!spec.readonly) {
    children.push({ id: 'systemActions', kind: 'layout', type: 'grid', props: { columns: 2, gap: 8 }, children: [
      widget('systemCreate', '新增' + spec.title.replace('管理','')),
      widget('systemEdit', '修改' + spec.title.replace('管理',''))
    ] });
  }
  children.push(widget('systemTable', spec.title + '列表'));
  return { id: 'systemRoot', kind: 'layout', type: 'stack', props: { gap: 16 }, children };
}

/** Installs only missing pages; an existing page is never overwritten. One undo removes one install. */
export function addSystemManagementPages(document: StudioDocument): { document: StudioDocument; added: string[]; firstPageId: string } {
  const missing = SYSTEM_MANAGEMENT_PAGES.filter((spec) => !document.blueprint.pages.some((page) => page.id === spec.id));
  if (!missing.length) return { document, added: [], firstPageId: SYSTEM_MANAGEMENT_PAGES[0]!.id };
  const newSources = missing.filter((spec) => !document.dataSources.some((source) => source.id === spec.id));
  if (document.dataSources.length + newSources.length > 25) throw new Error('数据源数量已达项目上限，无法添加完整系统管理模板。');
  let next: StudioDocument = { ...document, dataSources: [
    ...document.dataSources, ...newSources.map((spec) => ({
      ...newDemoSource(spec.id), name: spec.title, ...managementDefaults(spec.id),
      itemsPath: 'data.items', totalPath: 'data.total', detailPath: 'data.item',
      idField: 'id', labelField: spec.columns[0]?.[0] ?? 'id', pageSize: 10,
      paginationMode: 'server' as const, filterField: '', filterValues: [], sortField: ''
    }))
  ] };
  for (const spec of missing) {
    const blueprint = buildProjectBlueprint({
      mode: 'existing', projectId: next.blueprint.project.id, projectTitle: next.blueprint.project.title,
      pageId: spec.id, pageTitle: spec.title, template: 'blank', existingBlueprint: next.blueprint
    });
    const page = blueprint.pages.find((entry) => entry.id === spec.id)!;
    page.composition = composition(spec);
    next = { ...next, blueprint };
    next = setDecoration(next, `${spec.id}:systemTable`, { widgetKind: 'table', widgetProps: {
      title: spec.title, items: [], pageSize: 10, sourceId: spec.id, dataUrl: '',
      itemsPath: 'data.items', totalPath: 'data.total', idField: 'id',
      tableColumns: spec.columns.map(([field, title]) => `${field}|${title}`).join('\n'),
      filterField: '', filterValues: '', sortField: '', detailUrl: '', detailPath: 'data.item', deleteUrl: ''
    } });
    if (!spec.readonly) {
      const fields = spec.form.map(([field, label]) => `${field}|${label}|${field === 'sort' ? 'number' : 'text'}|required`).join('\n');
      const createFields = spec.id === 'system-users' ? fields + '\npassword|初始密码|password|required' : fields;
      next = setDecoration(next, `${spec.id}:systemCreate`, { widgetKind: 'modal', widgetProps: {
        title: '新增' + spec.title.replace('管理',''), triggerText: '＋ 新增',
        description: '连接并验证后端接口后才允许提交。', okText: '确认新增', cancelText: '取消',
        formFields: createFields, submitUrl: '', formMode: 'create', submitMethod: 'POST', sourceId: spec.id,
        successWorkflow: '', failureWorkflow: ''
      } });
      next = setDecoration(next, `${spec.id}:systemEdit`, { widgetKind: 'modal', widgetProps: {
        title: '修改' + spec.title.replace('管理',''), triggerText: '修改选中记录',
        description: '请先在表格中选择记录，修改操作将提交真实后端。', okText: '确认修改', cancelText: '取消',
        formFields: fields, submitUrl: '', formMode: 'edit-selected', submitMethod: 'PATCH', sourceId: spec.id,
        successWorkflow: '', failureWorkflow: ''
      } });
    }
  }
  return { document: addSystemManagementActions(next).document, added: missing.map((spec) => spec.id), firstPageId: missing[0]!.id };
}


type ExtraAction = { id: string; mode: 'role-users' | 'role-permissions' | 'menu-tree' | 'status'; title: string };
const extras: Readonly<Record<string, readonly ExtraAction[]>> = {
  'system-users': [{ id: 'systemUserStatus', mode: 'status', title: '人员状态' }],
  'system-roles': [
    { id: 'systemRoleUsers', mode: 'role-users', title: '角色关联人员' },
    { id: 'systemRolePermissions', mode: 'role-permissions', title: '分配菜单权限' },
    { id: 'systemRoleStatus', mode: 'status', title: '角色状态' }
  ],
  'system-menus': [
    { id: 'systemMenuTree', mode: 'menu-tree', title: '菜单权限树' },
    { id: 'systemMenuStatus', mode: 'status', title: '菜单状态' }
  ],
  'system-dictionaries': [{ id: 'systemDictionaryStatus', mode: 'status', title: '字典状态' }]
};

/** Opt-in migration for already-installed R1 pages; preserves any authored content and sources. */
export function addSystemManagementActions(document: StudioDocument): { document: StudioDocument; added: string[] } {
  const next: StudioDocument = structuredClone(document);
  const added: string[] = [];
  for (const [pageId, actions] of Object.entries(extras)) {
    const page = next.blueprint.pages.find((entry) => entry.id === pageId);
    const root = page?.composition;
    // Never override a custom replacement page or its non-standard layout.
    if (!root || root.id !== 'systemRoot' || root.kind !== 'layout' || root.type !== 'stack' || !root.children) continue;
    const seen = new Set<string>();
    const scan = (item: CompositionNode) => { seen.add(item.id); for (const child of item.children ?? []) scan(child); };
    scan(root);
    const pending = actions.filter((action) => !seen.has(action.id));
    if (!pending.length) continue;
    const inserts = pending.map((action): CompositionNode => widget(action.id, action.title));
    const tableIndex = root.children.findIndex((item) => item.id === 'systemTable');
    root.children.splice(tableIndex >= 0 ? tableIndex : root.children.length, 0, ...inserts);
    for (const action of pending) {
      const key = pageId + ':' + action.id;
      // Set the decoration directly so a migration of old drafts does not discard user changes.
      next.decorations[key] = {
        widgetKind: 'management-actions',
        widgetProps: { title: action.title, actionMode: action.mode,
          ...operationDefaults(pageId, action.mode),
          statusField: 'status', activeValue: 'enabled', inactiveValue: 'disabled' }
      };
      added.push(key);
    }
  }
  return added.length ? { document: next, added } : { document, added: [] };
}


/** Safe upgrade for older templates: fill blank first-party endpoints only.
 * Never change a user-customized source URL or widget binding. */
export function connectBuiltInManagement(document: StudioDocument): { document: StudioDocument; changed: number } {
  const next: StudioDocument = structuredClone(document);
  let changed = 0;
  for (const source of next.dataSources) {
    if (!SYSTEM_MANAGEMENT_PAGES.some((entry) => entry.id === source.id)) continue;
    const defaults = managementDefaults(source.id);
    for (const [field, value] of Object.entries(defaults)) {
      if (!value || source[field as keyof typeof defaults]) continue;
      (source as unknown as Record<string, unknown>)[field] = value;
      changed++;
    }
  }
  for (const [pageId, actions] of Object.entries(extras)) {
    for (const action of actions) {
      const key = pageId + ':' + action.id;
      const dec = next.decorations[key];
      if (!dec || dec.widgetKind !== 'management-actions') continue;
      const props = { ...dec.widgetProps };
      for (const [field, value] of Object.entries(operationDefaults(pageId, action.mode))) {
        if (!value || props[field]) continue;
        props[field] = value;
        changed++;
      }
      next.decorations[key] = { ...dec, widgetProps: props };
    }
  }
  return { document: changed ? next : document, changed };
}
