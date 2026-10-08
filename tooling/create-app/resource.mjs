import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { inspectContractState } from './contract.mjs';

const supportedFieldTypes = new Set(['string', 'number', 'boolean', 'enum']);
const managementCapabilities = ['application-shell', 'ui-patterns', 'data-table', 'forms', 'permission', 'error-model', 'api-transport'];

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function toSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isSafeRoutePath(value) {
  return /^[a-z0-9][a-z0-9/_-]*$/.test(value) && !value.includes('..') && !value.startsWith('/');
}

function validIdentifier(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function quote(value) {
  return JSON.stringify(value);
}

function pascal(value) {
  const parts = String(value).split(/[^A-Za-z0-9]+/).filter(Boolean);
  const result = parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('');
  return result || 'Resource';
}

function normalizeMethod(value, fallback) {
  const method = String(value ?? fallback).toUpperCase();
  if (!['GET', 'PUT', 'PATCH'].includes(method)) fail(`Unsupported HTTP method ${method}. Resource Blueprint v1 supports GET/PUT/PATCH.`);
  return method;
}

function normalizeApiPath(value, operationName) {
  if (typeof value !== 'string' || !value.trim()) fail(`Resource api.${operationName}.path is required`);
  const path = value.trim().replace(/^\/+/, '');
  if (!path || path.startsWith('../') || path.includes('/../') || path.includes('\\') || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path)) {
    fail(`Resource api.${operationName}.path must be a safe relative API path`);
  }
  const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  if (placeholders.some((name) => name !== 'id')) fail(`Resource api.${operationName}.path only supports the {id} placeholder`);
  if (operationName === 'list' && placeholders.length) fail('Resource api.list.path must not contain {id}');
  if (operationName !== 'list' && !placeholders.length) fail(`Resource api.${operationName}.path must include {id}`);
  return path;
}

function validateField(field, seenNames) {
  if (!field || typeof field !== 'object' || Array.isArray(field)) fail('Each resource field must be an object');
  if (typeof field.name !== 'string' || !validIdentifier(field.name)) fail(`Invalid field name: ${String(field.name)}`);
  if (seenNames.has(field.name)) fail(`Duplicate resource field ${field.name}`);
  seenNames.add(field.name);
  if (typeof field.label !== 'string' || !field.label.trim()) fail(`Field ${field.name} requires a label`);
  if (!supportedFieldTypes.has(field.type)) fail(`Field ${field.name} uses unsupported type ${String(field.type)}`);
  if (field.type === 'enum') {
    if (!Array.isArray(field.values) || field.values.length === 0 || field.values.some((value) => typeof value !== 'string' || !value.trim())) {
      fail(`Enum field ${field.name} requires a non-empty string values array`);
    }
    if (new Set(field.values).size !== field.values.length) fail(`Enum field ${field.name} has duplicate values`);
  } else if (field.values !== undefined) {
    fail(`Field ${field.name} can only declare values when type is enum`);
  }
  for (const flag of ['required', 'list', 'detail', 'editable', 'searchable', 'filterable']) {
    if (field[flag] !== undefined && typeof field[flag] !== 'boolean') fail(`Field ${field.name}.${flag} must be boolean`);
  }
  if (field.filterable && field.type !== 'enum' && field.type !== 'boolean') fail(`Filterable field ${field.name} must be enum or boolean in Resource Blueprint v1`);
}

