# Kernel Compatibility — 0.17.0

## Result

Frontend Foundation 0.17.0 Visual Designer PoC does **not** modify Runtime Kernel source.

The 0.17 work is contained in:

- `apps/designer/**`;
- additive Design-time metadata in `tooling/create-app/composition.json` plus release/repository governance required to treat Designer as a first-party private workspace app;
- Designer regression tests and documentation;
- version-aligned Project Blueprint examples/tests.

No `packages/*/src` file needs a planned baseline reset for this release.

## Architectural implication

The Visual Designer is an authoring frontend for the existing Project Blueprint and Composition Registry. Generated applications do not depend on `@foundation/designer`, and browsers running generated applications do not load Designer code or Project Blueprint JSON.

The reviewed 0.16 Runtime Kernel owned baseline remains authoritative for 0.17.
