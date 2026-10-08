# Kernel compatibility — 0.8.0 to 0.9.0

## Result

The 0.9 Developer Productivity work does **not** modify the Runtime Kernel implementation.

The following package `src/` trees were compared file-by-file against the 0.8 Delivery Readiness baseline:

| Kernel package | Changed source files |
| --- | ---: |
| `@foundation/core` | 0 |
| `@foundation/observability` | 0 |
| `@foundation/security` | 0 |
| `@foundation/api` | 0 |
| `@foundation/theme` | 0 |
| `@foundation/ui` | 0 |
| `@foundation/app` | 0 |
| `@foundation/testing` | 0 |

## Interpretation

0.9 adds developer tooling and generated-application conventions around the Kernel rather than teaching the Kernel about files, module discovery, custom Profiles, OpenAPI generators, or project templates.

In particular:

- `@foundation/app` still receives an explicit `ApplicationModule[]`;
- filesystem discovery is generated Vite-application code, not Kernel behavior;
- `foundation.config.json` is tooling/governance metadata, not Runtime Config;
- module Pattern names are tooling concepts, not Kernel route metadata;
- custom Profiles are resolved by `create-app` and embedded into the project manifest;
- OpenAPI code generation remains outside the Kernel.

No migration of `ApplicationDefinition`, `ApplicationModule`, Foundation route metadata, Runtime Config, Auth Adapter, AppError, API Transport, Theme, or provider contracts is required by 0.9.
