import type { PermissionRequirement } from './permission-requirement';

export function evaluatePermission(
  requirement: PermissionRequirement | undefined,
  permissions: ReadonlySet<string>
): boolean {
  if (!requirement) return true;
  if (permissions.has('*')) return true;
  if (typeof requirement === 'string') return permissions.has(requirement);
  if ('all' in requirement) return requirement.all.every((permission) => permissions.has(permission));
  return requirement.any.some((permission) => permissions.has(permission));
}
