import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionHasAsyncStep, actionValueExpression, interactionNeedsNavigation, stateSetterName, validateCompositionInteractions } from './interaction-model.mjs';
import { operationFunctionName, renderDataOperationSupport } from './data-operation.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, 'composition.json'), 'utf8'));
const layoutDefinitions = new Map(catalog.layouts.map((entry) => [entry.id, entry]));
const builtInWidgetDefinitions = new Map(catalog.widgets.map((entry) => [entry.id, entry]));

const nodeIdPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const stateIdPattern = /^[a-z][A-Za-z0-9]*$/;
const actionIdPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const maxDepth = 20;
const maxNodes = 500;

function fail(message) {
  throw new Error(message);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!plainObject(value)) fail(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalString(value, label) {
  if (value === undefined) return undefined;
  return requireString(value, label);
}

function optionalBoolean(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail(`${label} must be boolean`);
  return value;
}

function optionalNumber(value, label, { min = 0, max = 100000, integer = false } = {}) {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(`${label} must be ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}`);
  }
  return value;
}

function enumValue(value, label, allowed, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value)) fail(`${label} must be one of: ${allowed.join(', ')}`);
  return value;
}

function rejectUnknown(object, allowed, label) {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`${label}.${key} is not supported`);
}

function normalizePlacement(value, label) {
  if (value === undefined) return undefined;
  const placement = requireObject(value, label);
  rejectUnknown(placement, ['span'], label);
  const span = optionalNumber(placement.span, `${label}.span`, { min: 1, max: 24, integer: true });
  return span === undefined ? undefined : { span };
}

function normalizeLayoutProps(type, value, label) {
  const props = value === undefined ? {} : requireObject(value, label);
  if (type === 'stack') {
    rejectUnknown(props, ['direction', 'gap', 'align', 'wrap'], label);
    return {
      ...(props.direction === undefined ? {} : { direction: enumValue(props.direction, `${label}.direction`, ['vertical', 'horizontal']) }),
      ...(props.gap === undefined ? {} : { gap: optionalNumber(props.gap, `${label}.gap`, { min: 0, max: 128 }) }),
      ...(props.align === undefined ? {} : { align: enumValue(props.align, `${label}.align`, ['start', 'center', 'end', 'stretch']) }),
      ...(props.wrap === undefined ? {} : { wrap: optionalBoolean(props.wrap, `${label}.wrap`) })
    };
  }
  if (type === 'grid') {
    rejectUnknown(props, ['columns', 'minColumnWidth', 'gap'], label);
    return {
      ...(props.columns === undefined ? {} : { columns: optionalNumber(props.columns, `${label}.columns`, { min: 1, max: 24, integer: true }) }),
      ...(props.minColumnWidth === undefined ? {} : { minColumnWidth: optionalNumber(props.minColumnWidth, `${label}.minColumnWidth`, { min: 80, max: 2000 }) }),
      ...(props.gap === undefined ? {} : { gap: optionalNumber(props.gap, `${label}.gap`, { min: 0, max: 128 }) })
    };
  }
  if (type === 'split') {
    rejectUnknown(props, ['direction', 'secondarySize', 'gap', 'minSize'], label);
    return {
      ...(props.direction === undefined ? {} : { direction: enumValue(props.direction, `${label}.direction`, ['horizontal', 'vertical']) }),
      ...(props.secondarySize === undefined ? {} : { secondarySize: optionalNumber(props.secondarySize, `${label}.secondarySize`, { min: 80, max: 4000 }) }),
      ...(props.gap === undefined ? {} : { gap: optionalNumber(props.gap, `${label}.gap`, { min: 0, max: 128 }) }),
      ...(props.minSize === undefined ? {} : { minSize: optionalNumber(props.minSize, `${label}.minSize`, { min: 0, max: 4000 }) })
    };
  }
  if (type === 'tabs') {
    rejectUnknown(props, ['tabPosition'], label);
    return props.tabPosition === undefined ? {} : { tabPosition: enumValue(props.tabPosition, `${label}.tabPosition`, ['top', 'right', 'bottom', 'left']) };
  }
  fail(`Unknown layout ${type}`);
}

