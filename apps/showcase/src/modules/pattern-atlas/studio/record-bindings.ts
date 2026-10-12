/** Narrow, serializable Studio record form bindings (never part of the Foundation Blueprint DSL). */
import type { CompositionNode } from '../bridge';
import type { StudioFieldMapping } from './source-query';

export interface StudioRecordListBinding {
  url: string;
  itemsPath: string;
  idField: string;
  labelField: string;
  /** Local pagination of at most 500 fetched rows. Not server-side paging. */
  pageSize?: number;
  /** Points to a project-wide StudioDataSource. Direct endpoints remain valid for older projects. */
  sourceId?: string;
  detailUrl?: string;
  detailPath?: string;
  paginationMode?: 'client' | 'server';
  pageParam?: string; sizeParam?: string; searchParam?: string; totalPath?: string;
  fieldMappings?: StudioFieldMapping[];
  filterField?: string; filterParam?: string; filterValues?: string[];
  sortField?: string; sortParam?: string; sortDirectionParam?: string;
  createUrl?: string; deleteUrl?: string;
}
export interface StudioRecordFieldBinding { field: string; required?: boolean; minLength?: number; maxLength?: number; format?: 'email' | 'number'; }
export interface StudioRecordSubmitBinding { url: string; includeId: boolean; sourceId?: string; fieldMappings?: StudioFieldMapping[]; }
export interface StudioRecord { [key: string]: unknown }

const safeName = /^[A-Za-z_$][\w$]*$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function validRecordField(field: string): boolean {
  return field.length > 0 && field.length <= 64 && safeName.test(field) && !forbidden.has(field);
}
export function validRecordUrl(url: string): boolean {
  if (!url || url.length > 500 || (/[\s\\]/.test(url) || Array.from(url).some((char) => char.charCodeAt(0) < 32)) || url.startsWith('//')) return false;
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}
export function validRecordPath(path: string): boolean {
  return path.length <= 160 && (!path || path.split('.').every((part) => validRecordField(part) || /^\d+$/.test(part)));
}
function obj(input: unknown): input is Record<string, unknown> { return Boolean(input && typeof input === 'object' && !Array.isArray(input)); }
export function normalizeRecordList(input: unknown): StudioRecordListBinding | undefined {
  if (!obj(input)) return undefined;
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  const itemsPath = typeof input.itemsPath === 'string' ? input.itemsPath.trim() : '';
  const idField = typeof input.idField === 'string' ? input.idField.trim() : '';
  const labelField = typeof input.labelField === 'string' ? input.labelField.trim() : '';
  if ((url && !validRecordUrl(url)) || !validRecordPath(itemsPath) || !validRecordField(idField) || !validRecordField(labelField)) return undefined;
  const pageSize = typeof input.pageSize === 'number' && Number.isInteger(input.pageSize) && input.pageSize >= 1 && input.pageSize <= 50 ? input.pageSize : undefined;
  const sourceId = typeof input.sourceId === 'string' && /^[a-z][a-z0-9-]{0,35}$/.test(input.sourceId) ? input.sourceId : undefined;
  // Detail endpoints are only accepted through validated shared sources.
  return { url, itemsPath, idField, labelField, ...(pageSize ? { pageSize } : {}), ...(sourceId ? { sourceId } : {}) };
}
export function normalizeRecordField(input: unknown): StudioRecordFieldBinding | undefined {
  if (!obj(input) || typeof input.field !== 'string' || !validRecordField(input.field)) return undefined;
  const minLength = typeof input.minLength === 'number' && Number.isInteger(input.minLength) && input.minLength >= 0 && input.minLength <= 200 ? input.minLength : undefined;
  const maxLength = typeof input.maxLength === 'number' && Number.isInteger(input.maxLength) && input.maxLength >= 1 && input.maxLength <= 500 ? input.maxLength : undefined;
  const format = input.format === 'email' || input.format === 'number' ? input.format : undefined;
  return { field: input.field, ...(input.required === true ? { required: true } : {}), ...(minLength !== undefined ? { minLength } : {}), ...(maxLength !== undefined ? { maxLength } : {}), ...(format ? { format } : {}) };
}
export function normalizeRecordSubmit(input: unknown): StudioRecordSubmitBinding | undefined {
  if (!obj(input) || typeof input.url !== 'string' || (input.url && !validRecordUrl(input.url))) return undefined;
  const sourceId = typeof input.sourceId === 'string' && /^[a-z][a-z0-9-]{0,35}$/.test(input.sourceId) ? input.sourceId : undefined;
  return { url: input.url, includeId: input.includeId !== false, ...(sourceId ? { sourceId } : {}) };
}
export function parseRecordRows(input: unknown, idField: string): StudioRecord[] {
  if (!Array.isArray(input)) throw new Error('列表接口返回值不是数组，请检查数组路径。');
  if (input.length > 500) throw new Error('此版本最多支持 500 条记录，请在接口中分页。');
  return input.filter((item): item is StudioRecord => obj(item) && (typeof item[idField] === 'string' || typeof item[idField] === 'number')).map((item) => ({ ...item }));
}
export function recordId(row: StudioRecord, idField: string): string { return String(row[idField] ?? ''); }
export function recordText(value: unknown): string { return value == null ? '' : typeof value === 'object' ? JSON.stringify(value).slice(0, 120) : String(value); }
export function draftFromRecord(row: StudioRecord, fields: readonly string[]): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of fields) if (validRecordField(field)) draft[field] = recordText(row[field]);
  return draft;
}
export function makeSavePayload(draft: Record<string, string>, selected: StudioRecord | null, idField: string, includeId: boolean): Record<string, string | number> {
  if (!selected) throw new Error('请先从记录列表中选择一条记录。');
  const body: Record<string, string | number> = {};
  for (const [field, value] of Object.entries(draft)) if (validRecordField(field) && field !== idField) body[field] = value;
  if (!Object.keys(body).length) throw new Error('请先为输入框或选择器设置表单字段。');
  if (includeId && (typeof selected[idField] === 'string' || typeof selected[idField] === 'number')) body[idField] = selected[idField];
  return body;
}
export function findRecordFields(root: CompositionNode | undefined, pageId: string, decorations: Record<string, { recordField?: StudioRecordFieldBinding | undefined }>): string[] {
  const result = new Set<string>();
  const scan = (node: CompositionNode, depth: number) => {
    if (depth > 24) return;
    if (['input', 'select'].includes(node.type)) {
      const field = (decorations[`${pageId}:${node.id}`] ?? decorations[node.id])?.recordField?.field;
      if (field && validRecordField(field)) result.add(field);
    }
    for (const child of node.children ?? []) scan(child, depth + 1);
  };
  if (root) scan(root, 0);
  return [...result];
}