export function normalizeResourceSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Resource spec must be a JSON object');
  if (input.schemaVersion !== 1) fail(`Unsupported resource schemaVersion: ${String(input.schemaVersion)}`);
  const id = toSlug(input.id);
  if (!id || id !== input.id) fail(`Resource id must already be a lowercase slug: ${String(input.id)}`);
  if (typeof input.title !== 'string' || !input.title.trim()) fail('Resource title must not be empty');
  const route = String(input.route ?? id).trim().replace(/^\/+|\/+$/g, '');
  if (!isSafeRoutePath(route)) fail(`Invalid resource route: ${route}`);
  const idField = String(input.idField ?? 'id');
  if (!validIdentifier(idField)) fail(`Invalid idField: ${idField}`);
  if (!Array.isArray(input.fields) || input.fields.length === 0) fail('Resource spec requires at least one field');
  const seenNames = new Set();
  for (const field of input.fields) validateField(field, seenNames);
  if (!seenNames.has(idField)) fail(`Resource idField ${idField} is not declared in fields`);
  const idFieldDefinition = input.fields.find((field) => field.name === idField);
  if (!idFieldDefinition || idFieldDefinition.type !== 'string') fail(`Resource idField ${idField} must be string in Resource Blueprint v1`);

  const api = input.api;
  if (!api || typeof api !== 'object' || Array.isArray(api)) fail('Resource spec requires api configuration');
  const normalizeOperation = (name, fallbackMethod) => {
    const operation = api[name];
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) fail(`Resource api.${name} is required`);
    const path = normalizeApiPath(operation.path, name);
    return { method: normalizeMethod(operation.method, fallbackMethod), path };
  };
  const normalizedApi = {
    list: normalizeOperation('list', 'GET'),
    detail: normalizeOperation('detail', 'GET'),
    update: normalizeOperation('update', 'PUT')
  };
  if (normalizedApi.list.method !== 'GET' || normalizedApi.detail.method !== 'GET') fail('Resource list/detail methods must be GET');
  if (!['PUT', 'PATCH'].includes(normalizedApi.update.method)) fail('Resource update method must be PUT or PATCH');

  const permissions = input.permissions ?? {};
  if (typeof permissions !== 'object' || Array.isArray(permissions)) fail('Resource permissions must be an object');
  const normalizedPermissions = {
    read: typeof permissions.read === 'string' && permissions.read.trim() ? permissions.read.trim() : `${id}.read`,
    update: typeof permissions.update === 'string' && permissions.update.trim() ? permissions.update.trim() : `${id}.update`
  };
  const contract = input.contract === undefined ? undefined : String(input.contract).trim();
  if (input.contract !== undefined && !contract) fail('Resource contract must not be empty');

  const searchable = input.fields.filter((field) => field.searchable);
  if (searchable.length > 1) fail('Resource Blueprint v1 supports at most one searchable field');
  const filterable = input.fields.filter((field) => field.filterable);
  if (filterable.length > 3) fail('Resource Blueprint v1 supports at most three filterable fields');
  if (!input.fields.some((field) => field.list !== false)) fail('Resource requires at least one list field');
  if (!input.fields.some((field) => field.editable)) fail('Resource requires at least one editable field');

  return {
    schemaVersion: 1,
    id,
    title: input.title.trim(),
    route,
    idField,
    contract,
    permissions: normalizedPermissions,
    api: normalizedApi,
    fields: input.fields.map((field) => ({
      name: field.name,
      label: field.label.trim(),
      type: field.type,
      ...(field.values ? { values: [...field.values] } : {}),
      required: Boolean(field.required),
      list: field.list !== false,
      detail: field.detail !== false,
      editable: Boolean(field.editable),
      searchable: Boolean(field.searchable),
      filterable: Boolean(field.filterable)
    }))
  };
}

function projectConfig(projectRoot) {
  const configFile = join(projectRoot, 'foundation.config.json');
  if (!existsSync(configFile)) fail('foundation.config.json not found. Resource generation requires Frontend Foundation 0.9+.');
  const config = readJson(configFile);
  if (config.schemaVersion !== 1) fail(`Unsupported foundation.config.json schemaVersion: ${String(config.schemaVersion)}`);
  if (!Array.isArray(config.profile?.capabilities)) fail('foundation.config.json profile.capabilities must be an array');
  if (config.modules?.directory !== 'src/modules' || config.modules?.routeFile !== 'routes.ts' || config.modules?.exportName !== 'module') {
    fail('Unsupported module convention in foundation.config.json');
  }
  return config;
}

