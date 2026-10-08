export type PermissionRequirement =
  | string
  | { all: readonly string[] }
  | { any: readonly string[] };
