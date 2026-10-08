export type AsyncOperationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AsyncOperation {
  id: string;
  status: AsyncOperationStatus;
  progress?: number;
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

export function normalizeOperationProgress(progress: number | undefined): number {
  if (progress === undefined || !Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

export function isAsyncOperationTerminal(operation: Pick<AsyncOperation, 'status'>): boolean {
  return operation.status === 'succeeded' || operation.status === 'failed' || operation.status === 'cancelled';
}
