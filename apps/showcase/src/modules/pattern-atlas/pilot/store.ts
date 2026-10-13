import { emptyPilotState, normalizePilotState, type RecordsPilotState } from './model';

const KEY = 'foundation-showcase:pattern-atlas:v1:records-pilot';
const subscribers = new Set<() => void>();
let memoryState: RecordsPilotState | null = null;

function notify(): void { for (const callback of subscribers) callback(); }

export function readRecordsPilot(): RecordsPilotState {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw !== null) return normalizePilotState(JSON.parse(raw) as unknown);
    } catch { /* Fall back to the in-memory copy or disabled default. */ }
  }
  return memoryState ? normalizePilotState(memoryState) : { ...emptyPilotState, revisions: [] };
}

export function saveRecordsPilot(input: RecordsPilotState): RecordsPilotState {
  const safeState = normalizePilotState(input);
  memoryState = safeState;
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(KEY, JSON.stringify(safeState)); }
    catch { /* In-memory state remains available in this tab. */ }
  }
  notify();
  return safeState;
}

export function subscribeRecordsPilot(callback: () => void): () => void {
  subscribers.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      memoryState = null;
      callback();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    subscribers.delete(callback);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
