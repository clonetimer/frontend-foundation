import type { ProjectBlueprint, ProjectPage, VisualNode, VisualNodeKind } from './types';

const defaultContainerWidgetTypes: ReadonlySet<string> = new Set(['panel']);

export const acceptsChildren = (node: VisualNode, containerWidgetTypes: ReadonlySet<string> = defaultContainerWidgetTypes) =>
  node.kind === 'layout' || (node.kind === 'widget' && containerWidgetTypes.has(node.type));

export function cloneBlueprint(blueprint: ProjectBlueprint): ProjectBlueprint {
  return structuredClone(blueprint);
}

export function walkNodes(root: VisualNode | undefined, visitor: (node: VisualNode, parent?: VisualNode) => void, parent?: VisualNode) {
  if (!root) return;
  visitor(root, parent);
  for (const child of root.children ?? []) walkNodes(child, visitor, root);
}

export function findNode(root: VisualNode | undefined, id: string): VisualNode | undefined {
  let found: VisualNode | undefined;
  walkNodes(root, (node) => { if (node.id === id) found = node; });
  return found;
}

export function findParent(root: VisualNode | undefined, id: string): VisualNode | undefined {
  let found: VisualNode | undefined;
  walkNodes(root, (node, parent) => { if (node.id === id) found = parent; });
  return found;
}

export function hasDescendant(node: VisualNode, id: string): boolean {
  return (node.children ?? []).some((child) => child.id === id || hasDescendant(child, id));
}

export function createNode(kind: VisualNodeKind, type: string, usedIds: Set<string>): VisualNode {
  const base = `${type}${kind === 'layout' ? 'Layout' : 'Widget'}`.replace(/[^A-Za-z0-9]/g, '');
  let index = 1;
  let id = `${base}${index}`;
  while (usedIds.has(id)) id = `${base}${++index}`;
  const common = { id, kind, type } as VisualNode;
  if (kind === 'layout') {
    if (type === 'stack') return { ...common, props: { direction: 'vertical', gap: 12 }, children: [] };
    if (type === 'grid') return { ...common, props: { columns: 2, gap: 12 }, children: [] };
    if (type === 'split') return { ...common, props: { direction: 'horizontal', secondarySize: 320, gap: 12 }, children: [] };
    if (type === 'tabs') return { ...common, props: { tabPosition: 'top' }, children: [] };
  }
  if (type === 'panel') return { ...common, props: { title: 'Panel' }, children: [] };
  if (type === 'text') return { ...common, props: { text: 'Text', variant: 'body' } };
  if (type === 'button') return { ...common, props: { label: 'Button', type: 'default' } };
  if (type === 'input') return { ...common, props: { label: 'Input', placeholder: 'Enter value' } };
  if (type === 'select') return { ...common, props: { label: 'Select', options: [{ label: 'Option A', value: 'a' }] } };
  if (type === 'metric') return { ...common, props: { label: 'Metric', value: 0 } };
  return { ...common, props: { title: 'Domain block', description: 'Replace with a project-specific component.' } };
}

export function collectIds(root: VisualNode | undefined): Set<string> {
  const ids = new Set<string>();
  walkNodes(root, (node) => ids.add(node.id));
  return ids;
}

export function insertNode(root: VisualNode, targetId: string, node: VisualNode, containerWidgetTypes: ReadonlySet<string> = defaultContainerWidgetTypes): boolean {
  const target = findNode(root, targetId);
  if (!target || !acceptsChildren(target, containerWidgetTypes)) return false;
  if (target.type === 'split' && (target.children?.length ?? 0) >= 2) return false;
  if (target.type === 'tabs' && !node.label) node.label = `Tab ${(target.children?.length ?? 0) + 1}`;
  target.children = [...(target.children ?? []), node];
  return true;
}

export function removeNode(root: VisualNode, id: string): boolean {
  const parent = findParent(root, id);
  if (!parent?.children) return false;
  const before = parent.children.length;
  parent.children = parent.children.filter((child) => child.id !== id);
  return parent.children.length !== before;
}

