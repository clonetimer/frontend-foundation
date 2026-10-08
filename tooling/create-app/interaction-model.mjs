import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, 'composition.json'), 'utf8'));
const widgetDefinitions = new Map(catalog.widgets.map((entry) => [entry.id, entry]));

const stateIdPattern = /^[a-z][A-Za-z0-9]*$/;
const actionIdPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const stateTypes = new Set(['string', 'number', 'boolean']);
const maxStateEntries = 100;
const maxActions = 100;
const maxActionSteps = 50;

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

function rejectUnknown(object, allowed, label) {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`${label}.${key} is not supported`);
}

function valueType(value) {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return undefined;
}

function assertValueType(value, expected, label) {
  const actual = valueType(value);
  if (actual !== expected) fail(`${label} must be ${expected}; found ${actual ?? typeof value}`);
}

function normalizeActionValue(value, label) {
  const primitiveType = valueType(value);
  if (primitiveType) return value;
  const source = requireObject(value, label);
  rejectUnknown(source, ['state', 'event'], label);
  const keys = Object.keys(source);
  if (keys.length !== 1) fail(`${label} must reference exactly one source: state or event`);
  if (source.state !== undefined) {
    const state = requireString(source.state, `${label}.state`);
    if (!stateIdPattern.test(state)) fail(`${label}.state must match ${stateIdPattern}`);
    return { state };
  }
  if (source.event !== 'value') fail(`${label}.event must be "value"`);
  return { event: 'value' };
}

function normalizeState(input, label) {
  if (input === undefined) return [];
  if (!Array.isArray(input)) fail(`${label} must be an array`);
  if (input.length > maxStateEntries) fail(`${label} exceeds maximum state entry count ${maxStateEntries}`);
  const seen = new Set();
  return input.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const item = requireObject(entry, itemLabel);
    rejectUnknown(item, ['id', 'type', 'initial'], itemLabel);
    const id = requireString(item.id, `${itemLabel}.id`);
    if (!stateIdPattern.test(id)) fail(`${itemLabel}.id must be lowerCamelCase and match ${stateIdPattern}`);
    if (seen.has(id)) fail(`Duplicate page state id ${id}`);
    seen.add(id);
    const type = requireString(item.type, `${itemLabel}.type`);
    if (!stateTypes.has(type)) fail(`${itemLabel}.type must be one of: ${[...stateTypes].join(', ')}`);
    if (!Object.prototype.hasOwnProperty.call(item, 'initial')) fail(`${itemLabel}.initial is required`);
    assertValueType(item.initial, type, `${itemLabel}.initial`);
    return { id, type, initial: item.initial };
  });
}

