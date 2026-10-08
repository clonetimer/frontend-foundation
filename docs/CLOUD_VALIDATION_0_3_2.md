# Cloud Validation — 0.3.2 Candidate

Date: 2026-10-05

## Toolchain

- uploaded Node.js: `v22.23.2`
- uploaded pnpm: `11.7.0`
- system TypeScript `5.8.3` is used only for dependency-independent cross-checks; it is not treated as the final TypeScript 6 gate.

## Cloud registry limitation

A real `pnpm install` was attempted from the container. npm registry DNS/metadata access repeatedly failed with `EAI_AGAIN`. No pre-populated compatible pnpm store is available in the cloud container.

Therefore the following dependency-linked gates are not claimed as passed in this cloud runtime:

```text
pnpm install
pnpm check              # ESLint + project TS6 + Vitest + Vite builds
pnpm consumer:test      # generated external app + packed packages
pnpm storybook:build
browser smoke
```

## Validation completed in cloud

### Architecture / repository

- architecture dependency directions — PASS
- dependency cycle detection — PASS
- Foundation deep-import audit — PASS
- business-domain term audit — PASS
- relative import resolution — PASS
- generated JS/map rejection under Foundation `src/` — PASS
- Foundation package version alignment — PASS
- private application manifest/import audit — PASS
- pnpm 11 workspace settings inspection — PASS

### TypeScript / runtime cross-checks independent of installed npm graph

Cloud hardening from 0.3.1 remains validated for:

- AppError normalization;
- API base URL, headers, Problem Details and field errors;
- API timeout vs external cancellation first-cause semantics;
- pre-aborted API request short-circuit;
- file count/size/type validation and formatting;
- async polling success, deadline timeout and external cancellation even with a non-cooperative loader;
- time-series option generation;
- ECharts implementation audit for theme/renderer re-init replay.

### create-app (0.3.2)

The new project generator is explicitly Experimental but is included in offline verification.

Cloud Node tests — PASS:

- standalone Browser Router project generation;
- Hash Router and explicit Foundation version;
- non-empty target protection / `--force` semantics;
- package name, app ID, router and version validation;
- `--help` behavior;
- HTML and JSON title escaping;
- dependency snapshot alignment with root Workspace Catalog.

A real generated project was created under a temporary directory with uploaded Node 22.23.2 and its package/runtime-config contract was checked successfully.

## Additional defects/hardening addressed in 0.3.2

1. Starter/Showcase test scripts now use `vitest run --passWithNoTests`; an empty Starter is not forced to contain meaningless tests.
2. Starter/Showcase `APP_VERSION` is read from each package manifest instead of duplicated literals.
3. Packed consumer validation now starts from the real `create-app` output rather than a separately hand-written fake consumer.
4. `pack-foundation` writes an explicit tarball manifest for deterministic consumer injection.
5. Consumer external dependency versions are read from the same version snapshot used by create-app.
6. `@testing-library/dom` is explicitly declared because auto peer installation is disabled under the pnpm 11 reproducibility policy.

## Status

0.3.2 is still **Candidate**, not Stable. The architecture and dependency-independent runtime paths are cloud-validated, but Stable requires a dependency-linked environment to run the remaining gates above.
