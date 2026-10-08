# ADR-020: Convention-based module generation stays outside the Runtime Kernel

Status: Accepted for 0.9 Candidate

## Context

Frontend Foundation already exposes an explicit `ApplicationModule` contract. Requiring every generated project to manually import and append each new module to `application.ts` creates repetitive source edits and merge conflicts, but changing the Kernel into a plugin registry would expand runtime complexity for a tooling problem.

## Decision

Generated Vite applications use a project-level convention:

```text
src/modules/*/routes.ts -> export const module
```

`src/modules/index.ts` discovers those route-definition files with `import.meta.glob(..., { eager: true })` and produces the `ApplicationModule[]` passed to `createApplication`.

The convention belongs to generated application/tooling code. `@foundation/app` remains unaware of file-system discovery and continues to accept an explicit `modules` array.

`foundation-generate module` creates convention-compliant modules from capability-gated, domain-neutral patterns. Each generated module includes `foundation.module.json` so Doctor can validate its declared pattern/capability requirements without parsing application semantics.

## Consequences

- adding a module does not require modifying the application composition file;
- route components remain lazy even though route-definition modules are eagerly discovered;
- generated apps remain Vite-specific, which is already an explicit Foundation scope decision;
- projects can opt out of the convention by owning their application composition manually, but `foundation-generate` only supports the 0.9 convention;
- Runtime Kernel public contracts do not change.
