# Contract Pipeline

## Goal

Reduce API-contract setup work without moving HTTP runtime ownership away from `@foundation/api`.

## Create a project

```bash
create-foundation-app my-app --profile management --contract openapi
cd my-app
pnpm install
pnpm foundation:contract
pnpm foundation:contract:verify
foundation-doctor . --strict
```

`--contract openapi` adds:

```text
contracts/openapi.json                committed source of truth
src/contracts/generated/              generated runtime-free types
foundation.contract.lock.json         source/output hash lock
foundation.config.json                adapter/version/tooling metadata
```

## Runtime boundary

Generated types do not own HTTP transport. Project API modules still call `ApiTransport` or project wrappers around it. This preserves:

- `AppError` normalization;
- authentication token injection;
- request/trace identifiers;
- timeout vs cancellation semantics;
- Problem Details / field error mapping;
- project-owned TanStack Query keys and caching.

## Commands

```bash
foundation-contract --list-adapters
foundation-contract status
foundation-contract generate
foundation-contract verify
```

`generate` refuses adapter/version drift and writes a deterministic lock. `verify` requires a clean state, regenerates independently and compares generated-tree SHA-256.

## Adapter policy

0.10 uses `@hey-api/openapi-ts@0.99.0` only as a Candidate **types-only** adapter. It is exact-pinned because the package is pre-1.0.

Enabled input in 0.10:

- OpenAPI 3.1

Blocked/pending:

- OpenAPI 3.0: blocked due to a known parser correctness case in the pinned upstream version;
- OpenAPI 3.2: evaluation target, not enabled until semantic fixtures pass with real upstream bytes.

The application runtime does not import `@hey-api/openapi-ts`.

## Generated output ownership

Generated output should be committed for reproducible review and consumer builds. Do not edit files under `src/contracts/generated` manually. Change the source OpenAPI document or adapter version, regenerate, review the diff, and commit the new lock.

## Candidate safety restrictions

0.10 enables only committed local **JSON** OpenAPI 3.1 documents. YAML is intentionally blocked until the selected upstream adapter passes the dependency security gate. The adapter is pinned exactly and remains Candidate. See `UPSTREAM_EVALUATION.md`.

Contract-backed modules may be generated with:

```bash
pnpm foundation:generate -- module records --pattern management --contract api
```

The generator does not parse operations. It only verifies the named contract is declared, generated and drift-free, then records the dependency in `foundation.module.json`. Runtime calls remain explicit through `src/contracts/runtime.ts` and `@foundation/api`.
