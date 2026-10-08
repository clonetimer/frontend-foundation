const idPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const stateIdPattern = /^[a-z][A-Za-z0-9]*$/;
const stateTypes = new Set(['string', 'number', 'boolean']);
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const responses = new Set(['json', 'text', 'none']);
const maxSources = 50;
const maxOperations = 100;
const maxResultAssignments = 50;
const maxValueDepth = 12;

function fail(message) { throw new Error(message); }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requireObject(value, label) { if (!plainObject(value)) fail(`${label} must be an object`); return value; }
function requireString(value, label) { if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`); return value.trim(); }
function rejectUnknown(object, allowed, label) { for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`${label}.${key} is not supported`); }

function normalizeOperationValue(value, stateById, label, depth = 0) {
  if (depth > maxValueDepth) fail(`${label} is nested too deeply`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${label} must contain finite numbers only`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => normalizeOperationValue(entry, stateById, `${label}[${index}]`, depth + 1));
  const object = requireObject(value, label);
  if (Object.prototype.hasOwnProperty.call(object, '$state')) {
    rejectUnknown(object, ['$state'], label);
    const state = requireString(object.$state, `${label}.$state`);
    if (!stateIdPattern.test(state)) fail(`${label}.$state must match ${stateIdPattern}`);
    if (!stateById.has(state)) fail(`${label}.$state references unknown page state ${state}`);
    return { $state: state };
  }
  const output = {};
  for (const [key, child] of Object.entries(object)) {
    if (!key) fail(`${label} contains an empty object key`);
    output[key] = normalizeOperationValue(child, stateById, `${label}.${key}`, depth + 1);
  }
  return output;
}

