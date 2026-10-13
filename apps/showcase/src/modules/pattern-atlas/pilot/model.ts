import { normalizeDesignConfig, type DesignConfig } from '../effects/config';

/** A browser-local, opt-in pilot. Not a server feature rollout or production release. */
export const PILOT_FORMAT = 'foundation-pattern-atlas-records-pilot' as const;
export const PILOT_VERSION = 1 as const;
export const PILOT_MAX_REVISIONS = 12;

export interface PilotRevision {
  id: string;
  label: string;
  note: string;
  createdAt: string;
  design: DesignConfig;
}

export interface RecordsPilotState {
  format: typeof PILOT_FORMAT;
  version: typeof PILOT_VERSION;
  target: 'records.list';
  enabled: boolean;
  activeId: string | null;
  /** Newest first. Revisions are snapshots, never mutated after save. */
  revisions: PilotRevision[];
}

export const emptyPilotState: RecordsPilotState = {
  format: PILOT_FORMAT,
  version: PILOT_VERSION,
  target: 'records.list',
  enabled: false,
  activeId: null,
  revisions: []
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^rev-[a-zA-Z0-9_-]{6,80}$/.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) && /^\d{4}-\d\d-\d\dT/.test(value);
}

function revisionFromUnknown(input: unknown): PilotRevision | null {
  const raw = object(input);
  if (!raw || !validId(raw.id) || !validDate(raw.createdAt) || typeof raw.label !== 'string') return null;
  return {
    id: raw.id,
    label: raw.label.trim().slice(0, 70) || '未命名版本',
    note: typeof raw.note === 'string' ? raw.note.slice(0, 500) : '',
    createdAt: raw.createdAt,
    design: normalizeDesignConfig(raw.design)
  };
}

/** Validate a storage snapshot defensively. Malformed data always fails closed. */
export function normalizePilotState(input: unknown): RecordsPilotState {
  const raw = object(input);
  if (!raw || raw.format !== PILOT_FORMAT || raw.version !== PILOT_VERSION || raw.target !== 'records.list') {
    return { ...emptyPilotState, revisions: [] };
  }
  const seen = new Set<string>();
  const revisions: PilotRevision[] = [];
  if (Array.isArray(raw.revisions)) {
    for (const candidate of raw.revisions) {
      const revision = revisionFromUnknown(candidate);
      if (!revision || seen.has(revision.id)) continue;
      revisions.push(revision);
      seen.add(revision.id);
      if (revisions.length >= PILOT_MAX_REVISIONS) break;
    }
  }
  const activeId = typeof raw.activeId === 'string' && seen.has(raw.activeId) ? raw.activeId : null;
  return {
    format: PILOT_FORMAT, version: PILOT_VERSION, target: 'records.list',
    activeId, enabled: raw.enabled === true && activeId !== null, revisions
  };
}

/** Imports must be explicitly versioned; arbitrary JSON cannot silently activate a pilot. */
export function parsePilotFile(text: string): RecordsPilotState {
  if (text.length > 150_000) throw new Error('文件超过 150KB 上限');
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; }
  catch { throw new Error('文件不是有效 JSON'); }
  const raw = object(parsed);
  if (!raw || raw.format !== PILOT_FORMAT || raw.version !== PILOT_VERSION || raw.target !== 'records.list') {
    throw new Error('试点方案版本或目标页面不匹配');
  }
  if (!Array.isArray(raw.revisions) || raw.revisions.length > PILOT_MAX_REVISIONS || raw.revisions.some((entry) => revisionFromUnknown(entry) === null)) {
    throw new Error('版本记录格式无效或超过数量上限');
  }
  const ids = raw.revisions.map((entry: unknown) => (entry as PilotRevision).id);
  if (new Set(ids).size !== ids.length || (raw.activeId !== null && (typeof raw.activeId !== 'string' || !ids.includes(raw.activeId)))) {
    throw new Error('版本 ID 重复或活动版本不存在');
  }
  // Import is always safe-by-default: require explicit activation after examining the revisions.
  return { ...normalizePilotState(raw), enabled: false };
}

export function serializePilotFile(state: RecordsPilotState): string {
  return JSON.stringify(normalizePilotState(state), null, 2);
}

export function createPilotRevision(state: RecordsPilotState, input: {
  id: string; createdAt: string; label: string; note: string; design: DesignConfig;
}): RecordsPilotState {
  if (!validId(input.id) || !validDate(input.createdAt)) throw new Error('版本标识无效');
  const current = normalizePilotState(state);
  if (current.revisions.some((revision) => revision.id === input.id)) throw new Error('版本 ID 重复');
  const revision: PilotRevision = {
    id: input.id, createdAt: input.createdAt,
    label: input.label.trim().slice(0, 70) || '未命名版本', note: input.note.slice(0, 500),
    design: normalizeDesignConfig(input.design)
  };
  // Never silently delete the active revision when capping history.
  const revisions = [revision, ...current.revisions];
  if (revisions.length > PILOT_MAX_REVISIONS) {
    const oldestIndex = revisions.findLastIndex((candidate) => candidate.id !== current.activeId);
    if (oldestIndex !== -1) revisions.splice(oldestIndex, 1);
  }
  return { ...current, revisions };
}

export function activatePilotRevision(state: RecordsPilotState, id: string): RecordsPilotState {
  const current = normalizePilotState(state);
  if (!current.revisions.some((revision) => revision.id === id)) return current;
  return { ...current, activeId: id, enabled: true };
}

export function disablePilot(state: RecordsPilotState): RecordsPilotState {
  return { ...normalizePilotState(state), enabled: false };
}

export function rollbackPilot(state: RecordsPilotState): RecordsPilotState {
  const current = normalizePilotState(state);
  const activeIndex = current.revisions.findIndex((revision) => revision.id === current.activeId);
  const previous = current.revisions[activeIndex + 1];
  return previous ? { ...current, activeId: previous.id, enabled: true } : disablePilot(current);
}

export function getActivePilotRevision(state: RecordsPilotState): PilotRevision | null {
  const current = normalizePilotState(state);
  if (!current.enabled) return null;
  return current.revisions.find((revision) => revision.id === current.activeId) ?? null;
}

export function canRollbackPilot(state: RecordsPilotState): boolean {
  const current = normalizePilotState(state);
  const position = current.revisions.findIndex((revision) => revision.id === current.activeId);
  return current.enabled && position >= 0 && position + 1 < current.revisions.length;
}

/** Human-readable differences for the comparison workspace. */
export function comparePilotDesign(before: DesignConfig, after: DesignConfig): { field: keyof DesignConfig; before: string; after: string }[] {
  const oldDesign = normalizeDesignConfig(before);
  const newDesign = normalizeDesignConfig(after);
  return (Object.keys(oldDesign) as (keyof DesignConfig)[])
    .filter((key) => oldDesign[key] !== newDesign[key])
    .map((field) => ({ field, before: oldDesign[field], after: newDesign[field] }));
}
