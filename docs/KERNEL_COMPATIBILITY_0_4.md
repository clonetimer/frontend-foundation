# Kernel Compatibility 0.3.2 → 0.4.0

0.4.0 is a productization release. The eight Kernel package source trees are byte-identical to 0.3.2:

| Package | changed `src/` files |
|---|---:|
| `@foundation/core` | 0 |
| `@foundation/observability` | 0 |
| `@foundation/security` | 0 |
| `@foundation/api` | 0 |
| `@foundation/theme` | 0 |
| `@foundation/ui` | 0 |
| `@foundation/app` | 0 |
| `@foundation/testing` | 0 |

0.4 changes package metadata, documentation and productization tooling only. There is no Kernel API migration from 0.3.2 to 0.4.0.

All Foundation packages should nevertheless move to the 0.4 minor line together because the pre-1.0 governance policy intentionally rejects mixed minor lines.
