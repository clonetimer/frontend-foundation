# Frontend Foundation 0.21.0 — Stable-Ready Validation

## Scope

`0.21.0` is the final-semver Stable promotion line derived from the frozen `0.21.0-rc.1` convergence release. This closure does **not** add Blueprint, Designer, Domain Component SDK or Runtime capability. The only product-code change required for the version transition is the final-semver metadata/examples plus a regression test proving RC dependency ranges can be upgraded to Stable without rewriting application source.

The repository release policy remains authoritative: these source/package bytes are **Stable-Ready** until the user-completed unrestricted browser/visual, GitHub exact-commit and target-registry Candidate smoke gates pass and the same immutable `0.21.0` bytes are promoted from `candidate` to `latest`.

## Validation environment

The dependency-backed gates were executed with the user-provided offline environment:

```text
Node       22.23.2
pnpm       11.7.0
TypeScript 6.0.3
Vite       8.3.2
React      19.3.0
Ant Design 6.6.5
Storybook  10.6.1
```

The restored pnpm snapshot reports the same `enableGlobalVirtualStore` environment warning seen on the accepted RC line; dependency resolution/build/test gates themselves pass. The delivery source tree does not include this restored `node_modules` graph.

## Frozen Runtime Kernel review

A SHA-256 comparison of the owned Runtime sources between `0.21.0-rc.1` and final-semver `0.21.0` reports:

```text
packages/{core,observability,security,api,theme,ui,app,testing}/src
old files = 62
new files = 62
changed   = 0
added     = 0
removed   = 0
```

`pnpm oss:kernel-baseline` passes against the existing 62-file baseline. `pnpm release:api` also passes for all 13 public library packages. No RC-to-Stable Runtime API change was introduced.

## Dependency-independent gate

The final-semver working tree passes:

```text
pnpm verify:offline
126 / 126 PASS
```

This is one more regression than RC1: the added test verifies `^0.21.0-rc.1` Foundation ranges and `foundationVersion: 0.21.0-rc.1` can be upgraded to final `0.21.0` while preserving application source.

The same gate also passes Architecture, Repository, Capability, GitHub workflow static checks, OSS isolation/convergence, Deployment, Custom Registry, Domain SDK, Project Blueprint, Visual Composition, Action/Binding, Data/Operation and release-tooling regressions.

Repository check at this stage reports:

```text
27 workspace manifests
209 TS/TSX files
```

## Release governance

Final-semver governance passes:

- Release Preflight: **PASS / 14 publishable packages**;
- Release Plan: **PASS / 14 packages**, all at exact `0.21.0`;
- Public API snapshot: **PASS / 13 packages**;
- owned Runtime Kernel baseline: **PASS / 62 files**;
- Design Model Registry mirror: **PASS**;
- Domain neutrality gate: **PASS**.

The release note `docs/releases/0.21.0.md` contains no placeholder release metadata.

## Real workspace engineering gates

Using the restored user-supplied offline dependency graph:

- ESLint: **PASS / 0 errors**;
- TypeScript 6 workspace semantic typecheck: **PASS**;
- full workspace test run: **PASS**;
- full production `pnpm build`: **PASS**, including Designer and regression applications;
- Designer Vite production bundle: **PASS** as part of the full build;
- Storybook production build: **PASS**; the final output contains `domain-components.stories-*.js`;
- primary Domain SDK admission: **PASS / 3 components**;
- independently authored secondary Domain SDK admission: **PASS / 2 components**.

Storybook continues to emit the already-reviewed Ant Design/Rolldown module-directive and large-chunk warnings. They are warnings, not build failures.

One composite Storybook invocation was killed by the hosted tool-call wall-clock limit after its build log had already printed the successful bundle result. The underlying Storybook package build was therefore re-run independently under a controlled invocation and exited **0** with `Storybook build completed successfully`; package builds had separately passed. This is recorded to avoid conflating harness timeout with a product build failure.

## Packed consumer validation

The release tooling built and packed the actual 14 final-semver `0.21.0` Foundation packages. Fresh generated consumers then consumed those tarball bytes together with the supplied offline third-party dependency snapshot.