function normalizeWidgetProps(type, value, label) {
  const props = value === undefined ? {} : requireObject(value, label);
  if (type === 'panel') {
    rejectUnknown(props, ['title', 'description'], label);
    return {
      ...(props.title === undefined ? {} : { title: requireString(props.title, `${label}.title`) }),
      ...(props.description === undefined ? {} : { description: requireString(props.description, `${label}.description`) })
    };
  }
  if (type === 'text') {
    rejectUnknown(props, ['text', 'variant'], label);
    return {
      text: requireString(props.text, `${label}.text`),
      ...(props.variant === undefined ? {} : { variant: enumValue(props.variant, `${label}.variant`, ['body', 'secondary', 'title', 'subtitle']) })
    };
  }
  if (type === 'button') {
    rejectUnknown(props, ['label', 'type', 'disabled'], label);
    return {
      label: requireString(props.label, `${label}.label`),
      ...(props.type === undefined ? {} : { type: enumValue(props.type, `${label}.type`, ['default', 'primary', 'dashed', 'link', 'text']) }),
      ...(props.disabled === undefined ? {} : { disabled: optionalBoolean(props.disabled, `${label}.disabled`) })
    };
  }
  if (type === 'input') {
    rejectUnknown(props, ['label', 'placeholder', 'defaultValue', 'disabled'], label);
    return {
      ...(props.label === undefined ? {} : { label: requireString(props.label, `${label}.label`) }),
      ...(props.placeholder === undefined ? {} : { placeholder: requireString(props.placeholder, `${label}.placeholder`) }),
      ...(props.defaultValue === undefined ? {} : { defaultValue: requireString(props.defaultValue, `${label}.defaultValue`) }),
      ...(props.disabled === undefined ? {} : { disabled: optionalBoolean(props.disabled, `${label}.disabled`) })
    };
  }
  if (type === 'select') {
    rejectUnknown(props, ['label', 'placeholder', 'defaultValue', 'options', 'disabled'], label);
    if (!Array.isArray(props.options)) fail(`${label}.options must be an array`);
    const options = props.options.map((option, index) => {
      const item = requireObject(option, `${label}.options[${index}]`);
      rejectUnknown(item, ['label', 'value'], `${label}.options[${index}]`);
      return { label: requireString(item.label, `${label}.options[${index}].label`), value: requireString(item.value, `${label}.options[${index}].value`) };
    });
    return {
      ...(props.label === undefined ? {} : { label: requireString(props.label, `${label}.label`) }),
      ...(props.placeholder === undefined ? {} : { placeholder: requireString(props.placeholder, `${label}.placeholder`) }),
      ...(props.defaultValue === undefined ? {} : { defaultValue: requireString(props.defaultValue, `${label}.defaultValue`) }),
      options,
      ...(props.disabled === undefined ? {} : { disabled: optionalBoolean(props.disabled, `${label}.disabled`) })
    };
  }
  if (type === 'metric') {
    rejectUnknown(props, ['label', 'value', 'suffix', 'description'], label);
    const metricValue = props.value;
    if (!(typeof metricValue === 'string' || (typeof metricValue === 'number' && Number.isFinite(metricValue)))) fail(`${label}.value must be a finite number or string`);
    return {
      label: requireString(props.label, `${label}.label`),
      value: metricValue,
      ...(props.suffix === undefined ? {} : { suffix: requireString(props.suffix, `${label}.suffix`) }),
      ...(props.description === undefined ? {} : { description: requireString(props.description, `${label}.description`) })
    };
  }
  if (type === 'placeholder') {
    rejectUnknown(props, ['title', 'description'], label);
    return {
      title: requireString(props.title, `${label}.title`),
      ...(props.description === undefined ? {} : { description: requireString(props.description, `${label}.description`) })
    };
  }
  fail(`Unknown widget ${type}`);
}


export function createWidgetDefinitionMap(customWidgets = []) {
  const definitions = new Map(builtInWidgetDefinitions);
  for (const entry of customWidgets) {
    if (definitions.has(entry.id)) fail(`Custom widget ${entry.id} conflicts with an existing widget`);
    definitions.set(entry.id, entry);
  }
  return definitions;
}

function validateJsonData(value, label, depth = 0) {
  if (depth > 20) fail(`${label} is nested too deeply`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) validateJsonData(value[index], `${label}[${index}]`, depth + 1);
    return;
  }
  if (plainObject(value)) {
    for (const [key, child] of Object.entries(value)) validateJsonData(child, `${label}.${key}`, depth + 1);
    return;
  }
  fail(`${label} must contain JSON-serializable data only`);
}

