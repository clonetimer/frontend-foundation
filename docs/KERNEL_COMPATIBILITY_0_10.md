# Kernel Compatibility: 0.9.0 → 0.10.0

Date: 2026-10-05

0.10 Contract Productivity is a Tooling/Project-layer release. OpenAPI, code generation, contract locks, and Contract→Module bindings do not enter the Runtime Kernel.

## Source comparison

| Kernel package | Changed files under `src/` |
|---|---:|
| `@foundation/core` | 0 |
| `@foundation/observability` | 0 |
| `@foundation/security` | 0 |
| `@foundation/api` | 0 |
| `@foundation/theme` | 0 |
| `@foundation/ui` | 0 |
| `@foundation/app` | 0 |
| `@foundation/testing` | 0 |

**Result: all eight Kernel `src/` trees are byte-for-byte unchanged.**

## Compatibility conclusion

- Existing `contract=none` projects require no Runtime migration.
- The 0.10 Contract Pipeline is opt-in and lives in `@foundation/create-app` tooling plus generated project files.
- Runtime HTTP semantics remain owned by `@foundation/api` (`ApiTransport`, `AppError`, trace/request-id, timeout, cancellation, auth injection).
- No OpenAPI generator dependency is added to any Runtime Foundation package.
- The first upstream adapter remains Candidate until real upstream correctness/security/determinism gates pass.