export function normalizeDataOperationModel(input = {}, state = [], label = 'page') {
  const page = input === undefined ? {} : requireObject(input, label);
  rejectUnknown(page, ['dataSources', 'operations'], label);
  const stateById = new Map(state.map((entry) => [entry.id, entry]));

  const rawSources = page.dataSources ?? [];
  if (!Array.isArray(rawSources)) fail(`${label}.dataSources must be an array`);
  if (rawSources.length > maxSources) fail(`${label}.dataSources exceeds maximum source count ${maxSources}`);
  const sourceIds = new Set();
  const dataSources = rawSources.map((entry, index) => {
    const itemLabel = `${label}.dataSources[${index}]`;
    const item = requireObject(entry, itemLabel);
    rejectUnknown(item, ['id', 'type', 'method', 'path', 'response'], itemLabel);
    const id = requireString(item.id, `${itemLabel}.id`);
    if (!idPattern.test(id)) fail(`${itemLabel}.id must match ${idPattern}`);
    if (sourceIds.has(id)) fail(`Duplicate page data source id ${id}`);
    sourceIds.add(id);
    const type = item.type ?? 'http';
    if (type !== 'http') fail(`${itemLabel}.type must be "http"`);
    const method = requireString(item.method ?? 'GET', `${itemLabel}.method`).toUpperCase();
    if (!methods.has(method)) fail(`${itemLabel}.method must be one of: ${[...methods].join(', ')}`);
    const path = requireString(item.path, `${itemLabel}.path`);
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) || path.includes('\\')) fail(`${itemLabel}.path must be an API-relative path, not an absolute URL`);
    if (/[?#{}]/.test(path)) fail(`${itemLabel}.path must not contain query, fragment, or template syntax; use Operation query and static v1 paths`);
    const response = requireString(item.response ?? 'json', `${itemLabel}.response`);
    if (!responses.has(response)) fail(`${itemLabel}.response must be one of: ${[...responses].join(', ')}`);
    return { id, type: 'http', method, path, response };
  });
  const sourceById = new Map(dataSources.map((entry) => [entry.id, entry]));

  const rawOperations = page.operations ?? [];
  if (!Array.isArray(rawOperations)) fail(`${label}.operations must be an array`);
  if (rawOperations.length > maxOperations) fail(`${label}.operations exceeds maximum operation count ${maxOperations}`);
  const operationIds = new Set();
  const operations = rawOperations.map((entry, index) => {
    const itemLabel = `${label}.operations[${index}]`;
    const item = requireObject(entry, itemLabel);
    rejectUnknown(item, ['id', 'source', 'query', 'body', 'lifecycle', 'result'], itemLabel);
    const id = requireString(item.id, `${itemLabel}.id`);
    if (!idPattern.test(id)) fail(`${itemLabel}.id must match ${idPattern}`);
    if (operationIds.has(id)) fail(`Duplicate page operation id ${id}`);
    operationIds.add(id);
    const source = requireString(item.source, `${itemLabel}.source`);
    const sourceDefinition = sourceById.get(source);
    if (!sourceDefinition) fail(`${itemLabel}.source references unknown page data source ${source}`);

    const query = item.query === undefined ? undefined : normalizeOperationValue(item.query, stateById, `${itemLabel}.query`);
    if (query !== undefined) {
      if (!plainObject(query)) fail(`${itemLabel}.query must be an object`);
      for (const [key, value] of Object.entries(query)) {
        const isStateRef = plainObject(value) && value.$state !== undefined;
        const isScalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
        if (!isStateRef && !isScalar) fail(`${itemLabel}.query.${key} must be a scalar literal or $state reference`);
      }
    }
    const body = item.body === undefined ? undefined : normalizeOperationValue(item.body, stateById, `${itemLabel}.body`);
    if (body !== undefined && ['GET'].includes(sourceDefinition.method)) fail(`${itemLabel}.body is not supported for ${sourceDefinition.method}`);

    let lifecycle;
    if (item.lifecycle !== undefined) {
      const value = requireObject(item.lifecycle, `${itemLabel}.lifecycle`);
      rejectUnknown(value, ['pendingState', 'errorState'], `${itemLabel}.lifecycle`);
      lifecycle = {};
      if (value.pendingState !== undefined) {
        const pendingState = requireString(value.pendingState, `${itemLabel}.lifecycle.pendingState`);
        const target = stateById.get(pendingState);
        if (!target) fail(`${itemLabel}.lifecycle.pendingState references unknown page state ${pendingState}`);
        if (target.type !== 'boolean') fail(`${itemLabel}.lifecycle.pendingState must reference boolean state; ${pendingState} is ${target.type}`);
        lifecycle.pendingState = pendingState;
      }
      if (value.errorState !== undefined) {
        const errorState = requireString(value.errorState, `${itemLabel}.lifecycle.errorState`);
        const target = stateById.get(errorState);
        if (!target) fail(`${itemLabel}.lifecycle.errorState references unknown page state ${errorState}`);
        if (target.type !== 'string') fail(`${itemLabel}.lifecycle.errorState must reference string state; ${errorState} is ${target.type}`);
        lifecycle.errorState = errorState;
      }
    }

    const rawResult = item.result ?? [];
    if (!Array.isArray(rawResult)) fail(`${itemLabel}.result must be an array`);
    if (rawResult.length > maxResultAssignments) fail(`${itemLabel}.result exceeds maximum assignment count ${maxResultAssignments}`);
    if (sourceDefinition.response === 'none' && rawResult.length) fail(`${itemLabel}.result cannot be used with response "none"`);
    const result = rawResult.map((assignment, resultIndex) => {
      const resultLabel = `${itemLabel}.result[${resultIndex}]`;
      const value = requireObject(assignment, resultLabel);
      rejectUnknown(value, ['state', 'path'], resultLabel);
      const targetState = requireString(value.state, `${resultLabel}.state`);
      const target = stateById.get(targetState);
      if (!target) fail(`${resultLabel}.state references unknown page state ${targetState}`);
      if (!stateTypes.has(target.type)) fail(`${resultLabel}.state has unsupported type ${target.type}`);
      if (sourceDefinition.response === 'text') {
        if (value.path !== undefined) fail(`${resultLabel}.path is not supported for text responses`);
        if (target.type !== 'string') fail(`${resultLabel}.state must be string for text responses; ${targetState} is ${target.type}`);
        return { state: targetState };
      }
      const path = requireString(value.path, `${resultLabel}.path`);
      if (!/^[$A-Za-z_][A-Za-z0-9_$]*(?:\.[$A-Za-z_][A-Za-z0-9_$]*)*$/.test(path)) fail(`${resultLabel}.path must be a dot-separated JSON property path`);
      return { state: targetState, path };
    });

    return {
      id,
      source,
      ...(query === undefined ? {} : { query }),
      ...(body === undefined ? {} : { body }),
      ...(lifecycle && Object.keys(lifecycle).length ? { lifecycle } : {}),
      ...(result.length ? { result } : {})
    };
  });

  return { dataSources, operations, operationIds };
}

function setterName(id) { return `set${id[0].toUpperCase()}${id.slice(1)}`; }
export function operationFunctionName(id) { return `run${id[0].toUpperCase()}${id.slice(1)}`.replace(/[-_]([A-Za-z0-9])/g, (_, c) => c.toUpperCase()); }