function normalizeActions(input, stateById, label, operationIds = new Set()) {
  if (input === undefined) return [];
  if (!Array.isArray(input)) fail(`${label} must be an array`);
  if (input.length > maxActions) fail(`${label} exceeds maximum action count ${maxActions}`);
  const seen = new Set();
  return input.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const item = requireObject(entry, itemLabel);
    rejectUnknown(item, ['id', 'steps'], itemLabel);
    const id = requireString(item.id, `${itemLabel}.id`);
    if (!actionIdPattern.test(id)) fail(`${itemLabel}.id must match ${actionIdPattern}`);
    if (seen.has(id)) fail(`Duplicate page action id ${id}`);
    seen.add(id);
    if (!Array.isArray(item.steps) || item.steps.length === 0) fail(`${itemLabel}.steps must be a non-empty array`);
    if (item.steps.length > maxActionSteps) fail(`${itemLabel}.steps exceeds maximum step count ${maxActionSteps}`);
    const steps = item.steps.map((stepInput, stepIndex) => {
      const stepLabel = `${itemLabel}.steps[${stepIndex}]`;
      const step = requireObject(stepInput, stepLabel);
      const type = requireString(step.type, `${stepLabel}.type`);
      if (!['set', 'toggle', 'increment', 'reset', 'invoke', 'navigate'].includes(type)) fail(`${stepLabel}.type must be one of: set, toggle, increment, reset, invoke, navigate`);

      if (type === 'invoke') {
        rejectUnknown(step, ['type', 'operation'], stepLabel);
        const operation = requireString(step.operation, `${stepLabel}.operation`);
        if (!operationIds.has(operation)) fail(`${stepLabel}.operation references unknown page operation ${operation}`);
        return { type, operation };
      }

      if (type === 'navigate') {
        rejectUnknown(step, ['type', 'to', 'replace'], stepLabel);
        const to = requireString(step.to, `${stepLabel}.to`);
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(to) || to.includes('\\') || /[\r\n]/.test(to)) fail(`${stepLabel}.to must be an internal router destination`);
        if (step.replace !== undefined && typeof step.replace !== 'boolean') fail(`${stepLabel}.replace must be boolean`);
        return { type, to, ...(step.replace ? { replace: true } : {}) };
      }

      const target = requireString(step.state, `${stepLabel}.state`);
      const targetState = stateById.get(target);
      if (!targetState) fail(`${stepLabel}.state references unknown page state ${target}`);

      if (type === 'set') {
        rejectUnknown(step, ['type', 'state', 'value'], stepLabel);
        if (!Object.prototype.hasOwnProperty.call(step, 'value')) fail(`${stepLabel}.value is required for set`);
        const value = normalizeActionValue(step.value, `${stepLabel}.value`);
        if (plainObject(value) && value.state !== undefined) {
          const source = stateById.get(value.state);
          if (!source) fail(`${stepLabel}.value.state references unknown page state ${value.state}`);
          if (source.type !== targetState.type) fail(`${stepLabel}.value.state type ${source.type} does not match target ${target} type ${targetState.type}`);
        } else if (!plainObject(value)) {
          assertValueType(value, targetState.type, `${stepLabel}.value`);
        }
        return { type, state: target, value };
      }

      if (type === 'toggle') {
        rejectUnknown(step, ['type', 'state'], stepLabel);
        if (targetState.type !== 'boolean') fail(`${stepLabel} toggle requires boolean state; ${target} is ${targetState.type}`);
        return { type, state: target };
      }

      if (type === 'increment') {
        rejectUnknown(step, ['type', 'state', 'by'], stepLabel);
        if (targetState.type !== 'number') fail(`${stepLabel} increment requires number state; ${target} is ${targetState.type}`);
        const by = step.by ?? 1;
        if (typeof by !== 'number' || !Number.isFinite(by)) fail(`${stepLabel}.by must be a finite number`);
        return { type, state: target, ...(by === 1 ? {} : { by }) };
      }

      rejectUnknown(step, ['type', 'state'], stepLabel);
      return { type, state: target };
    });
    return { id, steps };
  });
}

export function normalizeInteractionModel(input = {}, label = 'page', options = {}) {
  const page = input === undefined ? {} : requireObject(input, label);
  rejectUnknown(page, ['state', 'actions'], label);
  const state = normalizeState(page.state, `${label}.state`);
  const stateById = new Map(state.map((entry) => [entry.id, entry]));
  const operationIds = options.operationIds instanceof Set ? options.operationIds : new Set(options.operationIds ?? []);
  const actions = normalizeActions(page.actions, stateById, `${label}.actions`, operationIds);
  return { state, actions };
}

function compatible(expected, actual) {
  const values = Array.isArray(expected) ? expected : [expected];
  return values.includes(actual);
}

function walk(node, visit, path = 'composition') {
  visit(node, path);
  for (let index = 0; index < (node.children?.length ?? 0); index += 1) walk(node.children[index], visit, `${path}.children[${index}]`);
}

function actionUsesEventValue(action) {
  return action.steps.some((step) => step.type === 'set' && plainObject(step.value) && step.value.event === 'value');
}

