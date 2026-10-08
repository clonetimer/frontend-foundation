# Cloud Validation — 0.4.0 Candidate

## Exact uploaded toolchain

Validated with:

- Node.js 22.23.2 (user-provided archive)
- pnpm 11.7.0 (user-provided archive)

## Passed

- `verify:offline`
- repository and architecture checks
- create-app tests
- foundation-doctor tests
- release preflight tests
- release dependency-order tests
- release preflight execution
- release plan generation
- actual `pnpm pack` of `@foundation/create-app`
- offline installation of the packed create-app tarball into a clean project
- execution of both published binaries from that packed tarball
- generated project passes `foundation-doctor --strict`

Pure Node combined tooling suite: 12/12 passing.

## Packed CLI contents verified

The create-app tarball contains the generator, doctor, dependency snapshot, README and complete Starter template. It does not require npm runtime dependencies.

## Still blocked by cloud registry connectivity

The cloud container cannot complete registry-backed installation for the full React/Vite/AntD dependency graph. Therefore these remain candidate gates rather than claimed passes:

- workspace dependency-linked lint/typecheck/test/build
- packed runtime-library consumer install/build
- Storybook production build
- target private-registry candidate smoke
