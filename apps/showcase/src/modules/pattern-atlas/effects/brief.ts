import { normalizePatternIds } from '../catalog';
import { normalizeEffectIds } from './catalog';
import { normalizeDesignConfig, type DesignConfig } from './config';
import { normalizeCenterDraft, type CenterDraft } from '../center/model';

/** Portable, data-only UI choices. Not a Designer Blueprint or executable component definition. */
export interface UiBrief extends CenterDraft {
  format: 'foundation-pattern-atlas-brief';
  version: 2;
  projectName: string;
  patternIds: string[];
  effectIds: string[];
  design: DesignConfig;
  notes: string;
}

export type UiBriefInput = {
  projectName: string; patternIds: string[]; effectIds: string[]; design: DesignConfig; notes?: string;
} & Partial<CenterDraft>;

export function buildUiBrief(input: UiBriefInput): UiBrief {
  return {
    format: 'foundation-pattern-atlas-brief', version: 2,
    projectName: input.projectName.trim().slice(0, 80) || '未命名界面',
    patternIds: normalizePatternIds(input.patternIds),
    effectIds: normalizeEffectIds(input.effectIds),
    design: normalizeDesignConfig(input.design),
    notes: (input.notes ?? '').slice(0, 5000),
    ...normalizeCenterDraft({ viewport: input.viewport, previewState: input.previewState, bindings: input.bindings })
  };
}

/** v1 briefs from Phase 2 migrate to v2, with default preview and binding choices. */
export function parseUiBrief(json: string): UiBrief {
  if (json.length > 200_000) throw new Error('配置文件过大');
  let unknown: unknown;
  try { unknown = JSON.parse(json) as unknown; }
  catch { throw new Error('不是有效的 JSON 文件'); }
  if (!unknown || typeof unknown !== 'object' || Array.isArray(unknown)) throw new Error('配置结构错误');
  const raw = unknown as Record<string, unknown>;
  if (raw.format !== 'foundation-pattern-atlas-brief' || (raw.version !== 1 && raw.version !== 2)) throw new Error('配置版本不支持');
  if (typeof raw.projectName !== 'string' || !Array.isArray(raw.patternIds) || !Array.isArray(raw.effectIds)) throw new Error('必要字段缺失');
  const center = raw.version === 2 ? normalizeCenterDraft(raw) : normalizeCenterDraft(null);
  return buildUiBrief({
    projectName: raw.projectName,
    patternIds: normalizePatternIds(raw.patternIds),
    effectIds: normalizeEffectIds(raw.effectIds),
    design: normalizeDesignConfig(raw.design),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    ...center
  });
}