function normalizeCustomWidgetProps(definition, value, label, boundProperties = new Set()) {
  const props = value === undefined ? {} : requireObject(value, label);
  const propertyByKey = new Map((definition.properties ?? []).map((entry) => [entry.key, entry]));
  rejectUnknown(props, [...propertyByKey.keys()], label);
  const output = {};
  for (const property of definition.properties ?? []) {
    let current = props[property.key];
    if (current === undefined && property.default !== undefined) current = property.default;
    if (current === undefined) {
      if (property.required && !boundProperties.has(property.key)) fail(`${label}.${property.key} is required by custom widget ${definition.id}`);
      continue;
    }
    if (property.kind === 'text') {
      if (typeof current !== 'string') fail(`${label}.${property.key} must be string`);
    } else if (property.kind === 'number') {
      if (typeof current !== 'number' || !Number.isFinite(current)) fail(`${label}.${property.key} must be a finite number`);
    } else if (property.kind === 'boolean') {
      if (typeof current !== 'boolean') fail(`${label}.${property.key} must be boolean`);
    } else if (property.kind === 'select') {
      if (typeof current !== 'string' || (property.options?.length && !property.options.includes(current))) fail(`${label}.${property.key} must be one of: ${(property.options ?? []).join(', ')}`);
    } else {
      validateJsonData(current, `${label}.${property.key}`);
    }
    output[property.key] = current;
  }
  return output;
}

function normalizeBindings(value, label, definition) {
  if (value === undefined) return undefined;
  const bindings = requireObject(value, label);
  const output = {};
  for (const [property, referenceInput] of Object.entries(bindings)) {
    if (!definition.bindings?.[property]) fail(`${label}.${property} is not supported by widget ${definition.id}`);
    const reference = requireObject(referenceInput, `${label}.${property}`);
    rejectUnknown(reference, ['state'], `${label}.${property}`);
    const state = requireString(reference.state, `${label}.${property}.state`);
    if (!stateIdPattern.test(state)) fail(`${label}.${property}.state must match ${stateIdPattern}`);
    output[property] = { state };
  }
  return Object.keys(output).length ? output : undefined;
}

function normalizeEvents(value, label, definition) {
  if (value === undefined) return undefined;
  const events = requireObject(value, label);
  const output = {};
  for (const [eventName, actionIdsInput] of Object.entries(events)) {
    if (!definition.events?.[eventName]) fail(`${label}.${eventName} is not supported by widget ${definition.id}`);
    if (!Array.isArray(actionIdsInput) || actionIdsInput.length === 0) fail(`${label}.${eventName} must be a non-empty action-id array`);
    const seen = new Set();
    const actionIds = actionIdsInput.map((value, index) => {
      const id = requireString(value, `${label}.${eventName}[${index}]`);
      if (!actionIdPattern.test(id)) fail(`${label}.${eventName}[${index}] must match ${actionIdPattern}`);
      if (seen.has(id)) fail(`${label}.${eventName} contains duplicate action ${id}`);
      seen.add(id);
      return id;
    });
    output[eventName] = actionIds;
  }
  return Object.keys(output).length ? output : undefined;
}

function normalizeNode(input, label, context, depth = 0) {
  if (depth > maxDepth) fail(`${label} exceeds maximum composition depth ${maxDepth}`);
  context.count += 1;
  if (context.count > maxNodes) fail(`Visual composition exceeds maximum node count ${maxNodes}`);

  const node = requireObject(input, label);
  rejectUnknown(node, ['id', 'kind', 'type', 'label', 'props', 'placement', 'bindings', 'events', 'children'], label);
  const id = requireString(node.id, `${label}.id`);
  if (!nodeIdPattern.test(id)) fail(`${label}.id must match ${nodeIdPattern}`);
  if (context.ids.has(id)) fail(`Duplicate visual composition node id ${id}`);
  context.ids.add(id);
  const kind = enumValue(node.kind, `${label}.kind`, ['layout', 'widget']);
  const type = requireString(node.type, `${label}.type`);
  const labelText = optionalString(node.label, `${label}.label`);
  const placement = normalizePlacement(node.placement, `${label}.placement`);
  const childrenInput = node.children ?? [];
  if (!Array.isArray(childrenInput)) fail(`${label}.children must be an array`);

  if (kind === 'layout') {
    const definition = layoutDefinitions.get(type);
    if (!definition) fail(`${label}.type references unknown layout ${type}`);
    if (node.bindings !== undefined || node.events !== undefined) fail(`${label}: layout nodes cannot declare bindings or events`);
    if (type === 'split' && childrenInput.length !== 2) fail(`${label} split layout requires exactly 2 children`);
    if (type === 'tabs' && childrenInput.length < 1) fail(`${label} tabs layout requires at least 1 child`);
    const children = childrenInput.map((child, index) => normalizeNode(child, `${label}.children[${index}]`, context, depth + 1));
    if (type === 'tabs') {
      for (let index = 0; index < children.length; index += 1) if (!children[index].label) fail(`${label}.children[${index}].label is required inside tabs layout`);
    }
    return { id, kind, type, ...(labelText ? { label: labelText } : {}), props: normalizeLayoutProps(type, node.props, `${label}.props`), ...(placement ? { placement } : {}), children };
  }

  const definition = context.widgetDefinitions.get(type);
  if (!definition) fail(`${label}.type references unknown widget ${type}`);
  if (!definition.acceptsChildren && childrenInput.length) fail(`${label} widget ${type} does not accept children`);
  const children = childrenInput.map((child, index) => normalizeNode(child, `${label}.children[${index}]`, context, depth + 1));
  const bindings = normalizeBindings(node.bindings, `${label}.bindings`, definition);
  const events = normalizeEvents(node.events, `${label}.events`, definition);
  const boundProperties = new Set(Object.keys(bindings ?? {}));
  return {
    id,
    kind,
    type,
    ...(labelText ? { label: labelText } : {}),
    props: builtInWidgetDefinitions.has(type) ? normalizeWidgetProps(type, node.props, `${label}.props`) : normalizeCustomWidgetProps(definition, node.props, `${label}.props`, boundProperties),
    ...(placement ? { placement } : {}),
    ...(bindings ? { bindings } : {}),
    ...(events ? { events } : {}),
    ...(children.length ? { children } : {})
  };
}