function ensureCapabilities(config) {
  const missing = managementCapabilities.filter((capability) => !config.profile.capabilities.includes(capability));
  if (missing.length) fail(`Resource generation requires missing capabilities: ${missing.join(', ')}`);
  const requiredPackages = ['core', 'api', 'app', 'ui', 'data', 'forms', 'security'];
  const declared = new Set(config.profile.foundationPackages ?? []);
  const missingPackages = requiredPackages.filter((name) => !declared.has(name));
  if (missingPackages.length) fail(`Resource generation requires Foundation packages: ${missingPackages.join(', ')}`);
}

function ensureContract(projectRoot, config, contractName, options = {}) {
  if (!contractName) return [];
  const contracts = Array.isArray(config.contracts) ? config.contracts : [];
  if (!contracts.some((contract) => contract?.name === contractName)) fail(`Unknown project contract ${contractName}`);
  if (!options.deferReadiness) {
    const state = inspectContractState(projectRoot);
    const blocking = [...state.issues, ...state.warnings].filter((message) => message.includes(`Contract ${contractName}`));
    if (blocking.length) fail(`Contract dependency is not ready:\n${blocking.join('\n')}`);
  }
  return [contractName];
}

function fieldTsType(field) {
  if (field.type === 'number') return 'number';
  if (field.type === 'boolean') return 'boolean';
  if (field.type === 'enum') return field.values.map((value) => quote(value)).join(' | ');
  return 'string';
}

function renderTypes(spec) {
  const typeName = pascal(spec.id);
  const itemFields = spec.fields.map((field) => `  ${field.name}: ${fieldTsType(field)};`).join('\n');
  const editable = spec.fields.filter((field) => field.editable);
  const inputFields = editable.map((field) => `  ${field.name}: ${fieldTsType(field)};`).join('\n');
  const filters = spec.fields.filter((field) => field.filterable).map((field) => `  ${field.name}?: ${fieldTsType(field)};`).join('\n');
  return `export interface ${typeName}Item {\n${itemFields}\n}\n\nexport interface ${typeName}Page {\n  items: ${typeName}Item[];\n  total: number;\n  page: number;\n  pageSize: number;\n}\n\nexport interface ${typeName}Query {\n  page: number;\n  pageSize: number;\n  search?: string;${filters ? `\n${filters}` : ''}\n}\n\nexport interface Update${typeName}Input {\n${inputFields}\n}\n`;
}

function pathExpression(path) {
  const pieces = path.split('{id}');
  if (pieces.length === 1) return quote(path);
  return `\`${pieces.map((piece, index) => `${piece}${index < pieces.length - 1 ? '${encodeURIComponent(String(id))}' : ''}`).join('')}\``;
}

function renderApi(spec) {
  const typeName = pascal(spec.id);
  const filterLines = spec.fields.filter((field) => field.filterable).map((field) => `  if (query.${field.name} !== undefined) params.set(${quote(field.name)}, String(query.${field.name}));`).join('\n');
  return `import type { ApiTransport } from '@foundation/api';\nimport type { ${typeName}Item, ${typeName}Page, ${typeName}Query, Update${typeName}Input } from './types';\n\nfunction detailUrl(id: ${fieldTsType(spec.fields.find((field) => field.name === spec.idField))}): string {\n  return ${pathExpression(spec.api.detail.path)};\n}\n\nfunction updateUrl(id: ${fieldTsType(spec.fields.find((field) => field.name === spec.idField))}): string {\n  return ${pathExpression(spec.api.update.path)};\n}\n\nexport async function list${typeName}(transport: ApiTransport, query: ${typeName}Query): Promise<${typeName}Page> {\n  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });\n  if (query.search) params.set('search', query.search);${filterLines ? `\n${filterLines}` : ''}\n  const response = await transport.fetch(\`${spec.api.list.path}?\${params.toString()}\`, { method: ${quote(spec.api.list.method)} });\n  return response.json() as Promise<${typeName}Page>;\n}\n\nexport async function get${typeName}(transport: ApiTransport, id: ${fieldTsType(spec.fields.find((field) => field.name === spec.idField))}): Promise<${typeName}Item> {\n  const response = await transport.fetch(detailUrl(id), { method: ${quote(spec.api.detail.method)} });\n  return response.json() as Promise<${typeName}Item>;\n}\n\nexport async function update${typeName}(transport: ApiTransport, id: ${fieldTsType(spec.fields.find((field) => field.name === spec.idField))}, input: Update${typeName}Input): Promise<${typeName}Item> {\n  const response = await transport.fetch(updateUrl(id), {\n    method: ${quote(spec.api.update.method)},\n    headers: { 'content-type': 'application/json' },\n    body: JSON.stringify(input)\n  });\n  return response.json() as Promise<${typeName}Item>;\n}\n`;
}

