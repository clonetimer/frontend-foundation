# OSS Migration Map

## Phase A — ProComponents

Use the Management Pilot as the primary comparison.

1. Reimplement the list page with `ProTable`.
2. Reimplement the edit/create form with `ProForm`.
3. Reimplement shell presentation with `ProLayout` without changing Foundation route metadata.
4. Keep API calls on the existing `ApiTransport` / TanStack Query path during the first comparison.
5. Measure source LOC, public adapters, bundle size, tests and user-facing parity.

Promotion candidate:

- `@foundation/data`: deprecate only if ProTable covers the common table pattern without forcing its network contract.
- `@foundation/forms`: reduce to error/validation adapters if ProForm handles layout/field composition.
- `@foundation/ui`: retain states/errors; prefer ProCard/Descriptions/Skeleton for enterprise layout primitives.
- `@foundation/app`: keep kernel, optionally swap AppShell presentation to ProLayout.

## Phase B — Refine Core

Do **not** use `@refinedev/antd` or `@refinedev/react-router` in this phase.

Evaluate only:

- Data Provider against current OpenAPI/ApiTransport model.
- Auth Provider bridge against `AuthAdapter`.
- Access Control Provider bridge against `PermissionRequirement`.
- Resource CRUD hooks against direct TanStack Query project code.

Router stays React Router 8. Refine officially supports custom router providers, but router integration is deliberately deferred until Core proves value without it.

## Phase C — Benchmark

Ant Design Pro and React Admin remain read-only benchmarks. We compare developer experience and feature coverage; no project is generated from them and no source is vendored.

## Rollback

The 0.5 implementation remains the rollback baseline during 0.6. OSS migration is performed behind package/project boundaries rather than destructive replacement.