export function normalizeVisualComposition(input, label = 'composition', options = {}) {
  const context = { ids: new Set(), count: 0, widgetDefinitions: options.widgetDefinitions ?? createWidgetDefinitionMap(options.customWidgets ?? []) };
  const root = normalizeNode(input, label, context);
  return { root, nodeCount: context.count };
}

function indent(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map((line) => line ? `${prefix}${line}` : line).join('\n');
}

function renderActionStep(step, stateById, eventValueIdentifier) {
  if (step.type === 'invoke') return `if (!(await ${operationFunctionName(step.operation)}())) return;`;
  if (step.type === 'navigate') return `navigate(${JSON.stringify(step.to)}${step.replace ? ', { replace: true }' : ''});`;
  const setter = stateSetterName(step.state);
  if (step.type === 'set') return `${setter}(${actionValueExpression(step.value, eventValueIdentifier)});`;
  if (step.type === 'toggle') return `${setter}((current) => !current);`;
  if (step.type === 'increment') return `${setter}((current) => current + ${JSON.stringify(step.by ?? 1)});`;
  if (step.type === 'reset') return `${setter}(${JSON.stringify(stateById.get(step.state).initial)});`;
  fail(`Internal renderer does not support action step ${step.type}`);
}

function jsxProps(node, interactionModel, widgetDefinitions) {
  const dynamic = new Set(Object.keys(node.bindings ?? {}));
  const parts = Object.entries(node.props)
    .filter(([key]) => !dynamic.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ` ${key}={${JSON.stringify(value)}}`);

  for (const [key, reference] of Object.entries(node.bindings ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(` ${key}={${reference.state}}`);
  }

  const actionById = new Map(interactionModel.actions.map((entry) => [entry.id, entry]));
  const stateById = new Map(interactionModel.state.map((entry) => [entry.id, entry]));
  const definition = node.kind === 'widget' ? widgetDefinitions.get(node.type) : undefined;
  for (const [eventName, actionIds] of Object.entries(node.events ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const eventDefinition = definition.events[eventName];
    const eventValueIdentifier = eventDefinition.parameter ?? 'value';
    const connectedActions = actionIds.map((actionId) => actionById.get(actionId));
    const statements = connectedActions.flatMap((action) => action.steps.map((step) => renderActionStep(step, stateById, eventValueIdentifier)));
    const parameters = eventDefinition.parameter ? eventDefinition.parameter : '';
    const asyncPrefix = connectedActions.some(actionHasAsyncStep) ? 'async ' : '';
    parts.push(` ${eventDefinition.prop}={${asyncPrefix}(${parameters}) => { ${statements.join(' ')} }}`);
  }
  return parts.join('');
}

function wrapPlacement(node, rendered) {
  if (!node.placement?.span) return rendered;
  return `<div style={{ gridColumn: ${JSON.stringify(`span ${node.placement.span}`)} }}>\n${indent(rendered, 2)}\n</div>`;
}

function addImport(imports, packageName, exportName) {
  const names = imports.get(packageName) ?? new Set();
  names.add(exportName);
  imports.set(packageName, names);
}

function componentDefinition(node, widgetDefinitions) {
  if (node.kind === 'layout') return layoutDefinitions.get(node.type);
  return widgetDefinitions.get(node.type);
}

function renderNode(node, imports, interactionModel, widgetDefinitions) {
  const definition = componentDefinition(node, widgetDefinitions);
  if (!definition?.exportName || !definition?.package) fail(`Internal renderer does not support ${node.kind}:${node.type}`);
  const component = definition.exportName;
  addImport(imports, definition.package, component);
  const props = jsxProps(node, interactionModel, widgetDefinitions);
  let content;
  if (node.kind === 'layout' && node.type === 'split') {
    const [primary, secondary] = node.children.map((child) => renderNode(child, imports, interactionModel, widgetDefinitions));
    content = `<${component}${props}\n  primary={(\n${indent(primary, 4)}\n  )}\n  secondary={(\n${indent(secondary, 4)}\n  )}\n/>`;
  } else if (node.kind === 'layout' && node.type === 'tabs') {
    const items = node.children.map((child) => {
      const rendered = renderNode(child, imports, interactionModel, widgetDefinitions);
      return `{ key: ${JSON.stringify(child.id)}, label: ${JSON.stringify(child.label)}, children: (\n${indent(rendered, 4)}\n  ) }`;
    });
    content = `<${component}${props}\n  items={[\n${items.map((item) => indent(item, 4)).join(',\n')}\n  ]}\n/>`;
  } else if (node.children?.length) {
    const children = node.children.map((child) => indent(renderNode(child, imports, interactionModel, widgetDefinitions), 2)).join('\n');
    content = `<${component}${props}>\n${children}\n</${component}>`;
  } else {
    content = `<${component}${props} />`;
  }
  const traced = `<>\n  {/* foundation-node:${node.id} */}\n${indent(content, 2)}\n</>`;
  return wrapPlacement(node, traced);
}

export function renderVisualCompositionPage({ title, composition, interactions = { state: [], actions: [] }, dataModel = { dataSources: [], operations: [] }, customWidgets = [] }) {
  const widgetDefinitions = createWidgetDefinitionMap(customWidgets);
  const normalized = composition?.root ? composition : normalizeVisualComposition(composition, 'composition', { widgetDefinitions });
  validateCompositionInteractions(normalized.root, interactions, 'composition', { widgetDefinitions });
  const imports = new Map();
  addImport(imports, '@foundation/ui', 'Page');
  addImport(imports, '@foundation/ui', 'PageContent');
  addImport(imports, '@foundation/ui', 'PageHeader');
  const body = renderNode(normalized.root, imports, interactions, widgetDefinitions);
  const importLines = [...imports.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([packageName, names]) => `import { ${[...names].sort().join(', ')} } from ${JSON.stringify(packageName)};`);
  const stateLines = interactions.state.map((entry) => `  const [${entry.id}, ${stateSetterName(entry.id)}] = useState(${JSON.stringify(entry.initial)});`);
  const operationSupport = renderDataOperationSupport(dataModel, interactions.state);
  const needsNavigate = interactionNeedsNavigation(interactions);
  const hookLines = [
    ...(operationSupport.needsApi ? ['  const transport = useApiTransport();'] : []),
    ...(needsNavigate ? ['  const navigate = useNavigate();'] : [])
  ];
  return [
    ...(stateLines.length ? [`import { useState } from 'react';`] : []),
    ...(needsNavigate ? [`import { useNavigate } from 'react-router';`] : []),
    ...(operationSupport.needsApi ? [`import { useApiTransport } from '@foundation/api';`] : []),
    ...importLines,
    '',
    ...operationSupport.helperLines,
    'export function Component() {',
    ...hookLines,
    ...stateLines,
    ...((hookLines.length || stateLines.length) ? [''] : []),
    ...operationSupport.functionLines,
    '  return (',
    '    <Page>',
    `      <PageHeader title=${JSON.stringify(title)} description="Visual Composition：结构、交互与数据操作由 foundation.project.json 编译为普通 React/TypeScript。" />`,
    '      <PageContent>',
    indent(body, 8),
    '      </PageContent>',
    '    </Page>',
    '  );',
    '}',
    ''
  ].join('\n');
}

export function listVisualCompositionCatalog() {
  return {
    layouts: catalog.layouts.map((entry) => ({ ...entry })),
    widgets: catalog.widgets.map((entry) => ({ ...entry }))
  };
}