function columnFor(field, typeName) {
  const base = `{ title: ${quote(field.label)}, dataIndex: ${quote(field.name)}`;
  if (field.type === 'boolean') return `${base}, render: (value: boolean) => <Tag>{value ? '是' : '否'}</Tag> }`;
  if (field.type === 'enum') return `${base}, render: (value: ${typeName}Item[${quote(field.name)}]) => <Tag>{String(value)}</Tag> }`;
  return `${base} }`;
}

function filterControl(field, typeName) {
  if (field.type === 'enum') {
    const options = field.values.map((value) => `{ value: ${quote(value)}, label: ${quote(value)} }`).join(', ');
    return `<Select allowClear placeholder=${quote(field.label)} style={{ width: 160 }} value={${field.name}} options={[${options}]} onChange={(value: ${typeName}Item[${quote(field.name)}] | undefined) => updateParams({ ${field.name}: value === undefined ? undefined : String(value), page: '1' })} />`;
  }
  return `<Select allowClear placeholder=${quote(field.label)} style={{ width: 140 }} value={${field.name} === undefined ? undefined : String(${field.name})} options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} onChange={(value: string | undefined) => updateParams({ ${field.name}: value, page: '1' })} />`;
}

function queryFilterParsing(field, typeName) {
  if (field.type === 'boolean') return `  const ${field.name}Param = searchParams.get(${quote(field.name)});\n  const ${field.name}: ${typeName}Item[${quote(field.name)}] | undefined = ${field.name}Param === 'true' ? true : ${field.name}Param === 'false' ? false : undefined;`;
  return `  const ${field.name} = (searchParams.get(${quote(field.name)}) || undefined) as ${typeName}Item[${quote(field.name)}] | undefined;`;
}

