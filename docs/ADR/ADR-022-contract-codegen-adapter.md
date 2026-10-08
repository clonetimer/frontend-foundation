# ADR-022 — API contract code generation is a replaceable tooling adapter

Status: Accepted for 0.10 Candidate

## Context

Frontend Foundation needs to shorten the path from a backend OpenAPI contract to safe TypeScript application code. Owning another OpenAPI parser/generator would add a large standards surface and duplicate mature upstream work. At the same time, adopting a generated HTTP SDK as a runtime dependency would bypass `@foundation/api` semantics such as `AppError`, authentication injection, request IDs, trace IDs, timeout and cancellation.

## Decision

Contract generation belongs to project tooling, not the Runtime Kernel.

```text
committed OpenAPI document
  -> replaceable Contract Adapter
  -> generated runtime-free TypeScript types
  -> committed output + SHA-256 contract lock
  -> project-owned API functions using @foundation/api
```

0.10 provides `foundation-contract` and a first Candidate adapter based on exact-pinned `@hey-api/openapi-ts@0.99.0` with only the `@hey-api/typescript` plugin. Generated SDK/client runtime code is deliberately disabled.

The adapter is not a Kernel contract. `foundation.config.json` records the selected adapter/version, while runtime packages remain unaware of OpenAPI and code generation.

## Safety scope

The 0.10 Candidate adapter enables OpenAPI 3.1 only.

- OpenAPI 3.0 is blocked because a known `@hey-api/openapi-ts@0.99.0` parser case can silently drop composed `$ref` members.
- OpenAPI 3.2 remains an evaluation target until the real upstream package passes the Foundation semantic fixture suite under the validated Node/TypeScript line.

This restriction is a Foundation policy even if the upstream project advertises broader input support.

## Reproducibility

The source contract is committed locally. Generation writes `foundation.contract.lock.json` with source and output SHA-256 values. `foundation-contract verify` regenerates into a temporary directory and rejects output drift.

Remote URL contracts may be introduced later only through a separate acquisition/snapshot step. Builds must not depend on a mutable remote contract.

## Alternatives

- `openapi-typescript`: evaluated but its current package line declares a TypeScript 5 peer while Foundation is on TypeScript 6; it is not the 0.10 default.
- Orval: remains a viable benchmark/fallback, but its broader generated runtime surface is not needed for the first types-only path.
- Foundation-owned parser/codegen: rejected.

## Consequences

Projects gain a standard contract workflow without changing Foundation runtime semantics. The exact upstream adapter can be replaced in a later release if another implementation wins the Goal-first evaluation gates.
