# Kernel Compatibility — 0.11.0 → 0.12.0

0.12.0 intentionally evolves the Runtime Kernel to introduce UI Composition and a configurable Shell Contract. This is different from 0.11.0, where Kernel `src/` remained byte-for-byte unchanged.

A byte-level SHA-256 comparison against the uploaded 0.11.0 Candidate shows:

| Kernel package | Changed `src/` files |
| --- | ---: |
| `@foundation/core` | 0 |
| `@foundation/observability` | 0 |
| `@foundation/security` | 0 |
| `@foundation/api` | 0 |
| `@foundation/theme` | 2 |
| `@foundation/ui` | 3 |
| `@foundation/app` | 11 |
| `@foundation/testing` | 0 |

Total changed Kernel source files: **16**.

## Compatibility intent

The changes are designed to be additive:

- applications that omit `ApplicationDefinition.shell` still resolve to the historical sidebar shell;
- existing theme fields `primaryColor`, `borderRadius`, and `fontFamily` remain valid;
- route/module/auth/api/error contracts are not replaced;
- Resource Blueprint v1 is unchanged;
- new UI composition exports are additive.

Because Runtime Kernel bytes changed, 0.12 must complete a new full validation cycle before Stable promotion. The 0.11/0.10.1 zero-Kernel-change validation cannot be reused as proof of 0.12 runtime correctness.
