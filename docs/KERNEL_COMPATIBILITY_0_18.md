# Kernel Compatibility — 0.18.0

## Result

Frontend Foundation 0.18.0 Designer Engineering Beta does **not** change the owned Runtime Kernel source.

The release is contained in authoring/tooling surfaces:

- private `@foundation/designer` workspace app;
- private browser-safe `@foundation/design-model` shared authoring contract package;
- Designer model/history/structured editors;
- Composition Registry ownership/synchronization tooling;
- release, test and documentation governance.

No changes are required in the owned Kernel packages:

- `@foundation/core`
- `@foundation/observability`
- `@foundation/security`
- `@foundation/api`
- `@foundation/theme`
- `@foundation/ui`
- `@foundation/app`
- `@foundation/testing`

The reviewed 62-file owned-Kernel baseline remains authoritative. `@foundation/design-model` is a design-time private package and is intentionally outside the runtime Kernel baseline.
