# Resource Blueprint v1

Resource Blueprint is a developer-productivity input for `foundation-generate`. It is deliberately **not** a low-code runtime schema and is not part of the Foundation Kernel.

Its job is narrow: turn an explicit, reviewable JSON description into a conventional management module containing list/detail/edit pages, typed request helpers and module metadata.

## Command

```bash
foundation-generate resource ./records.resource.json --project .
```

The project must provide the `management` capabilities, including `api-transport` and the shared `error-model`.

Generated files:

```text
src/modules/<resource>/
├─ foundation.module.json
├─ foundation.resource.json
├─ index.ts
├─ routes.ts
├─ types.ts
├─ api.ts
└─ pages/
   ├─ list.route.tsx
   ├─ detail.route.tsx
   └─ edit.route.tsx
```

The module manifest stores `generatorVersion: 1` plus the SHA-256 of the normalized resource spec. `foundation-doctor --strict` rejects spec drift or incomplete generated resource modules.

## Supported field types

Resource Blueprint v1 intentionally supports only:

- `string`
- `number`
- `boolean`
- `enum`

Nested objects, relationships, arrays, arbitrary expressions, dynamic widget plugins and runtime schema interpreters are outside v1.

The resource ID field must be a `string` in v1 because generated React Router path parameters are strings. Numeric or composite identifiers can be added later only if real projects justify the extra conversion semantics.

## HTTP contract

The blueprint explicitly declares three operations:

- `api.list`: GET collection endpoint
- `api.detail`: GET item endpoint and must contain `{id}`
- `api.update`: PUT/PATCH item endpoint and must contain `{id}`

Paths must be relative API paths. Absolute URLs, parent traversal (`..`) and placeholders other than `{id}` are rejected. The list path must not contain `{id}`.

The generated API layer still uses `@foundation/api` `ApiTransport`, so timeout, cancellation, auth token, request ID, Problem Details and trace semantics remain owned by Foundation. Generated list/detail actions also respect the declared read/update permissions at the route and UX level; backend authorization remains authoritative.

List endpoints are expected to return:

```ts
interface ResourcePage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

Generated list queries send `page`, `pageSize`, optional `search`, and explicitly declared filter fields.

## Contract integration

A blueprint may optionally declare:

```json
{ "contract": "api" }
```

If present, `foundation-generate` requires the named project Contract to exist and be drift-free before generation. The generator does **not** parse OpenAPI operations. This preserves the 0.10 adapter boundary: a future admitted OpenAPI adapter may emit Resource Blueprint JSON, but Resource Blueprint itself is upstream-neutral.

## Non-goals

Resource Blueprint v1 is not intended to become:

- a browser runtime form/table schema engine;
- a database model definition;
- an OpenAPI parser;
- a generic workflow DSL;
- a replacement for hand-written React when a page is genuinely custom.

Generated code is ordinary project code and is expected to be edited after generation.

See `examples/resource-blueprints/records.resource.json` for a complete example.