function renderList(spec) {
  const typeName = pascal(spec.id);
  const searchable = spec.fields.find((field) => field.searchable);
  const filters = spec.fields.filter((field) => field.filterable);
  const columns = spec.fields.filter((field) => field.list).map((field) => `    ${columnFor(field, typeName)}`).join(',\n');
  const parseFilters = filters.map((field) => queryFilterParsing(field, typeName)).join('\n');
  const filterQuery = filters.map((field) => `...( ${field.name} !== undefined ? { ${field.name} } : {} )`).join(', ');
  const filterControls = filters.map((field) => filterControl(field, typeName)).join('\n              ');
  const primaryProp = searchable ? `primary={<Input.Search allowClear value={draftSearch} placeholder=${quote(`搜索${searchable.label}`)} style={{ width: 280 }} onChange={(event) => setDraftSearch(event.target.value)} onSearch={(value) => updateParams({ search: value.trim() || undefined, page: '1' })} />}` : '';
  return `import { Button, Input, Select, Space, Tag, type TableColumnsType } from 'antd';\nimport { useQuery } from '@tanstack/react-query';\nimport { useMemo, useState } from 'react';\nimport { useNavigate, useSearchParams } from 'react-router';\nimport { useApiTransport } from '@foundation/api';\nimport { normalizeError } from '@foundation/core';\nimport { DataTable, DataToolbar } from '@foundation/data';\nimport { PermissionGate } from '@foundation/security';\nimport { Page, PageContent, PageHeader } from '@foundation/ui';\nimport { list${typeName} } from '../api';\nimport type { ${typeName}Item } from '../types';\n\nfunction positiveInt(value: string | null, fallback: number): number {\n  const parsed = Number(value);\n  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;\n}\n\nexport function Component() {\n  const transport = useApiTransport();\n  const navigate = useNavigate();\n  const [searchParams, setSearchParams] = useSearchParams();\n  const page = positiveInt(searchParams.get('page'), 1);\n  const pageSize = positiveInt(searchParams.get('pageSize'), 10);\n  const search = searchParams.get('search') ?? '';\n${parseFilters ? `${parseFilters}\n` : ''}  const [draftSearch, setDraftSearch] = useState(search);\n\n  const query = useQuery({\n    queryKey: [${quote(spec.id)}, { page, pageSize, search${filters.map((field) => `, ${field.name}`).join('')} }],\n    queryFn: () => list${typeName}(transport, { page, pageSize, ...(search ? { search } : {})${filterQuery ? `, ${filterQuery}` : ''} })\n  });\n\n  const columns = useMemo<TableColumnsType<${typeName}Item>>(() => [\n${columns}${columns ? ',\n' : ''}    {\n      title: '操作', key: 'action', width: 140,\n      render: (_value: unknown, item: ${typeName}Item) => (\n        <Space size="small">\n          <Button type="link" onClick={() => navigate(\`\${String(item.${spec.idField})}\`)}>详情</Button>\n          <PermissionGate permission=${quote(spec.permissions.update)}><Button type="link" onClick={() => navigate(\`\${String(item.${spec.idField})}/edit\`)}>编辑</Button></PermissionGate>\n        </Space>\n      )\n    }\n  ], [navigate]);\n\n  const updateParams = (values: Record<string, string | undefined>) => {\n    const next = new URLSearchParams(searchParams);\n    for (const [key, value] of Object.entries(values)) {\n      if (value) next.set(key, value); else next.delete(key);\n    }\n    setSearchParams(next);\n  };\n\n  return (\n    <Page>\n      <PageHeader title=${quote(spec.title)} description="Resource Blueprint：列表、详情、编辑骨架由显式资源描述生成。" />\n      <PageContent>\n        <DataToolbar\n          ${primaryProp}\n          actions={\n            <Space>\n              ${filterControls}\n              <Button onClick={() => void query.refetch()}>刷新</Button>\n            </Space>\n          }\n        />\n        <DataTable<${typeName}Item>\n          rowKey=${quote(spec.idField)}\n          columns={columns}\n          data={query.data?.items ?? []}\n          loading={query.isPending}\n          {...(query.isError ? { error: normalizeError(query.error), retry: () => void query.refetch() } : {})}\n          pagination={{\n            page: query.data?.page ?? page,\n            pageSize: query.data?.pageSize ?? pageSize,\n            total: query.data?.total ?? 0,\n            pageSizeOptions: [10, 20, 50],\n            onChange: (nextPage, nextPageSize) => updateParams({ page: String(nextPage), pageSize: String(nextPageSize) })\n          }}\n        />\n      </PageContent>\n    </Page>\n  );\n}\n`;
}