export function moveNode(root: VisualNode, sourceId: string, targetId: string, containerWidgetTypes: ReadonlySet<string> = defaultContainerWidgetTypes): boolean {
  if (sourceId === root.id || sourceId === targetId) return false;
  const source = findNode(root, sourceId);
  const target = findNode(root, targetId);
  if (!source || !target || !acceptsChildren(target, containerWidgetTypes) || hasDescendant(source, targetId)) return false;
  if (target.type === 'split' && (target.children?.length ?? 0) >= 2) return false;
  const oldParent = findParent(root, sourceId);
  if (!oldParent?.children) return false;
  oldParent.children = oldParent.children.filter((child) => child.id !== sourceId);
  if (target.type === 'tabs' && !source.label) source.label = `Tab ${(target.children?.length ?? 0) + 1}`;
  target.children = [...(target.children ?? []), source];
  return true;
}

export function reorderNode(root: VisualNode, id: string, delta: -1 | 1): boolean {
  const parent = findParent(root, id);
  if (!parent?.children) return false;
  const index = parent.children.findIndex((child) => child.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= parent.children.length) return false;
  const copy = [...parent.children];
  const currentNode = copy[index];
  const nextNode = copy[next];
  if (!currentNode || !nextNode) return false;
  copy[index] = nextNode;
  copy[next] = currentNode;
  parent.children = copy;
  return true;
}

export function updateNode(root: VisualNode, id: string, update: (node: VisualNode) => void): boolean {
  const node = findNode(root, id);
  if (!node) return false;
  update(node);
  return true;
}

export function pageIssues(page: ProjectPage, knownWidgetIds: ReadonlySet<string> = new Set(['panel', 'text', 'button', 'input', 'select', 'metric', 'placeholder'])): string[] {
  const issues: string[] = [];
  if (!page.composition) return ['Page has no visual composition.'];
  const seen = new Set<string>();
  walkNodes(page.composition, (node) => {
    if (seen.has(node.id)) issues.push(`Duplicate node id: ${node.id}`);
    seen.add(node.id);
    if (node.kind === 'layout' && !['stack', 'grid', 'split', 'tabs'].includes(node.type)) issues.push(`Unknown layout: ${node.type}`);
    if (node.kind === 'widget' && !knownWidgetIds.has(node.type)) issues.push(`Unknown widget: ${node.type}`);
    if (node.type === 'split' && (node.children?.length ?? 0) > 2) issues.push(`Split ${node.id} has more than two children.`);
  });
  const stateItems = page.state ?? [];
  const actionItems = page.actions ?? [];
  const dataSourceItems = page.dataSources ?? [];
  const operationItems = page.operations ?? [];
  const states = new Set(stateItems.map((entry) => entry.id));
  const actions = new Set(actionItems.map((entry) => entry.id));
  const dataSources = new Set(dataSourceItems.map((entry) => entry.id));
  const operations = new Set(operationItems.map((entry) => entry.id));

  const reportDuplicates = (label: string, ids: string[]) => {
    const seenIds = new Set<string>();
    for (const id of ids) {
      if (seenIds.has(id)) issues.push(`Duplicate ${label} id: ${id}`);
      seenIds.add(id);
    }
  };
  reportDuplicates('state', stateItems.map((entry) => entry.id));
  reportDuplicates('action', actionItems.map((entry) => entry.id));
  reportDuplicates('data source', dataSourceItems.map((entry) => entry.id));
  reportDuplicates('operation', operationItems.map((entry) => entry.id));

  walkNodes(page.composition, (node) => {
    for (const binding of Object.values(node.bindings ?? {})) if (!states.has(binding.state)) issues.push(`${node.id} binds unknown state ${binding.state}.`);
    for (const actionIds of Object.values(node.events ?? {})) for (const actionId of actionIds) if (!actions.has(actionId)) issues.push(`${node.id} references unknown action ${actionId}.`);
  });

  for (const action of actionItems) {
    for (const step of action.steps) {
      if (step.type === 'invoke' && step.operation && !operations.has(step.operation)) issues.push(`Action ${action.id} invokes unknown operation ${step.operation}.`);
      if (['set', 'toggle', 'increment', 'reset'].includes(step.type) && step.state && !states.has(step.state)) issues.push(`Action ${action.id} references unknown state ${step.state}.`);
    }
  }
  for (const operation of operationItems) {
    if (!dataSources.has(operation.source)) issues.push(`Operation ${operation.id} references unknown data source ${operation.source}.`);
    for (const state of [operation.lifecycle?.pendingState, operation.lifecycle?.errorState].filter((value): value is string => Boolean(value))) {
      if (!states.has(state)) issues.push(`Operation ${operation.id} lifecycle references unknown state ${state}.`);
    }
    for (const result of operation.result ?? []) if (!states.has(result.state)) issues.push(`Operation ${operation.id} result targets unknown state ${result.state}.`);
  }
  return issues;
}