/** Field validation shared conceptually with the exported page runtime. */
export function validateRecordDraft(draft: Record<string, string>, rules: Record<string, StudioRecordFieldBinding>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, rule] of Object.entries(rules)) {
    if (!validRecordField(field)) continue;
    const value = draft[field] ?? '';
    if (rule.required && !value.trim()) { errors[field] = '此字段为必填项'; continue; }
    if (!value) continue;
    if (rule.minLength !== undefined && value.length < rule.minLength) { errors[field] = `至少输入 ${rule.minLength} 个字符`; continue; }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) { errors[field] = `最多输入 ${rule.maxLength} 个字符`; continue; }
    if (rule.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field] = '请输入有效的邮箱地址';
    if (rule.format === 'number' && (!value.trim() || !Number.isFinite(Number(value)))) errors[field] = '请输入有效数字';
  }
  return errors;
}
export function findRecordRules(root: CompositionNode | undefined, pageId: string, decorations: Record<string, { recordField?: StudioRecordFieldBinding | undefined }>): Record<string, StudioRecordFieldBinding> {
  const result: Record<string, StudioRecordFieldBinding> = {};
  const scan = (node: CompositionNode, depth: number) => {
    if (depth > 24) return;
    if (node.type === 'input' || node.type === 'select') {
      const binding = (decorations[`${pageId}:${node.id}`] ?? decorations[node.id])?.recordField;
      if (binding && validRecordField(binding.field)) result[binding.field] = binding;
    }
    for (const child of node.children ?? []) scan(child, depth + 1);
  };
  if (root) scan(root, 0);
  return result;
}