function renderDetail(spec) {
  const typeName = pascal(spec.id);
  const items = spec.fields.filter((field) => field.detail).map((field) => `            <Descriptions.Item label=${quote(field.label)}>{String(query.data.${field.name})}</Descriptions.Item>`).join('\n');
  return `import { Button, Descriptions, Space } from 'antd';\nimport { useQuery } from '@tanstack/react-query';\nimport { useNavigate, useParams } from 'react-router';\nimport { useApiTransport } from '@foundation/api';\nimport { AppError, normalizeError } from '@foundation/core';\nimport { PermissionGate } from '@foundation/security';\nimport { ErrorState, LoadingState, Page, PageContent, PageHeader } from '@foundation/ui';\nimport { get${typeName} } from '../api';\n\nexport function Component() {\n  const { id } = useParams();\n  const transport = useApiTransport();\n  const navigate = useNavigate();\n  const query = useQuery({\n    queryKey: [${quote(spec.id)}, 'detail', id],\n    queryFn: () => {\n      if (!id) throw new AppError({ kind: 'not-found', message: ${quote(`${spec.title} id is missing`)} });\n      return get${typeName}(transport, id);\n    },\n    enabled: Boolean(id)\n  });\n\n  if (query.isPending) return <Page><PageHeader title=${quote(spec.title)} /><PageContent><LoadingState /></PageContent></Page>;\n  if (query.isError) return <Page><PageHeader title=${quote(spec.title)} /><PageContent><ErrorState error={normalizeError(query.error)} retry={() => void query.refetch()} /></PageContent></Page>;\n\n  return (\n    <Page>\n      <PageHeader title={\`${spec.title} #\${String(query.data.${spec.idField})}\`} extra={<Space><PermissionGate permission=${quote(spec.permissions.update)}><Button onClick={() => navigate('edit')}>编辑</Button></PermissionGate><Button onClick={() => navigate('..')}>返回</Button></Space>} />\n      <PageContent>\n        <Descriptions bordered column={1}>\n${items}\n        </Descriptions>\n      </PageContent>\n    </Page>\n  );\n}\n`;
}

function zodExpression(field) {
  if (field.type === 'number') return 'z.number().finite()';
  if (field.type === 'boolean') return 'z.boolean()';
  if (field.type === 'enum') return `z.enum([${field.values.map((value) => quote(value)).join(', ')}])`;
  return field.required ? `z.string().trim().min(1, ${quote(`${field.label}不能为空`)})` : 'z.string()';
}

function defaultValue(field) {
  if (field.type === 'number') return '0';
  if (field.type === 'boolean') return 'false';
  if (field.type === 'enum') return quote(field.values[0]);
  return "''";
}

function editControl(field, typeName) {
  const disabled = `{...(field.disabled !== undefined ? { disabled: field.disabled } : {})}`;
  if (field.type === 'number') return `<InputNumber style={{ width: '100%' }} value={field.value} onChange={(value) => field.onChange(value ?? 0)} onBlur={field.onBlur} ${disabled} />`;
  if (field.type === 'boolean') return `<Switch checked={field.value} onChange={field.onChange} ${disabled} />`;
  if (field.type === 'enum') {
    const options = field.values.map((value) => `{ value: ${quote(value)}, label: ${quote(value)} }`).join(', ');
    return `<Select<${typeName}Item[${quote(field.name)}]> value={field.value} onChange={field.onChange} onBlur={field.onBlur} options={[${options}]} ${disabled} />`;
  }
  return `<Input value={field.value} onChange={field.onChange} onBlur={field.onBlur} ${disabled} />`;
}

