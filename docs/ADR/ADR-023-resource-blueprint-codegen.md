# ADR-023 — Resource Blueprint is build-time project code generation

Status: Accepted for the 0.11 development line.

## Context

Frontend Foundation already provides project profiles, module generation, API transport, forms, data tables and contract tooling. A recurring management-project task is still repetitive: developers manually write the same list/detail/edit route structure and request glue for conventional resources.

Automatically parsing OpenAPI into pages would couple page generation to an upstream parser that has not yet passed the Foundation admission gate. A runtime schema engine would also turn Foundation into a low-code platform, which is outside the project goal.

## Decision

Introduce **Resource Blueprint v1** as a small, explicit JSON input consumed only by `foundation-generate resource`.

The blueprint:

- is project tooling, not a Runtime Kernel contract;
- supports only `string`, `number`, `boolean` and `enum` fields in v1;
- explicitly declares list/detail/update HTTP paths;
- may optionally reference an already-ready project Contract;
- generates ordinary editable TypeScript/React project source;
- stores a normalized blueprint plus SHA-256 in module metadata so Doctor can detect drift;
- continues to use `@foundation/api` `ApiTransport` for HTTP/error/trace semantics.

No Resource Blueprint parser or interpreter is shipped to the browser.

## Consequences

Positive:

- conventional management modules require substantially less handwritten glue;
- OpenAPI upstream selection remains replaceable: a future admitted adapter may emit Resource Blueprint JSON without changing runtime code;
- generated code remains understandable and editable by normal React developers;
- the existing module/profile/Doctor governance model continues to apply.

Constraints:

- Resource Blueprint v1 intentionally does not support nested schemas, relations, arrays, dynamic widgets, runtime expressions or arbitrary workflows;
- generated list endpoints use the Foundation page response convention `{ items, total, page, pageSize }`;
- v1 identifiers are strings because React Router path params are strings;
- genuinely custom pages should continue to be handwritten rather than forcing them through the blueprint.

## Rejected alternatives

1. Build a Foundation OpenAPI parser — rejected; upstream admission is intentionally separate.
2. Use a runtime JSON page/form renderer — rejected; introduces low-code runtime complexity and locks project UX to a schema interpreter.
3. Generate directly from database models — rejected; creates backend/storage coupling in a frontend foundation.
