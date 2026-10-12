import { normalizePatternIds } from './catalog';

const STORAGE_PREFIX = 'foundation-showcase:pattern-atlas:v1:';

export type StoredPatternKind = 'favorites' | 'selected';

export function readStoredPatternIds(kind: StoredPatternKind): string[] {
  if (typeof window === 'undefined') return [];
  try { return normalizePatternIds(JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + kind) ?? '[]') as unknown); }
  catch { return []; } // Storage may be unavailable in privacy/embedded contexts.
}

export function saveStoredPatternIds(kind: StoredPatternKind, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_PREFIX + kind, JSON.stringify(normalizePatternIds(ids))); }
  catch { /* The in-memory UI remains usable even when storage is blocked. */ }
}

export type StoredVisualStyle = '简洁专业' | '活泼现代' | '深色科技' | '内容优先';
export interface StoredPlanDraft {
  projectName: string;
  style: StoredVisualStyle;
  stack: string;
  notes: string;
}
const knownStyles = new Set<StoredVisualStyle>(['简洁专业', '活泼现代', '深色科技', '内容优先']);

/** Validate user-editable fields before using browser storage from older versions. */
export function normalizePlanDraft(input: unknown): Partial<StoredPlanDraft> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: Partial<StoredPlanDraft> = {};
  if (typeof source.projectName === 'string') result.projectName = source.projectName.slice(0, 80);
  if (typeof source.style === 'string' && knownStyles.has(source.style as StoredVisualStyle)) result.style = source.style as StoredVisualStyle;
  if (typeof source.stack === 'string') result.stack = source.stack.slice(0, 120);
  if (typeof source.notes === 'string') result.notes = source.notes.slice(0, 5000);
  return result;
}

export function readStoredPlanDraft(): Partial<StoredPlanDraft> {
  if (typeof window === 'undefined') return {};
  try { return normalizePlanDraft(JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + 'plan-draft') ?? '{}') as unknown); }
  catch { return {}; }
}

export function saveStoredPlanDraft(draft: StoredPlanDraft): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_PREFIX + 'plan-draft', JSON.stringify(normalizePlanDraft(draft))); }
  catch { /* Local-only draft remains editable in memory. */ }
}
