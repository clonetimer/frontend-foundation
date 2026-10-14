/** Studio browser API bindings. This module deliberately has no proxy, credentials or secret store. */
export type StudioApiMethod = 'GET' | 'POST' | 'DELETE';
export class StudioRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly fieldErrors: Record<string, string> = {}) { super(message); this.name = 'StudioRequestError'; }
}
function readServerError(payload: unknown): { message: string; fields: Record<string, string> } {
  const fallback = { message: '', fields: {} as Record<string, string> };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const raw = payload as Record<string, unknown>;
  const message = [raw.error, raw.detail, raw.message, raw.title].find((item): item is string => typeof item === 'string' && item.length > 0)?.slice(0, 240) ?? '';
  const fields: Record<string, string> = {};
  if (raw.errors && typeof raw.errors === 'object' && !Array.isArray(raw.errors)) {
    for (const [field, value] of Object.entries(raw.errors).slice(0, 30)) {
      if (!/^[A-Za-z_$][\w$]{0,63}$/.test(field) || ['__proto__','constructor','prototype'].includes(field)) continue;
      const text = Array.isArray(value) ? value[0] : value;
      if (typeof text === 'string') fields[field] = text.slice(0, 240);
    }
  }
  return { message, fields };
}
export interface StudioApiBinding {
  method: StudioApiMethod;
  url: string;
  responsePath?: string;
  body?: string;
}
const PATH_PART = /^(?:[A-Za-z_$][\w$]*|\d+)$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function normalizeApiBinding(raw: unknown, method?: StudioApiMethod): StudioApiBinding | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, unknown>;
  const resolved = data.method === 'POST' ? 'POST' : data.method === 'GET' ? 'GET' : undefined;
  if (!resolved || (method && resolved !== method)) return undefined;
  const url = typeof data.url === 'string' ? data.url.trim().slice(0, 500) : '';
  const responsePath = typeof data.responsePath === 'string' ? data.responsePath.trim().slice(0, 160) : '';
  const body = typeof data.body === 'string' ? data.body.slice(0, 2000) : '';
  if (url && !validApiUrl(url)) return undefined;
  if (responsePath && !validResponsePath(responsePath)) return undefined;
  if (resolved === 'POST' && body) {
    try { JSON.parse(body); } catch { return undefined; }
  }
  return { method: resolved, url, ...(responsePath ? { responsePath } : {}), ...(resolved === 'POST' && body ? { body } : {}) };
}

export function validApiUrl(url: string): boolean {
  if (!url || url.length > 500 || Array.from(url).some((char) => char.charCodeAt(0) <= 32 || char === '\\') || url.startsWith('//')) return false;
  if (url.startsWith('/')) return !url.startsWith('//');
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
  } catch { return false; }
}
export function validResponsePath(path: string): boolean {
  return path.length <= 160 && (path === '' || path.split('.').every((part) => PATH_PART.test(part) && !DANGEROUS_KEYS.has(part)));
}
export function readResponsePath(input: unknown, path = ''): unknown {
  if (!path) return input;
  if (!validResponsePath(path)) throw new Error('响应字段路径无效。请使用如 data.total 的格式。');
  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, input);
}
export function displayApiValue(value: unknown): string {
  if (value === null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === undefined) return '—';
  return JSON.stringify(value).slice(0, 240);
}
export async function requestStudioApi(config: StudioApiBinding, signal?: AbortSignal): Promise<unknown> {
  if (!validApiUrl(config.url)) throw new Error('请输入有效的 /api/... 或 https://... 接口地址。');
  if (config.responsePath && !validResponsePath(config.responsePath)) throw new Error('响应字段路径格式无效。');
  let body: string | undefined;
  if (config.method === 'POST' && config.body?.trim()) {
    try { body = JSON.stringify(JSON.parse(config.body)); }
    catch { throw new Error('POST 请求体必须是有效 JSON。'); }
  }
  const response = await fetch(config.url, {
    method: config.method,
    credentials: 'same-origin',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    ...(signal ? { signal } : {})
  });
  if (!response.ok) {
    let payload: unknown = null;
    try {
      // An API error body is untrusted. Never parse or retain unbounded
      // validation details merely to display a short message in Studio.
      const raw = await response.text();
      if (raw.length <= 16384) payload = JSON.parse(raw) as unknown;
    } catch { /* malformed responses use the status-only fallback */ }
    const parsed = readServerError(payload);
    throw new StudioRequestError(parsed.message ? `请求失败（HTTP ${response.status}）：${parsed.message}` : `请求失败：HTTP ${response.status}`, response.status, parsed.fields);
  }
  const contentType = response.headers.get('content-type') ?? '';
  const data: unknown = contentType.includes('json') ? await response.json() as unknown : await response.text();
  return readResponsePath(data, config.responsePath);
}
