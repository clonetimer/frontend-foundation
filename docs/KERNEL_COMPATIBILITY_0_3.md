# Kernel Compatibility 0.2.4 → 0.3.2

Compared the complete `src/` trees of the eight Kernel packages against the delivered 0.2.4 archive.

## Result

Public Kernel contracts remain **UNCHANGED**. Seven Kernel package source trees are source-identical; `@foundation/api` has one implementation hardening change in `create-api-transport.ts`.

| Package | Changed source files | Contract impact |
|---|---:|---|
| @foundation/core | 0 | none |
| @foundation/observability | 0 | none |
| @foundation/security | 0 | none |
| @foundation/api | 1 | none — transport cancellation/timeout behavior hardened |
| @foundation/theme | 0 | none |
| @foundation/ui | 0 | none |
| @foundation/app | 0 | none |
| @foundation/testing | 0 | none |

For `@foundation/api`, both `src/index.ts` and `src/types.ts` remain byte-identical to 0.2.4. The only Kernel change is internal behavior in `create-api-transport.ts`:

- a pre-aborted caller signal now short-circuits before token acquisition;
- external cancellation and timeout use a deterministic first-cause model;
- a late timeout can no longer relabel an earlier user cancellation.

0.3 also adds `@foundation/file`, `@foundation/async`, and `@foundation/visualization` as peripheral Capabilities. No `ApplicationDefinition`, Module, Route, Auth, RuntimeConfig, Permission, or AppError public contract was expanded.

This is a source/public-contract compatibility result. Dependency-linked semantic validation remains tracked in `VALIDATION.md`.


0.3.2 additionally adds the Experimental create-app tooling outside the Kernel package graph; it does not change any Kernel public contract.
