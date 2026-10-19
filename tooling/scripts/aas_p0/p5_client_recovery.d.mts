/** Contract for the sandbox-only browser client; no generic Studio mutation API. */
export interface P5PendingMutation {
  version: 1;
  origin: string;
  recordId: number;
  status: 'draft' | 'published' | 'evaluated';
  key: string;
  etag: string;
  body: string;
}
export interface P5JournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type P5RecoveryResult =
  | { state: 'idle' }
  | { state: 'pending' | 'committed'; key: string; recordId: number; reason?: string };
export const P5_PENDING_KEY: string;
export function readSyntheticPending(storage: P5JournalStorage): P5PendingMutation | null;
export function beginSyntheticStatusPatch(options: {
  origin: string;
  recordId: number;
  status: 'draft' | 'published' | 'evaluated';
  writerToken: string;
  storage: P5JournalStorage;
  fetchImpl?: typeof fetch;
  newKey?: () => string;
}): Promise<P5RecoveryResult>;
export function recoverSyntheticStatusPatch(options: {
  writerToken: string;
  storage: P5JournalStorage;
  fetchImpl?: typeof fetch;
  replayIfMissing?: boolean;
}): Promise<P5RecoveryResult>;