function validateActionForEvent(action, eventDefinition, stateById, label) {
  for (const [index, step] of action.steps.entries()) {
    if (step.type !== 'set' || !plainObject(step.value) || step.value.event !== 'value') continue;
    if (!eventDefinition.valueType) fail(`${label}: action ${action.id} step ${index} requires event.value, but this event has no value`);
    const targetState = stateById.get(step.state);
    if (targetState.type !== eventDefinition.valueType) {
      fail(`${label}: action ${action.id} event.value type ${eventDefinition.valueType} does not match state ${step.state} type ${targetState.type}`);
    }
  }
}

export function validateCompositionInteractions(compositionRoot, interactionModel, label = 'composition', options = {}) {
  const definitions = options.widgetDefinitions ?? widgetDefinitions;
  const stateById = new Map(interactionModel.state.map((entry) => [entry.id, entry]));
  const actionById = new Map(interactionModel.actions.map((entry) => [entry.id, entry]));
  let connectionCount = 0;
  let bindingCount = 0;

  walk(compositionRoot, (node, nodeLabel) => {
    if (node.kind !== 'widget') {
      if (node.bindings || node.events) fail(`${nodeLabel}: layout nodes cannot declare bindings or events`);
      return;
    }
    const definition = definitions.get(node.type);
    if (!definition) fail(`${nodeLabel}: unknown widget ${node.type}`);
    const bindings = node.bindings ?? {};
    for (const [property, reference] of Object.entries(bindings)) {
      const accepted = definition.bindings?.[property];
      if (!accepted) fail(`${nodeLabel}.bindings.${property} is not supported by widget ${node.type}`);
      const state = stateById.get(reference.state);
      if (!state) fail(`${nodeLabel}.bindings.${property} references unknown page state ${reference.state}`);
      if (!compatible(accepted, state.type)) fail(`${nodeLabel}.bindings.${property} expects ${Array.isArray(accepted) ? accepted.join('|') : accepted}; state ${reference.state} is ${state.type}`);
      if (property === 'value' && node.props?.defaultValue !== undefined) fail(`${nodeLabel} cannot combine bindings.value with props.defaultValue`);
      bindingCount += 1;
    }

    const events = node.events ?? {};
    for (const [eventName, actionIds] of Object.entries(events)) {
      const eventDefinition = definition.events?.[eventName];
      if (!eventDefinition) fail(`${nodeLabel}.events.${eventName} is not supported by widget ${node.type}`);
      for (const actionId of actionIds) {
        const action = actionById.get(actionId);
        if (!action) fail(`${nodeLabel}.events.${eventName} references unknown page action ${actionId}`);
        validateActionForEvent(action, eventDefinition, stateById, `${nodeLabel}.events.${eventName}`);
        connectionCount += 1;
      }
    }
  }, label);

  for (const action of interactionModel.actions) {
    if (actionUsesEventValue(action)) {
      const used = [];
      walk(compositionRoot, (node) => {
        for (const [eventName, actionIds] of Object.entries(node.events ?? {})) {
          if (actionIds.includes(action.id)) used.push({ node, eventName });
        }
      });
      if (!used.length) fail(`${label}: action ${action.id} uses event.value but is not connected to any widget event`);
    }
  }

  return { bindingCount, connectionCount };
}

export function stateSetterName(id) {
  return `set${id[0].toUpperCase()}${id.slice(1)}`;
}

export function actionValueExpression(value, eventValueIdentifier = 'value') {
  if (!plainObject(value)) return JSON.stringify(value);
  if (value.state !== undefined) return value.state;
  if (value.event === 'value') return eventValueIdentifier;
  fail('Internal error: unsupported action value');
}

export function actionHasAsyncStep(action) {
  return action.steps.some((step) => step.type === 'invoke');
}

export function interactionNeedsNavigation(interactionModel) {
  return interactionModel.actions.some((action) => action.steps.some((step) => step.type === 'navigate'));
}
