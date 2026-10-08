# Kernel Compatibility — 0.14

0.14 intentionally evolves `@foundation/ui` to add governed low-level visual layouts/widgets required by the Visual Composition compiler.

Scope of planned Runtime Kernel change:

- `packages/ui/src/visual-composition.tsx` added;
- `packages/ui/src/index.ts` exports the new primitives;
- `packages/ui/src/catalog.ts` extends catalog kinds with `layout` and `widget`.

`@foundation/core`, `@foundation/app`, `@foundation/theme`, API, security, observability and testing contracts are not changed by this feature.

The Project Blueprint remains build-time only. No runtime JSON renderer, Blueprint parser, design engine or arbitrary code evaluator is added to the browser bundle.

Because the owned Kernel source changes intentionally, the 0.14 Candidate must establish a new reviewed `kernel-owned-hashes.json` baseline after the delta is inspected. Future unexpected changes remain blocked by the same OSS-isolation gate.