export function operationValueExpression(value) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(operationValueExpression).join(', ')}]`;
  if (plainObject(value) && value.$state !== undefined) return value.$state;
  if (plainObject(value)) return `{ ${Object.entries(value).map(([key, child]) => `${JSON.stringify(key)}: ${operationValueExpression(child)}`).join(', ')} }`;
  fail('Internal error: unsupported operation value');
}

function jsonResultStatements(operation, source, stateById) {
  const assignments = operation.result ?? [];
  if (source.response === 'none') return [];
  if (source.response === 'text') {
    const lines = assignments.length ? ['    const payload = await response.text();'] : ['    await response.text();'];
    for (const assignment of assignments) lines.push(`    ${setterName(assignment.state)}(payload);`);
    return lines;
  }
  if (!assignments.length) return ['    await response.json();'];
  const lines = ['    const payload: unknown = await response.json();'];
  for (const [index, assignment] of assignments.entries()) {
    const state = stateById.get(assignment.state);
    const local = `result${index}`;
    lines.push(`    const ${local} = readOperationPath(payload, ${JSON.stringify(assignment.path)});`);
    lines.push(`    if (typeof ${local} !== ${JSON.stringify(state.type)}) throw new Error(${JSON.stringify(`Operation ${operation.id} response field ${assignment.path} must be ${state.type}`)});`);
    lines.push(`    ${setterName(assignment.state)}(${local});`);
  }
  return lines;
}

export function renderDataOperationSupport(model, state) {
  const stateById = new Map(state.map((entry) => [entry.id, entry]));
  const sourceById = new Map(model.dataSources.map((entry) => [entry.id, entry]));
  const needsApi = model.operations.length > 0;
  const needsJsonPath = model.operations.some((operation) => {
    const source = sourceById.get(operation.source);
    return source.response === 'json' && (operation.result?.length ?? 0) > 0;
  });
  const helperLines = needsJsonPath ? [
    'function readOperationPath(value: unknown, path: string): unknown {',
    '  let current: unknown = value;',
    '  for (const segment of path.split(".")) {',
    '    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;',
    '    current = (current as Record<string, unknown>)[segment];',
    '  }',
    '  return current;',
    '}',
    ''
  ] : [];
  const functionLines = [];
  for (const operation of model.operations) {
    const source = sourceById.get(operation.source);
    const fn = operationFunctionName(operation.id);
    const pendingSetter = operation.lifecycle?.pendingState ? setterName(operation.lifecycle.pendingState) : undefined;
    const errorSetter = operation.lifecycle?.errorState ? setterName(operation.lifecycle.errorState) : undefined;
    functionLines.push(`  const ${fn} = async (): Promise<boolean> => {`);
    if (pendingSetter) functionLines.push(`    ${pendingSetter}(true);`);
    if (errorSetter) functionLines.push(`    ${errorSetter}("");`);
    functionLines.push('    try {');
    if (operation.query && Object.keys(operation.query).length) {
      functionLines.push('      const query = new URLSearchParams();');
      for (const [key, value] of Object.entries(operation.query)) functionLines.push(`      query.set(${JSON.stringify(key)}, String(${operationValueExpression(value)}));`);
      functionLines.push(`      const requestPath = ${JSON.stringify(source.path)} + \`?${'${query.toString()}'}\`;`);
    } else {
      functionLines.push(`      const requestPath = ${JSON.stringify(source.path)};`);
    }
    const initParts = [`method: ${JSON.stringify(source.method)}`];
    if (operation.body !== undefined) {
      initParts.push(`headers: { 'content-type': 'application/json' }`);
      initParts.push(`body: JSON.stringify(${operationValueExpression(operation.body)})`);
    }
    functionLines.push(`      const response = await transport.fetch(requestPath, { ${initParts.join(', ')} });`);
    const resultLines = jsonResultStatements(operation, source, stateById).map((line) => line.replace(/^ {4}/, '      '));
    functionLines.push(...resultLines);
    functionLines.push('      return true;');
    functionLines.push('    } catch (error) {');
    if (errorSetter) functionLines.push(`      ${errorSetter}(error instanceof Error ? error.message : String(error));`);
    functionLines.push('      return false;');
    functionLines.push('    } finally {');
    if (pendingSetter) functionLines.push(`      ${pendingSetter}(false);`);
    functionLines.push('    }');
    functionLines.push('  };', '');
  }
  return { needsApi, helperLines, functionLines };
}
