# Cloud Validation — 0.3.1 Candidate

Date: 2026-10-05

## Toolchain available in cloud

- uploaded Node.js: `v22.23.2`
- uploaded pnpm: `11.7.0`
- system TypeScript used only for dependency-independent cross-checks: `5.8.3`

The repository production/dev catalog still targets TypeScript 6.0.x; the system 5.8 compiler is **not** treated as a substitute for the final TypeScript 6 gate.

## Registry connectivity

`pnpm install` was executed against `registry.npmjs.org`. The cloud container repeatedly returned `EAI_AGAIN` while resolving package metadata and timed out. Direct container network resolution to npm/jsDelivr/unpkg is unavailable.

Therefore dependency-linked ESLint/TS6/Vitest/Vite/Storybook execution cannot honestly be marked green in this specific cloud runtime.

## Validation completed in cloud

### Repository / architecture

- `node tooling/scripts/offline-verify.mjs` — PASS
- 18 workspace manifests inspected
- 143 TS/TSX source/test files parsed with zero syntax diagnostics
- all tooling `.mjs` files pass `node --check`
- Foundation dependency-direction and cycle checks — PASS
- undeclared Foundation runtime dependency / deep-import checks — PASS
- business-domain term audit — PASS
- relative import resolution — PASS
- repository checker regression: generated `.js` under `packages/core/src` is rejected — PASS
- all Foundation package versions are required to match the root version — PASS
- private app external imports are checked against app manifests — PASS

### Dependency-independent semantic/runtime cross-checks

Using the cloud system TypeScript compiler, dependency-independent subsets were compiled separately and executed under Node 22:

- `@foundation/core` error/text primitives
- `@foundation/api` transport/error mapping logic
- `@foundation/async` operation/polling logic
- `@foundation/file` selection validation and file-size formatting
- `@foundation/visualization` time-series option generation

Runtime assertion harness — PASS, covering:

- AppError normalization
- file extension/MIME/count/size validation
- file-size formatting
- async multi-poll success path
- async overall timeout when loader ignores AbortSignal
- async external cancellation when loader ignores AbortSignal
- invalid polling timing configuration
- API base URL resolution
- auth/request-id header injection
- 422 Problem Details + field errors + trace ID
- HTTP timeout classification
- external cancellation classification
- pre-aborted API request skips token acquisition/fetch
- time-series option generation/dataZoom behavior

## Defects found and fixed by cloud validation

1. API cancellation could later be relabeled as timeout if fetch rejection was delayed. Fixed with deterministic first abort source.
2. Pre-aborted API requests still acquired an access token. They now short-circuit as cancelled.
3. `pollAsyncOperation()` timeout did not protect against a `load()` Promise that ignored AbortSignal. Added deadline race.
4. External cancellation could hang when async loader ignored AbortSignal. Added explicit cancellation race.
5. ECharts instance recreated on theme/renderer changes without guaranteed option/loading replay. Effects now replay state after re-init.
6. `onReady` identity changes could unnecessarily recreate charts. Callback is now held in a ref.
7. Showcase interval ref used browser-only `number`; changed to `ReturnType<typeof globalThis.setInterval>`.
8. File-size formatter and time-series option generation were separated from UI modules for purer testing and reuse.
9. pnpm 11 ignores normal pnpm settings in `.npmrc`; `autoInstallPeers` and `strictPeerDependencies` moved into workspace YAML.
10. Repository validation now rejects generated JS/maps under Foundation source trees.

## Remaining release gates

These remain blocked by cloud registry connectivity, not marked passed:

```text
pnpm install
pnpm check
pnpm consumer:test
pnpm storybook:build
browser smoke
```

Stable must not be tagged until those gates run in an environment with the dependency graph available (registry or pre-populated pnpm store).
