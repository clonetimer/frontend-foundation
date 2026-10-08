# Kernel Compatibility — 0.12.0 → 0.13.0

0.13.0 adds the Project Blueprint / Project Compiler entirely in the tooling and generated-project layer.

The Runtime Kernel source baseline remains the reviewed 0.12.0 owned baseline:

- `@foundation/core`
- `@foundation/observability`
- `@foundation/security`
- `@foundation/api`
- `@foundation/theme`
- `@foundation/ui`
- `@foundation/app`
- `@foundation/testing`

`docs/oss/kernel-owned-hashes.json` intentionally keeps `baselineVersion: 0.12.0`. 0.13 does **not** reset that file: a successful owned-Kernel verification against the 0.12 hashes is the evidence that Project Blueprint development did not leak into Runtime Kernel source.

## 0.13 boundary

New behavior is limited to:

```text
foundation.project.json
  -> foundation-project validate/compile/status/init
  -> staging project
  -> ownership-aware synchronization
  -> ordinary React/TypeScript project source
```

The browser application never reads Project Blueprint or project ownership state. Resource Blueprint v1 remains build-time tooling. Existing Runtime Shell, Theme, Module, Route, API, Security and UI Composition contracts are reused rather than extended for 0.13.

## Compatibility conclusion

0.13 should still execute normal release gates before promotion because tooling, templates and generated-project behavior changed. However, it does not require a new Runtime Kernel baseline or a new Kernel API design review unless the hash/public-API gates detect an unexpected delta.
