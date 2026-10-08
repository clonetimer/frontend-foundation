# ADR-021: Do not implement a Foundation-owned OpenAPI parser/code generator

Status: Accepted for 0.9 Candidate

## Context

Developer productivity eventually requires contract-first API type/client generation. OpenAPI parsing, schema resolution and code generation are mature commodity problems with substantial edge cases. Reimplementing them inside Frontend Foundation would increase maintenance surface and duplicate OSS ecosystems.

## Decision

0.9 does not ship a home-grown OpenAPI parser or type generator.

Future API-contract productivity work must first evaluate mature upstream generators and use Foundation only for organization-specific integration around:

- `ApiTransport` invocation;
- `AppError` / Problem Details mapping;
- trace/request IDs;
- abort/timeout semantics;
- generated-code location and reproducibility gates.

A future adapter may orchestrate an upstream generator, but generated schema semantics remain the responsibility of that upstream rather than a Foundation-specific partial OpenAPI implementation.

## Consequences

- 0.9 focuses on project/module generation where Foundation has unique product value;
- API codegen is deliberately deferred rather than delivered as a weak custom implementation;
- any upstream generator must pass Goal-first adoption gates before becoming a generated-project dependency.
