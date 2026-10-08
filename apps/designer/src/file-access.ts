import type { ProjectBlueprint } from './types';
import type { ProjectComponentRegistry } from '@foundation/design-model';

interface WritableLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}

export interface ProjectFileHandle {
  name?: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: Record<string, unknown>) => Promise<ProjectFileHandle[]>;
  showSaveFilePicker?: (options?: Record<string, unknown>) => Promise<ProjectFileHandle>;
};

const fileTypes = [{
  description: 'Foundation Project Blueprint',
  accept: { 'application/json': ['.json'] }
}];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Minimal browser-side shape guard. Full Project Blueprint semantic validation
 * remains owned by foundation-project; the Designer only rejects inputs that
 * would be unsafe to render as an authoring document.
 */
export function parseProjectBlueprintText(text: string): ProjectBlueprint {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error('Project Blueprint must be a JSON object.');
  if (value.schemaVersion !== 1) throw new Error('Project Blueprint schemaVersion must be 1.');
  if (!isRecord(value.project) || typeof value.project.id !== 'string' || typeof value.project.title !== 'string') {
    throw new Error('Project Blueprint project.id and project.title are required.');
  }
  if (!isRecord(value.foundation)) throw new Error('Project Blueprint foundation object is required.');
  if (!Array.isArray(value.pages)) throw new Error('Project Blueprint pages must be an array.');
  for (const [index, page] of value.pages.entries()) {
    if (!isRecord(page) || typeof page.id !== 'string' || typeof page.title !== 'string') {
      throw new Error(`Project Blueprint pages[${index}] must define string id and title.`);
    }
  }
  return value as unknown as ProjectBlueprint;
}

export async function openProjectFile(): Promise<{ blueprint: ProjectBlueprint; handle?: ProjectFileHandle; name: string } | undefined> {
  const picker = window as PickerWindow;
  if (!picker.showOpenFilePicker) return undefined;
  const [handle] = await picker.showOpenFilePicker({ multiple: false, types: fileTypes });
  if (!handle) return undefined;
  const file = await handle.getFile();
  const blueprint = parseProjectBlueprintText(await file.text());
  return { blueprint, handle, name: file.name };
}

export async function readFallbackFile(file: File): Promise<ProjectBlueprint> {
  return parseProjectBlueprintText(await file.text());
}

export async function saveProjectFile(blueprint: ProjectBlueprint, handle?: ProjectFileHandle): Promise<ProjectFileHandle | undefined> {
  if (!handle) return undefined;
  const writable = await handle.createWritable();
  await writable.write(`${JSON.stringify(blueprint, null, 2)}\n`);
  await writable.close();
  return handle;
}

export async function saveProjectFileAs(blueprint: ProjectBlueprint): Promise<ProjectFileHandle | undefined> {
  const picker = window as PickerWindow;
  if (!picker.showSaveFilePicker) return undefined;
  const handle = await picker.showSaveFilePicker({ suggestedName: 'foundation.project.json', types: fileTypes });
  await saveProjectFile(blueprint, handle);
  return handle;
}

export function downloadProjectFile(blueprint: ProjectBlueprint, name = 'foundation.project.json') {
  const blob = new Blob([`${JSON.stringify(blueprint, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}


export function parseProjectRegistryText(text: string): ProjectComponentRegistry {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error('Custom Registry must be a JSON object.');
  if (value.schemaVersion !== 1) throw new Error('Custom Registry schemaVersion must be 1.');
  if (value.widgets !== undefined && !Array.isArray(value.widgets)) throw new Error('Custom Registry widgets must be an array.');
  if (value.blocks !== undefined && !Array.isArray(value.blocks)) throw new Error('Custom Registry blocks must be an array.');
  return value as unknown as ProjectComponentRegistry;
}

export async function readRegistryFallbackFile(file: File): Promise<ProjectComponentRegistry> {
  return parseProjectRegistryText(await file.text());
}
