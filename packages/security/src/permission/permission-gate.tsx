import type { PropsWithChildren, ReactNode } from 'react';
import { useAuth } from '../auth/auth-provider';
import { evaluatePermission } from './evaluate-permission';
import type { PermissionRequirement } from './permission-requirement';

export function usePermission(requirement?: PermissionRequirement): boolean {
  const auth = useAuth();
  if (!requirement) return true;
  if (auth.status !== 'authenticated') return false;
  return evaluatePermission(requirement, new Set(auth.user.permissions ?? []));
}

export function PermissionGate({ permission, fallback = null, children }: PropsWithChildren<{
  permission?: PermissionRequirement;
  fallback?: ReactNode;
}>) {
  return usePermission(permission) ? <>{children}</> : <>{fallback}</>;
}
