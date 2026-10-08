import type { AppError } from '@foundation/core';

export interface AuthUser {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  permissions?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}

export type AuthState =
  | { status: 'initializing' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'error'; error: AppError };