function renderEdit(spec) {
  const typeName = pascal(spec.id);
  const editable = spec.fields.filter((field) => field.editable);
  const schemaLines = editable.map((field) => `  ${field.name}: ${zodExpression(field)}`).join(',\n');
  const defaults = editable.map((field) => `${field.name}: ${defaultValue(field)}`).join(', ');
  const reset = editable.map((field) => `${field.name}: item.${field.name}`).join(', ');
  const fields = editable.map((field) => `              <FormField\n                control={form.control}\n                name=${quote(field.name)}\n                label=${quote(field.label)}\n                ${field.required ? 'required\n                ' : ''}render={(field) => ${editControl(field, typeName)}}\n              />`).join('\n');
  return `import { Card, Input, InputNumber, Select, Switch } from 'antd';\nimport { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';\nimport { useEffect, useState } from 'react';\nimport { useForm, type FieldPath } from 'react-hook-form';\nimport { useNavigate, useParams } from 'react-router';\nimport { z } from 'zod';\nimport { useApiTransport } from '@foundation/api';\nimport { AppError, normalizeError } from '@foundation/core';\nimport { applyAppErrorToForm, FormActions, FormErrorSummary, FormField, FormLayout, FormSection } from '@foundation/forms';\nimport { ErrorState, LoadingState, Page, PageContent, PageHeader } from '@foundation/ui';\nimport { get${typeName}, update${typeName} } from '../api';\nimport type { ${typeName}Item } from '../types';\n\nconst formSchema = z.object({\n${schemaLines}\n});\n\ntype FormValues = z.infer<typeof formSchema>;\n\nexport function Component() {\n  const { id } = useParams();\n  const transport = useApiTransport();\n  const navigate = useNavigate();\n  const queryClient = useQueryClient();\n  const [submitError, setSubmitError] = useState<AppError | null>(null);\n  const form = useForm<FormValues>({ defaultValues: { ${defaults} } });\n\n  const query = useQuery({\n    queryKey: [${quote(spec.id)}, 'detail', id],\n    queryFn: () => {\n      if (!id) throw new AppError({ kind: 'not-found', message: ${quote(`${spec.title} id is missing`)} });\n      return get${typeName}(transport, id);\n    },\n    enabled: Boolean(id)\n  });\n\n  useEffect(() => {\n    if (query.data) {\n      const item = query.data;\n      form.reset({ ${reset} });\n    }\n  }, [form, query.data]);\n\n  const mutation = useMutation({\n    mutationFn: async (values: FormValues) => {\n      if (!id) throw new AppError({ kind: 'not-found', message: ${quote(`${spec.title} id is missing`)} });\n      return update${typeName}(transport, id, values);\n    }\n  });\n\n  const submit = form.handleSubmit(async (values) => {\n    setSubmitError(null);\n    form.clearErrors();\n    const parsed = formSchema.safeParse(values);\n    if (!parsed.success) {\n      for (const issue of parsed.error.issues) {\n        const name = issue.path[0];\n        if (typeof name === 'string') form.setError(name as FieldPath<FormValues>, { type: 'validation', message: issue.message });\n      }\n      return;\n    }\n    try {\n      await mutation.mutateAsync(parsed.data);\n      await queryClient.invalidateQueries({ queryKey: [${quote(spec.id)}] });\n      navigate('..');\n    } catch (error) {\n      const appError = normalizeError(error);\n      const applied = applyAppErrorToForm<FormValues>(appError, form.setError);\n      if (!applied) setSubmitError(appError);\n    }\n  });\n\n  if (query.isPending) return <Page><PageHeader title=${quote(`编辑 ${spec.title}`)} /><PageContent><LoadingState /></PageContent></Page>;\n  if (query.isError) return <Page><PageHeader title=${quote(`编辑 ${spec.title}`)} /><PageContent><ErrorState error={normalizeError(query.error)} retry={() => void query.refetch()} /></PageContent></Page>;\n\n  return (\n    <Page>\n      <PageHeader title={\`${`编辑 ${spec.title}`} #\${String(query.data.${spec.idField})}\`} />\n      <PageContent>\n        <Card style={{ maxWidth: 760 }}>\n          <FormLayout onSubmit={submit}>\n            <FormErrorSummary errors={form.formState.errors} error={submitError} />\n            <FormSection title="基本信息">\n${fields}\n            </FormSection>\n            <FormActions submitting={mutation.isPending} disabled={!form.formState.isDirty} onCancel={() => navigate('..')} />\n          </FormLayout>\n        </Card>\n      </PageContent>\n    </Page>\n  );\n}\n`;
}

