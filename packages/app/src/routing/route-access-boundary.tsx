import { Outlet, useMatches } from 'react-router';
import { useAuth, evaluatePermission } from '@foundation/security';
import { ErrorState, ForbiddenState, LoadingState } from '@foundation/ui';
import type { FoundationRouteHandle } from './route-types';

export function RouteAccessBoundary() {
  const auth = useAuth();
  const matches = useMatches();
  const requirements = matches
    .map((match) => (match.handle as FoundationRouteHandle | undefined)?.foundation?.permission)
    .filter((value) => value !== undefined);

  if (auth.status === 'initializing') return <LoadingState />;
  if (auth.status === 'error') return <ErrorState error={auth.error} />;
  if (!requirements.length) return <Outlet />;
  if (auth.status !== 'authenticated') return <ForbiddenState />;
  const permissions = new Set(auth.user.permissions ?? []);
  return requirements.every((requirement) => evaluatePermission(requirement, permissions)) ? <Outlet /> : <ForbiddenState />;
}
