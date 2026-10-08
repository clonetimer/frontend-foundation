# Kernel Compatibility — 0.19.0

## Scope

Frontend Foundation 0.19.0 Designer Validation / Extensibility keeps Custom Registry, compiler diagnostics and Designer functionality outside the Runtime Kernel.

A real dependency-backed TypeScript 6 gate exposed two pre-existing `exactOptionalPropertyTypes` / Ant Design typing incompatibilities in `@foundation/ui`. 0.19 intentionally repairs only those Runtime source locations:

- `packages/ui/src/composition.tsx`
- `packages/ui/src/visual-composition.tsx`

## Nature of the changes

The changes are compile-contract fixes, not a new runtime feature:

- omit optional Ant Design props instead of explicitly passing `undefined`;
- import `ButtonProps` from Ant Design rather than React;
- preserve the existing Text/Input/Select/Metric behavior while satisfying strict optional-property semantics.

No Runtime API surface, Blueprint runtime interpreter, Custom Registry loader, diagnostics engine or Designer dependency is added to generated applications.

All other owned Kernel packages are unchanged from 0.18. The two-file diff was audited after the real TypeScript/build gates passed, and the reviewed 0.19 owned-Kernel baseline was reset to the resulting 62 source files.