All three profiles completed TypeScript semantic checks, Vite production builds and `foundation-doctor --strict`:

```text
minimal         PASS
management      PASS
data-workbench  PASS
```

The aggregate hosted command hit its wall-clock limit after minimal and management had completed; the already-created data-workbench consumer was then completed directly against the same `0.21.0` tarballs and passed build + strict Doctor. No package bytes were changed between these steps.

## Immutable package artifact closure

`artifacts/packages/manifest.json` records exactly 14 final-semver tarballs and their byte sizes / SHA-256 digests. A separate verification recomputed every digest and size from disk:

```text
artifact manifest integrity: PASS / 14 tarballs
```

The tarball bundle exported for handoff is:

```text
frontend-foundation-0.21.0-stable-packages.tar.gz
SHA-256 c43e4c91ad5f4c36264168bb70739d815f544e3c1262106d54fcea36dc17b98e
```

Release tooling dry-runs also pass against these exact tarballs:

- Candidate publish plan: **PASS / 14 tarballs**, no registry writes performed;
- Stable promotion plan: **PASS / 14 `dist-tag add ... latest` commands**, no registry writes performed.

This proves the local publication plan and artifact-integrity checks, not the external registry itself.

## External acceptance delegated to the user

Per user instruction, the following are intentionally **not** executed/claimed as passed here:

1. unrestricted real-browser Designer E2E and Desktop/Tablet/Mobile visual baseline;
2. connected GitHub exact-commit CI/security/release workflow evidence;
3. target-registry Candidate publication and clean-registry consumer smoke;
4. `candidate` -> `latest` promotion of the exact accepted `0.21.0` bytes.

The current hosted Chromium policy still blocks local application navigation, so no browser PASS is inferred from source/build gates. Exact user-side commands and evidence expectations are in `docs/STABLE_ACCEPTANCE_0_21.md` and `docs/STABLE_PROMOTION.md`.

## Delivery artifact acceptance

The final clean-source ZIP acceptance is performed after this validation document is synchronized into the delivery tree. The final section below must match the delivered ZIP bytes; if it does not, the artifact is not accepted.

### Clean-source acceptance before ZIP packaging

After removing `node_modules`, `dist`, `artifacts`, `storybook-static`, `coverage`, `.consumer`, `.vite`, `.cache` and `.git`, the clean delivery tree passes:

```text
verify:offline              126 / 126 PASS
Release Preflight           14 packages PASS
Public API                  13 packages PASS
Kernel baseline             62 files PASS
Design Model Registry       PASS
Repository Manifest         550 / 550 exact match
```

From that dependency-free clean tree, `@foundation/create-app@0.21.0` was packed directly with npm:

```text
68 tar entries
75,312 bytes packed
```

The extracted tarball then completed the retained generic Custom Registry flow:

```text
foundation-project validate       PASS
foundation-project diagnose --json PASS
foundation-project compile        PASS
foundation-project status         PASS / clean
foundation-doctor --strict        PASS / 0 issues
```

Generated source/package metadata contains the expected static `@example/domain-widgets` integration, proving that the Custom Registry/Compiler path works from published-tool bytes rather than the repository install state.

### Pre-delivery ZIP reverse acceptance

The pre-delivery ZIP was extracted into a new directory and independently repeated:

```text
verify:offline              126 / 126 PASS
Release Preflight           14 packages PASS
Public API                  13 packages PASS
Kernel baseline             62 files PASS
Design Model Registry       PASS
Repository Manifest         550 / 550 exact match
clean-tree create-app pack  PASS
Custom Registry compile     PASS
strict Doctor               PASS
```

No product source change was made as a result of this reverse acceptance.

### ZIP acceptance protocol

A pre-delivery ZIP is extracted to a new directory and must repeat the dependency-independent gates, Manifest exact-match check and packed-tool smoke above. After this validation document is synchronized, the final ZIP is regenerated and the same key checks are repeated against the final bytes. The final ZIP SHA-256 is intentionally recorded in the adjacent `.sha256` file rather than inside this document, avoiding a self-referential artifact hash.

