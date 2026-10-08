import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const customRegistryFileName = 'foundation.registry.json';

const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const customIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const propPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const exportPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const stateTypes = new Set(['string', 'number', 'boolean']);
const propertyKinds = new Set(['text', 'number', 'boolean', 'select', 'json']);
const reservedProps = new Set(['children', 'key', 'ref']);

function fail(message) { throw new Error(message); }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requireObject(value, label) { if (!plainObject(value)) fail(`${label} must be an object`); return value; }
function requireString(value, label) { if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`); return value.trim(); }
function optionalBoolean(value, label) { if (value === undefined) return undefined; if (typeof value !== 'boolean') fail(`${label} must be boolean`); return value; }
function rejectUnknown(object, allowed, label) { for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`${label}.${key} is not supported`); }

function validateJsonData(value, label, depth = 0) {
  if (depth > 20) fail(`${label} is nested too deeply`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail(`${label} contains a non-finite number`); return; }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateJsonData(entry, `${label}[${index}]`, depth + 1)); return; }
  if (plainObject(value)) { for (const [key, child] of Object.entries(value)) validateJsonData(child, `${label}.${key}`, depth + 1); return; }
  fail(`${label} must contain JSON-serializable data only`);
}

function normalizeProperty(input, label) {
  const property = requireObject(input, label);
  rejectUnknown(property, ['key', 'label', 'kind', 'options', 'required', 'default'], label);
  const key = requireString(property.key, `${label}.key`);
  if (!propPattern.test(key) || reservedProps.has(key)) fail(`${label}.key must be a safe React prop identifier and cannot be children/key/ref`);
  const displayLabel = requireString(property.label, `${label}.label`);
  const kind = requireString(property.kind, `${label}.kind`);
  if (!propertyKinds.has(kind)) fail(`${label}.kind must be one of: ${[...propertyKinds].join(', ')}`);
  let options;
  if (property.options !== undefined) {
    if (kind !== 'select') fail(`${label}.options is only supported for select properties`);
    if (!Array.isArray(property.options) || property.options.length === 0 || property.options.some((entry) => typeof entry !== 'string' || !entry)) fail(`${label}.options must be a non-empty string array`);
    options = [...new Set(property.options)];
  }
  const required = optionalBoolean(property.required, `${label}.required`) ?? false;
  let defaultValue = property.default;
  if (defaultValue !== undefined) {
    validateJsonData(defaultValue, `${label}.default`);
    if (kind === 'text' && typeof defaultValue !== 'string') fail(`${label}.default must be string`);
    if (kind === 'number' && (typeof defaultValue !== 'number' || !Number.isFinite(defaultValue))) fail(`${label}.default must be a finite number`);
    if (kind === 'boolean' && typeof defaultValue !== 'boolean') fail(`${label}.default must be boolean`);
    if (kind === 'select' && (typeof defaultValue !== 'string' || (options && !options.includes(defaultValue)))) fail(`${label}.default must be one of the select options`);
  }
  return { key, label: displayLabel, kind, ...(options ? { options } : {}), ...(required ? { required: true } : {}), ...(defaultValue !== undefined ? { default: defaultValue } : {}) };
}

function normalizeBindingType(input, label) {
  const values = Array.isArray(input) ? input : [input];
  if (!values.length || values.some((entry) => typeof entry !== 'string' || !stateTypes.has(entry))) fail(`${label} must be a state type or non-empty state-type array`);
  const unique = [...new Set(values)];
  return Array.isArray(input) ? unique : unique[0];
}

function normalizeEvent(input, label) {
  const event = requireObject(input, label);
  rejectUnknown(event, ['prop', 'valueType', 'parameter'], label);
  const prop = requireString(event.prop, `${label}.prop`);
  if (!propPattern.test(prop) || reservedProps.has(prop)) fail(`${label}.prop must be a safe React prop identifier`);
  let valueType = null;
  if (event.valueType !== undefined && event.valueType !== null) {
    valueType = requireString(event.valueType, `${label}.valueType`);
    if (!stateTypes.has(valueType)) fail(`${label}.valueType must be string, number, boolean, or null`);
  }
  const parameter = event.parameter === undefined ? (valueType ? 'value' : undefined) : requireString(event.parameter, `${label}.parameter`);
  if (parameter && !propPattern.test(parameter)) fail(`${label}.parameter must be a JavaScript identifier`);
  if (!valueType && parameter) fail(`${label}.parameter requires valueType`);
  return { prop, valueType, ...(parameter ? { parameter } : {}) };
}

function normalizeDefinition(input, label, category, builtInIds) {
  const value = requireObject(input, label);
  rejectUnknown(value, ['id', 'package', 'version', 'exportName', 'description', 'acceptsChildren', 'properties', 'bindings', 'events'], label);
  const id = requireString(value.id, `${label}.id`);
  if (!customIdPattern.test(id)) fail(`${label}.id must be a namespaced id such as example.interactive-viewer`);
  if (builtInIds.has(id)) fail(`${label}.id conflicts with built-in component ${id}`);
  const packageName = requireString(value.package, `${label}.package`);
  if (!packageNamePattern.test(packageName)) fail(`${label}.package is not a valid package name`);
  const version = requireString(value.version, `${label}.version`);
  const exportName = requireString(value.exportName, `${label}.exportName`);
  if (!exportPattern.test(exportName)) fail(`${label}.exportName must be a JavaScript export identifier`);
  const description = requireString(value.description, `${label}.description`);
  const acceptsChildren = optionalBoolean(value.acceptsChildren, `${label}.acceptsChildren`) ?? false;

  const rawProperties = value.properties ?? [];
  if (!Array.isArray(rawProperties)) fail(`${label}.properties must be an array`);
  const properties = rawProperties.map((entry, index) => normalizeProperty(entry, `${label}.properties[${index}]`));
  const propertyKeys = new Set();
  for (const property of properties) {
    if (propertyKeys.has(property.key)) fail(`${label} has duplicate property ${property.key}`);
    propertyKeys.add(property.key);
  }

  const bindings = {};
  if (value.bindings !== undefined) {
    const raw = requireObject(value.bindings, `${label}.bindings`);
    for (const [key, type] of Object.entries(raw)) {
      if (!propertyKeys.has(key)) fail(`${label}.bindings.${key} must reference a declared property`);
      bindings[key] = normalizeBindingType(type, `${label}.bindings.${key}`);
    }
  }

  const events = {};
  if (value.events !== undefined) {
    const raw = requireObject(value.events, `${label}.events`);
    for (const [key, event] of Object.entries(raw)) {
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) fail(`${label}.events.${key} has invalid event id`);
      events[key] = normalizeEvent(event, `${label}.events.${key}`);
    }
  }

  const eventProps = new Set();
  for (const [eventName, event] of Object.entries(events)) {
    if (propertyKeys.has(event.prop)) fail(`${label}.events.${eventName}.prop conflicts with a declared property`);
    if (eventProps.has(event.prop)) fail(`${label} declares multiple events for React prop ${event.prop}`);
    eventProps.add(event.prop);
  }

  return {
    id,
    category,
    package: packageName,
    version,
    exportName,
    description,
    acceptsChildren,
    properties,
    bindings,
    events
  };
}

export function normalizeCustomRegistry(input, builtInCatalog = { widgets: [] }) {
  const registry = requireObject(input, 'foundation.registry.json');
  rejectUnknown(registry, ['schemaVersion', 'widgets', 'blocks'], 'foundation.registry.json');
  if (registry.schemaVersion !== 1) fail(`Unsupported foundation.registry.json schemaVersion: ${String(registry.schemaVersion)}`);
  const builtInIds = new Set((builtInCatalog.widgets ?? []).map((entry) => entry.id));
  const widgetsInput = registry.widgets ?? [];
  const blocksInput = registry.blocks ?? [];
  if (!Array.isArray(widgetsInput)) fail('foundation.registry.json.widgets must be an array');
  if (!Array.isArray(blocksInput)) fail('foundation.registry.json.blocks must be an array');
  if (widgetsInput.length + blocksInput.length > 200) fail('foundation.registry.json exceeds maximum component count 200');
  const definitions = [
    ...widgetsInput.map((entry, index) => normalizeDefinition(entry, `foundation.registry.json.widgets[${index}]`, 'widget', builtInIds)),
    ...blocksInput.map((entry, index) => normalizeDefinition(entry, `foundation.registry.json.blocks[${index}]`, 'block', builtInIds))
  ];
  const ids = new Set();
  const packages = {};
  for (const definition of definitions) {
    if (ids.has(definition.id)) fail(`Duplicate custom component id ${definition.id}`);
    ids.add(definition.id);
    if (packages[definition.package] && packages[definition.package] !== definition.version) fail(`Custom registry package ${definition.package} uses conflicting versions`);
    packages[definition.package] = definition.version;
  }
  return {
    schemaVersion: 1,
    widgets: definitions.filter((entry) => entry.category === 'widget'),
    blocks: definitions.filter((entry) => entry.category === 'block'),
    definitions,
    packages
  };
}

export function loadCustomRegistry(root, builtInCatalog) {
  const file = join(root, customRegistryFileName);
  if (!existsSync(file)) return { file, exists: false, registry: normalizeCustomRegistry({ schemaVersion: 1, widgets: [], blocks: [] }, builtInCatalog), text: undefined };
  const text = readFileSync(file, 'utf8');
  let input;
  try { input = JSON.parse(text); }
  catch (error) { fail(`Invalid ${customRegistryFileName}: ${error instanceof Error ? error.message : String(error)}`); }
  return { file, exists: true, registry: normalizeCustomRegistry(input, builtInCatalog), text };
}
