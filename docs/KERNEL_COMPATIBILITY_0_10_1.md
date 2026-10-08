# Kernel compatibility — 0.10.0 → 0.10.1

Date: 2026-10-05

0.10.1 is a Stable-readiness and delivery-governance release. It adds GitHub CI/CD, registry promotion tooling, Nginx runtime smoke automation, offline packed-consumer support and upstream-admission governance. It does not change Runtime Kernel source.

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

All eight Kernel `src/` trees are byte-for-byte unchanged from the final 0.10.0 Contract Productivity candidate.

## Public contract conclusion

No Runtime Kernel migration is required for 0.10.0 → 0.10.1. Existing `contract=none` applications require no source change. The optional OpenAPI adapter remains Candidate-only and does not become a Stable/default runtime dependency in 0.10.1.