export function emptyComposition(): VisualNode {
  return { id: 'pageRoot', kind: 'layout', type: 'stack', props: { direction: 'vertical', gap: 16 }, children: [] };
}

const visualIdPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const stateIdPattern = /^[a-z][A-Za-z0-9]*$/;
const modelIdPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;

function replaceOperationStateReference(value: unknown, oldId: string, nextId: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => replaceOperationStateReference(entry, oldId, nextId));
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === '$state' && child === oldId) next[key] = nextId;
    else next[key] = replaceOperationStateReference(child, oldId, nextId);
  }
  return next;
}

function replaceActionStateReference(value: unknown, oldId: string, nextId: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record.state === oldId) return { ...record, state: nextId };
  return value;
}

export function renameNode(page: ProjectPage, oldId: string, nextId: string): boolean {
  if (!page.composition || oldId === nextId || !visualIdPattern.test(nextId) || findNode(page.composition, nextId)) return false;
  const node = findNode(page.composition, oldId);
  if (!node) return false;
  node.id = nextId;
  return true;
}

export function renameState(page: ProjectPage, oldId: string, nextId: string): boolean {
  if (oldId === nextId || !stateIdPattern.test(nextId) || (page.state ?? []).some((entry) => entry.id === nextId)) return false;
  const state = (page.state ?? []).find((entry) => entry.id === oldId);
  if (!state) return false;
  state.id = nextId;
  walkNodes(page.composition, (node) => {
    for (const binding of Object.values(node.bindings ?? {})) if (binding.state === oldId) binding.state = nextId;
  });
  for (const action of page.actions ?? []) {
    for (const step of action.steps) {
      if (step.state === oldId) step.state = nextId;
      if (step.value !== undefined) step.value = replaceActionStateReference(step.value, oldId, nextId);
    }
  }
  for (const operation of page.operations ?? []) {
    if (operation.query !== undefined) operation.query = replaceOperationStateReference(operation.query, oldId, nextId) as Record<string, unknown>;
    if (operation.body !== undefined) operation.body = replaceOperationStateReference(operation.body, oldId, nextId);
    if (operation.lifecycle?.pendingState === oldId) operation.lifecycle.pendingState = nextId;
    if (operation.lifecycle?.errorState === oldId) operation.lifecycle.errorState = nextId;
    for (const result of operation.result ?? []) if (result.state === oldId) result.state = nextId;
  }
  return true;
}

export function renameAction(page: ProjectPage, oldId: string, nextId: string): boolean {
  if (oldId === nextId || !modelIdPattern.test(nextId) || (page.actions ?? []).some((entry) => entry.id === nextId)) return false;
  const action = (page.actions ?? []).find((entry) => entry.id === oldId);
  if (!action) return false;
  action.id = nextId;
  walkNodes(page.composition, (node) => {
    for (const [eventName, ids] of Object.entries(node.events ?? {})) {
      node.events![eventName] = ids.map((id) => id === oldId ? nextId : id);
    }
  });
  return true;
}

export function renameDataSource(page: ProjectPage, oldId: string, nextId: string): boolean {
  if (oldId === nextId || !modelIdPattern.test(nextId) || (page.dataSources ?? []).some((entry) => entry.id === nextId)) return false;
  const source = (page.dataSources ?? []).find((entry) => entry.id === oldId);
  if (!source) return false;
  source.id = nextId;
  for (const operation of page.operations ?? []) if (operation.source === oldId) operation.source = nextId;
  return true;
}

export function renameOperation(page: ProjectPage, oldId: string, nextId: string): boolean {
  if (oldId === nextId || !modelIdPattern.test(nextId) || (page.operations ?? []).some((entry) => entry.id === nextId)) return false;
  const operation = (page.operations ?? []).find((entry) => entry.id === oldId);
  if (!operation) return false;
  operation.id = nextId;
  for (const action of page.actions ?? []) {
    for (const step of action.steps) if (step.type === 'invoke' && step.operation === oldId) step.operation = nextId;
  }
  return true;
}