function renderRoutes(spec, options = {}) {
  const navigationLabel = options.navigationLabel ?? spec.title;
  const navigationOrder = options.navigationOrder ?? 100;
  return `import { defineModule } from '@foundation/app';\n\nexport const module = defineModule({\n  id: ${quote(spec.id)},\n  routes: [\n    {\n      id: ${quote(`${spec.id}.root`)},\n      path: ${quote(spec.route)},\n      handle: {\n        foundation: {\n          title: ${quote(spec.title)},\n          navigation: { label: ${quote(navigationLabel)}, order: ${navigationOrder} },\n          permission: ${quote(spec.permissions.read)}\n        }\n      },\n      children: [\n        { id: ${quote(`${spec.id}.list`)}, index: true, lazy: async () => import('./pages/list.route'), handle: { foundation: { breadcrumb: false } } },\n        { id: ${quote(`${spec.id}.detail`)}, path: ':id', lazy: async () => import('./pages/detail.route'), handle: { foundation: { title: '详情' } } },\n        { id: ${quote(`${spec.id}.edit`)}, path: ':id/edit', lazy: async () => import('./pages/edit.route'), handle: { foundation: { title: '编辑', permission: ${quote(spec.permissions.update)} } } }\n      ]\n    }\n  ]\n});\n`;
}

function existingRoutePath(modulesDir, routePath) {
  if (!existsSync(modulesDir)) return undefined;
  for (const moduleName of readdirSync(modulesDir)) {
    const manifest = join(modulesDir, moduleName, 'foundation.module.json');
    if (!existsSync(manifest)) continue;
    const value = readJson(manifest);
    if (value.route?.path === routePath) return relative(modulesDir, manifest);
  }
  return undefined;
}

export function generateResource(projectDir, specFile, options = {}) {
  const projectRoot = resolve(projectDir ?? '.');
  const config = projectConfig(projectRoot);
  ensureCapabilities(config);
  const absoluteSpecFile = resolve(specFile);
  if (!existsSync(absoluteSpecFile)) fail(`Resource spec not found: ${absoluteSpecFile}`);
  const spec = normalizeResourceSpec(readJson(absoluteSpecFile));
  const contractNames = ensureContract(projectRoot, config, spec.contract, { deferReadiness: Boolean(options.deferContractReadiness) });
  const modulesDir = join(projectRoot, config.modules.directory);
  const moduleDir = join(modulesDir, spec.id);
  const conflict = existingRoutePath(modulesDir, spec.route);
  if (conflict && !options.force) fail(`Route path ${spec.route} is already declared by ${conflict}`);
  if (existsSync(moduleDir) && readdirSync(moduleDir).length && !options.force) fail(`Module directory already exists: ${relative(projectRoot, moduleDir)}. Use --force to overwrite generated files.`);

  mkdirSync(join(moduleDir, 'pages'), { recursive: true });
  const normalizedText = `${JSON.stringify(spec, null, 2)}\n`;
  const specHash = sha256(normalizedText);
  const manifest = {
    schemaVersion: 1,
    id: spec.id,
    pattern: 'management',
    route: { path: spec.route },
    requiredCapabilities: managementCapabilities,
    contracts: contractNames,
    resource: { schemaVersion: 1, generatorVersion: 1, spec: 'foundation.resource.json', sha256: specHash }
  };
  const files = new Map([
    ['foundation.resource.json', normalizedText],
    ['foundation.module.json', `${JSON.stringify(manifest, null, 2)}\n`],
    ['index.ts', "export { module } from './routes';\n"],
    ['routes.ts', renderRoutes(spec, { navigationLabel: options.navigationLabel, navigationOrder: options.navigationOrder })],
    ['types.ts', renderTypes(spec)],
    ['api.ts', renderApi(spec)],
    ['pages/list.route.tsx', renderList(spec)],
    ['pages/detail.route.tsx', renderDetail(spec)],
    ['pages/edit.route.tsx', renderEdit(spec)]
  ]);
  const generated = [];
  for (const [path, content] of files) {
    const destination = join(moduleDir, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content, 'utf8');
    generated.push(relative(projectRoot, destination));
  }
  return { projectRoot, module: spec.id, title: spec.title, routePath: spec.route, contracts: contractNames, resourceSpec: basename(absoluteSpecFile), generated };
}
