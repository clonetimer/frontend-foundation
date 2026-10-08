# Contract adapter upstream evaluation

## Goal-first rule

Frontend Foundation does not own an OpenAPI parser or generated runtime client. A code generator is accepted only as a tooling adapter and must not change `@foundation/api` runtime semantics.

## 0.10 Candidate: `@hey-api/openapi-ts@0.99.0`

Why it remains Candidate rather than Stable:

- it is pre-1.0 and its own documentation recommends exact version pinning;
- a public 0.99.0 OpenAPI 3.0 parser correctness issue can silently drop composed `$ref` members (hey-api/hey-api#4252);
- the parser dependency line has had public `js-yaml` security advisories/issues (hey-api/hey-api#4071 and #4274);
- the real upstream package bytes are not present in the current cloud offline dependency snapshot, so Foundation has validated the adapter boundary with a deterministic fixture but has not promoted the real upstream semantic gate.

## 0.10 restrictions

- opt-in only: `--contract openapi`;
- local committed OpenAPI source only;
- JSON input only;
- OpenAPI 3.1 only;
- exact adapter version pin;
- generated output and source are SHA-256 locked;
- runtime HTTP remains `@foundation/api` through the project-side `src/contracts/runtime.ts` facade;
- generated modules may declare a contract dependency only after that contract has been generated and is drift-free.

## Promotion gates

Before the adapter can become Stable/default, all of the following must pass with the real upstream package:

1. fixture correctness for representative 3.1 schemas and composed schemas;
2. deterministic regeneration and clean generated diff;
3. dependency security scan with no unresolved blocking advisory;
4. TypeScript 6 compile of generated output;
5. packed `@foundation/create-app` external-consumer test;
6. no new Runtime Kernel dependency or public-contract change.

If these conditions are not met, Foundation may replace the adapter or keep Contract Productivity experimental without changing project runtime contracts.
