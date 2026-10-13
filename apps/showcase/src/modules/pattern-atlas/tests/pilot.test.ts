import { describe, expect, it } from 'vitest';
import { defaultDesignConfig, type DesignConfig } from '../effects/config';
import {
  PILOT_FORMAT, PILOT_MAX_REVISIONS, activatePilotRevision, canRollbackPilot, comparePilotDesign,
  createPilotRevision, disablePilot, emptyPilotState, getActivePilotRevision,
  normalizePilotState, parsePilotFile, rollbackPilot, serializePilotFile
} from '../pilot/model';

const changed: DesignConfig = { ...defaultDesignConfig, accent: 'coral', surface: 'dark', density: 'compact' };
const rev = (i: number, design = changed) => ({
  id: `rev-${String(i).padStart(7, '0')}`,
  createdAt: new Date(Date.UTC(2026, 9, 10, 0, 0, i)).toISOString(),
  label: `候选 ${i}`, note: `版本说明 ${i}`, design
});

function twoRevisions() {
  return createPilotRevision(createPilotRevision(emptyPilotState, rev(1, defaultDesignConfig)), rev(2));
}

describe('Phase 5: Records visual pilot snapshots and opt-in rollout', () => {
  it('starts disabled, preserving the original business page', () => {
    expect(normalizePilotState(null)).toEqual(emptyPilotState);
    expect(normalizePilotState({ format: 'bad' })).toEqual(emptyPilotState);
    expect(getActivePilotRevision(emptyPilotState)).toBeNull();
  });

  it('saving a revision never activates it, and snapshots are independent', () => {
    const input = { ...changed };
    const stored = createPilotRevision(emptyPilotState, { ...rev(1), design: input });
    input.accent = 'amber';
    expect(stored.enabled).toBe(false);
    expect(stored.activeId).toBeNull();
    expect(stored.revisions[0]?.design.accent).toBe('coral');
    expect(getActivePilotRevision(stored)).toBeNull();
  });

  it('can enable an explicitly selected revision then restore baseline without losing history', () => {
    const next = activatePilotRevision(twoRevisions(), rev(2).id);
    expect(getActivePilotRevision(next)?.label).toBe('候选 2');
    const baseline = disablePilot(next);
    expect(getActivePilotRevision(baseline)).toBeNull();
    expect(baseline.revisions).toHaveLength(2);
    expect(baseline.activeId).toBe(rev(2).id);
  });

  it('can roll back from a newer revision to its older predecessor', () => {
    const current = activatePilotRevision(twoRevisions(), rev(2).id);
    expect(canRollbackPilot(current)).toBe(true);
    const older = rollbackPilot(current);
    expect(getActivePilotRevision(older)?.id).toBe(rev(1).id);
    expect(canRollbackPilot(older)).toBe(false);
    expect(getActivePilotRevision(rollbackPilot(older))).toBeNull();
  });

  it('refuses to activate unknown IDs', () => {
    const state = twoRevisions();
    expect(activatePilotRevision(state, 'rev-not-found').enabled).toBe(false);
    expect(activatePilotRevision(state, 'rev-not-found').activeId).toBeNull();
  });

  it('keeps the active revision when capping history at twelve versions', () => {
    let state = createPilotRevision(emptyPilotState, rev(0));
    state = activatePilotRevision(state, rev(0).id);
    for (let i = 1; i < 16; i += 1) state = createPilotRevision(state, rev(i));
    expect(state.revisions).toHaveLength(PILOT_MAX_REVISIONS);
    expect(state.revisions.some((entry) => entry.id === rev(0).id)).toBe(true);
    expect(getActivePilotRevision(state)?.id).toBe(rev(0).id);
  });

  it('round-trips an export but always disarms imported rollout', () => {
    const active = activatePilotRevision(twoRevisions(), rev(2).id);
    const serialized = serializePilotFile(active);
    const imported = parsePilotFile(serialized);
    expect(imported.format).toBe(PILOT_FORMAT);
    expect(imported.version).toBe(1);
    expect(imported.enabled).toBe(false);
    expect(imported.activeId).toBe(rev(2).id);
    expect(imported.revisions).toEqual(active.revisions);
    expect(getActivePilotRevision(imported)).toBeNull();
  });

  it('rejects bad JSON, wrong versions, duplicate IDs and missing active revisions', () => {
    expect(() => parsePilotFile('{')).toThrow('JSON');
    expect(() => parsePilotFile(JSON.stringify({ ...twoRevisions(), version: 3 }))).toThrow('版本');
    expect(() => parsePilotFile(JSON.stringify({ ...twoRevisions(), revisions: [rev(1), rev(1)] }))).toThrow('重复');
    expect(() => parsePilotFile(JSON.stringify({ ...twoRevisions(), activeId: rev(9).id }))).toThrow('不存在');
    expect(() => parsePilotFile(JSON.stringify({ ...twoRevisions(), revisions: [rev(1), { ...rev(2), id: '<script>' }] }))).toThrow('无效');
  });

  it('normalizes malicious token and note values with strict whitelists', () => {
    const injected = { ...rev(1), note: 'a'.repeat(1000), design: { ...changed, accent: 'javascript:alert(1)', font: 'url(evil)' } };
    const safe = normalizePilotState({ ...emptyPilotState, revisions: [injected], enabled: true, activeId: rev(1).id });
    expect(safe.revisions[0]?.design.accent).toBe('jade');
    expect(safe.revisions[0]?.design.font).toBe('sans');
    expect(safe.revisions[0]?.note).toHaveLength(500);
    expect(JSON.stringify(safe)).not.toContain('javascript:');
  });

  it('reports differences for exactly the ten configurable design dimensions', () => {
    const diff = comparePilotDesign(defaultDesignConfig, changed);
    expect(diff.map((value) => value.field)).toEqual(['accent', 'surface', 'density']);
    expect(diff[0]).toEqual({ field: 'accent', before: 'jade', after: 'coral' });
    expect(comparePilotDesign(changed, changed)).toEqual([]);
  });
});
