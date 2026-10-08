import type { ApplicationShellProps } from './shell-types';

/** Full-control shell for landing pages, embedded apps, maps, and 3D canvases. */
export function BareShell({ children }: ApplicationShellProps) {
  return <>{children}</>;
}
