import compositionRegistry from '../composition.json';

export type StateType = 'string' | 'number' | 'boolean';
export type VisualNodeKind = 'layout' | 'widget';
export type LayoutType = 'stack' | 'grid' | 'split' | 'tabs';
export type BuiltInWidgetType = 'panel' | 'text' | 'button' | 'input' | 'select' | 'metric' | 'placeholder';
export type WidgetType = string;

export interface BindingReference { state: string; }

export interface VisualNode {
  id: string;
  kind: VisualNodeKind;
  type: LayoutType | WidgetType;
  label?: string;
  props?: Record<string, unknown>;
  placement?: { span?: number };
  bindings?: Record<string, BindingReference>;
  events?: Record<string, string[]>;
  children?: VisualNode[];
}

export interface PageState {
  id: string;
  type: StateType;
  initial: string | number | boolean;
}

export type ActionValue = unknown;
export interface ActionStep {
  type: 'set' | 'toggle' | 'increment' | 'reset' | 'invoke' | 'navigate';
  state?: string;
  value?: ActionValue;
  by?: number;
  operation?: string;
  to?: string;
  replace?: boolean;
}

export interface PageAction { id: string; steps: ActionStep[]; }
export interface PageDataSource {
  id: string;
  type?: 'http';
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;
  path: string;
  response?: 'json' | 'text' | 'none';
}
export interface PageOperation {
  id: string;
  source: string;
  query?: Record<string, unknown>;
  body?: unknown;
  lifecycle?: { pendingState?: string; errorState?: string };
  result?: Array<{ state: string; path?: string }>;
}

export interface ProjectPage {
  id: string;
  title: string;
  pattern?: string;
  index?: boolean;
  route?: string;
  composition?: VisualNode;
  state?: PageState[];
  actions?: PageAction[];
  dataSources?: PageDataSource[];
  operations?: PageOperation[];
  [key: string]: unknown;
}

export interface ProjectBlueprint {
  schemaVersion: number;
  project: { id: string; packageName?: string; title: string };
  foundation: Record<string, unknown>;
  theme?: Record<string, unknown>;
  navigation?: { items: Array<Record<string, unknown>> };
  pages: ProjectPage[];
  resources?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type PropertyKind = 'text' | 'number' | 'boolean' | 'select' | 'json';
export interface RegistryProperty {
  key: string;
  label: string;
  kind: PropertyKind;
  options?: string[];
  required?: boolean;
  default?: unknown;
}
export interface RegistryEvent {
  prop?: string;
  valueType?: StateType | null;
  parameter?: string;
}
export interface RegistryWidget {
  id: WidgetType;
  description: string;
  package?: string;
  version?: string;
  exportName?: string;
  category?: 'widget' | 'block';
  acceptsChildren?: boolean;
  properties?: RegistryProperty[];
  bindings?: Record<string, StateType | StateType[]>;
  events?: Record<string, RegistryEvent>;
}
export interface RegistryLayout {
  id: LayoutType;
  description: string;
  properties?: RegistryProperty[];
}
export interface CompositionRegistry {
  layouts: RegistryLayout[];
  widgets: RegistryWidget[];
  [key: string]: unknown;
}

export const composition = compositionRegistry as unknown as CompositionRegistry;


export interface ProjectComponentRegistry {
  schemaVersion: 1;
  widgets?: RegistryWidget[];
  blocks?: RegistryWidget[];
}

export function mergeCompositionRegistry(custom?: ProjectComponentRegistry): CompositionRegistry {
  if (!custom) return composition;
  const customEntries = [
    ...(custom.widgets ?? []).map((entry) => ({ ...entry, category: 'widget' as const })),
    ...(custom.blocks ?? []).map((entry) => ({ ...entry, category: 'block' as const }))
  ];
  const builtInIds = new Set(composition.widgets.map((entry) => entry.id));
  const customIds = new Set<string>();
  for (const entry of customEntries) {
    if (builtInIds.has(entry.id)) throw new Error(`Custom component ${entry.id} conflicts with a built-in widget.`);
    if (customIds.has(entry.id)) throw new Error(`Duplicate custom component ${entry.id}.`);
    customIds.add(entry.id);
  }
  return {
    ...composition,
    layouts: composition.layouts.map((entry) => ({ ...entry })),
    widgets: [
      ...composition.widgets.map((entry) => ({ ...entry })),
      ...customEntries
    ]
  };
}

export type ProjectDiagnosticCode = 'BLUEPRINT_INVALID' | 'REGISTRY_INVALID' | 'COMPOSITION_INVALID' | 'INTERACTION_INVALID' | 'DATA_OPERATION_INVALID';
export interface ProjectDiagnostic {
  code: ProjectDiagnosticCode;
  severity: 'error' | 'warning';
  source: string;
  message: string;
  pageId?: string;
  nodeId?: string;
  path?: string;
}

function pushDiagnostic(
  diagnostics: ProjectDiagnostic[],
  code: ProjectDiagnosticCode,
  message: string,
  details: { pageId?: string; nodeId?: string; path?: string } = {}
) {
  diagnostics.push({
    code,
    severity: 'error',
    source: 'foundation.project.json',
    message,
    ...(details.pageId === undefined ? {} : { pageId: details.pageId }),
    ...(details.nodeId === undefined ? {} : { nodeId: details.nodeId }),
    ...(details.path === undefined ? {} : { path: details.path })
  });
}

function uniqueIds<T extends { id: string }>(
  entries: readonly T[],
  label: string,
  diagnostics: ProjectDiagnostic[],
  pageId: string,
  code: ProjectDiagnosticCode
): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) pushDiagnostic(diagnostics, code, `Duplicate ${label} id ${entry.id}.`, { pageId });
    ids.add(entry.id);
  }
  return ids;
}

