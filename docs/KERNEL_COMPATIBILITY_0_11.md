# Kernel Compatibility — 0.10.1 Local Stable → 0.11.0

0.11.0 adds Resource Blueprint only in the Tooling / generated-project layer. A byte-level SHA-256 comparison of the eight Runtime Kernel `src/` trees against the frozen 0.10.1 Local Stable baseline found **zero changed files**.

| Kernel package | Changed `src/` files |
|---|---:|
| `@foundation/core` | 0 |
| `@foundation/observability` | 0 |
| `@foundation/security` | 0 |
| `@foundation/api` | 0 |
| `@foundation/theme` | 0 |
| `@foundation/ui` | 0 |
| `@foundation/app` | 0 |
| `@foundation/testing` | 0 |

## Contract conclusion

- No Runtime Kernel public contract change is required for Resource Blueprint.
- Existing 0.10.1 projects require no migration.
- Newly created `management` projects explicitly include the existing `core`/`api` packages because generated resource code uses `AppError`/`ApiTransport` contracts.
- Resource generation remains opt-in and has zero runtime cost until the generated module is imported by a project.