function stateTypeAllowed(allowed: StateType | StateType[] | undefined, actual: StateType): boolean {
  if (!allowed) return false;
  return Array.isArray(allowed) ? allowed.includes(actual) : allowed === actual;
}

export function diagnoseBlueprintModel(blueprint: ProjectBlueprint, customRegistry?: ProjectComponentRegistry): ProjectDiagnostic[] {
  const diagnostics: ProjectDiagnostic[] = [];
  if (blueprint.schemaVersion !== 1) {
    pushDiagnostic(diagnostics, 'BLUEPRINT_INVALID', 'Project Blueprint schemaVersion must be 1.');
    return diagnostics;
  }

  let registry: CompositionRegistry;
  try {
    registry = mergeCompositionRegistry(customRegistry);
  } catch (error) {
    diagnostics.push({
      code: 'REGISTRY_INVALID',
      severity: 'error',
      source: 'foundation.registry.json',
      message: error instanceof Error ? error.message : String(error)
    });
    return diagnostics;
  }

  const layoutById = new Map<string, RegistryLayout>(registry.layouts.map((entry) => [entry.id, entry]));
  const widgetById = new Map<string, RegistryWidget>(registry.widgets.map((entry) => [entry.id, entry]));
  uniqueIds(blueprint.pages, 'page', diagnostics, 'project', 'BLUEPRINT_INVALID');

  for (const page of blueprint.pages) {
    const state = page.state ?? [];
    const actions = page.actions ?? [];
    const dataSources = page.dataSources ?? [];
    const operations = page.operations ?? [];
    const stateIds = uniqueIds(state, 'state', diagnostics, page.id, 'INTERACTION_INVALID');
    const actionIds = uniqueIds(actions, 'action', diagnostics, page.id, 'INTERACTION_INVALID');
    const sourceIds = uniqueIds(dataSources, 'data source', diagnostics, page.id, 'DATA_OPERATION_INVALID');
    const operationIds = uniqueIds(operations, 'operation', diagnostics, page.id, 'DATA_OPERATION_INVALID');
    const stateById = new Map(state.map((entry) => [entry.id, entry]));

    for (const action of actions) {
      action.steps.forEach((step, index) => {
        const path = `pages.${page.id}.actions.${action.id}.steps.${index}`;
        if (['set', 'toggle', 'increment', 'reset'].includes(step.type)) {
          if (!step.state || !stateIds.has(step.state)) pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Action ${action.id} references unknown state ${step.state ?? '(missing)'}.`, { pageId: page.id, path });
          const target = step.state ? stateById.get(step.state) : undefined;
          if (step.type === 'toggle' && target && target.type !== 'boolean') pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Action ${action.id} toggle target ${target.id} must be boolean.`, { pageId: page.id, path });
          if (step.type === 'increment' && target && target.type !== 'number') pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Action ${action.id} increment target ${target.id} must be number.`, { pageId: page.id, path });
        }
        if (step.type === 'invoke' && (!step.operation || !operationIds.has(step.operation))) pushDiagnostic(diagnostics, 'DATA_OPERATION_INVALID', `Action ${action.id} invokes unknown operation ${step.operation ?? '(missing)'}.`, { pageId: page.id, path });
        if (step.type === 'navigate' && (!step.to || !step.to.startsWith('/') || step.to.startsWith('//'))) pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Action ${action.id} navigate target must be an internal router destination.`, { pageId: page.id, path });
      });
    }

    for (const operation of operations) {
      const base = `pages.${page.id}.operations.${operation.id}`;
      if (!sourceIds.has(operation.source)) pushDiagnostic(diagnostics, 'DATA_OPERATION_INVALID', `Operation ${operation.id} references unknown data source ${operation.source}.`, { pageId: page.id, path: `${base}.source` });
      for (const [key, expected] of [['pendingState', 'boolean'], ['errorState', 'string']] as const) {
        const targetId = operation.lifecycle?.[key];
        if (!targetId) continue;
        const target = stateById.get(targetId);
        if (!target) pushDiagnostic(diagnostics, 'DATA_OPERATION_INVALID', `Operation ${operation.id} lifecycle references unknown state ${targetId}.`, { pageId: page.id, path: `${base}.lifecycle.${key}` });
        else if (target.type !== expected) pushDiagnostic(diagnostics, 'DATA_OPERATION_INVALID', `Operation ${operation.id} ${key} must target ${expected} state.`, { pageId: page.id, path: `${base}.lifecycle.${key}` });
      }
      for (const [index, result] of (operation.result ?? []).entries()) {
        if (!stateIds.has(result.state)) pushDiagnostic(diagnostics, 'DATA_OPERATION_INVALID', `Operation ${operation.id} result targets unknown state ${result.state}.`, { pageId: page.id, path: `${base}.result.${index}` });
      }
    }

    if (!page.composition) continue;
    const seenNodes = new Set<string>();
    const visit = (node: VisualNode, path: string) => {
      if (seenNodes.has(node.id)) pushDiagnostic(diagnostics, 'COMPOSITION_INVALID', `Duplicate visual composition node id ${node.id}.`, { pageId: page.id, nodeId: node.id, path });
      seenNodes.add(node.id);
      if (node.kind === 'layout') {
        if (!layoutById.has(node.type)) pushDiagnostic(diagnostics, 'COMPOSITION_INVALID', `Unknown layout ${node.type}.`, { pageId: page.id, nodeId: node.id, path });
        if (node.type === 'split' && (node.children?.length ?? 0) !== 2) pushDiagnostic(diagnostics, 'COMPOSITION_INVALID', `Split ${node.id} requires exactly two children.`, { pageId: page.id, nodeId: node.id, path });
        if (node.type === 'tabs' && (node.children?.length ?? 0) < 1) pushDiagnostic(diagnostics, 'COMPOSITION_INVALID', `Tabs ${node.id} requires at least one child.`, { pageId: page.id, nodeId: node.id, path });
      } else {
        const definition = widgetById.get(node.type);
        if (!definition) {
          pushDiagnostic(diagnostics, 'COMPOSITION_INVALID', `Unknown widget ${node.type}.`, { pageId: page.id, nodeId: node.id, path });
        } else {
          const propertyKeys = new Set((definition.properties ?? []).map((entry) => entry.key));
          for (const key of Object.keys(node.props ?? {})) if (!propertyKeys.has(key)) pushDiagnostic(diagnostics, 'COMPOSITION_INVALID', `Widget ${node.id} property ${key} is not declared by ${node.type}.`, { pageId: page.id, nodeId: node.id, path: `${path}.props.${key}` });
          const bindings = node.bindings ?? {};
          for (const property of definition.properties ?? []) {
            if (property.required && (node.props?.[property.key] === undefined) && !bindings[property.key]) pushDiagnostic(diagnostics, 'COMPOSITION_INVALID', `Widget ${node.id} requires property ${property.key} or a binding.`, { pageId: page.id, nodeId: node.id, path: `${path}.props.${property.key}` });
          }
          for (const [property, reference] of Object.entries(bindings)) {
            const allowed = definition.bindings?.[property];
            const target = stateById.get(reference.state);
            if (!allowed) pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Widget ${node.id} does not support binding ${property}.`, { pageId: page.id, nodeId: node.id, path: `${path}.bindings.${property}` });
            else if (!target) pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Widget ${node.id} binds unknown state ${reference.state}.`, { pageId: page.id, nodeId: node.id, path: `${path}.bindings.${property}` });
            else if (!stateTypeAllowed(allowed, target.type)) pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Widget ${node.id} binding ${property} does not accept ${target.type} state.`, { pageId: page.id, nodeId: node.id, path: `${path}.bindings.${property}` });
          }
          for (const [eventName, connected] of Object.entries(node.events ?? {})) {
            if (!definition.events?.[eventName]) pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Widget ${node.id} does not support event ${eventName}.`, { pageId: page.id, nodeId: node.id, path: `${path}.events.${eventName}` });
            for (const actionId of connected) if (!actionIds.has(actionId)) pushDiagnostic(diagnostics, 'INTERACTION_INVALID', `Widget ${node.id} event ${eventName} references unknown action ${actionId}.`, { pageId: page.id, nodeId: node.id, path: `${path}.events.${eventName}` });
          }
          if (!definition.acceptsChildren && (node.children?.length ?? 0) > 0) pushDiagnostic(diagnostics, 'COMPOSITION_INVALID', `Widget ${node.id} (${node.type}) does not accept children.`, { pageId: page.id, nodeId: node.id, path });
        }
      }
      (node.children ?? []).forEach((child, index) => visit(child, `${path}.children.${index}`));
    };
    visit(page.composition, `pages.${page.id}.composition`);
  }

  return diagnostics;
}
