# Getting Started

## 1. Prepare the repository environment

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
```

## 2. Create an independent application

Choose the capability Profile rather than an implementation library:

```bash
create-foundation-app my-app --profile minimal
create-foundation-app my-admin --profile management
create-foundation-app my-workbench --profile data-workbench
```

Optional Nginx delivery assets are orthogonal to the application Profile:

```bash
create-foundation-app my-admin --profile management --deployment nginx
```

List supported built-ins:

```bash
create-foundation-app --list-profiles
create-foundation-app --list-deployments
foundation-generate --list-patterns
```

Generated projects commit `foundation.config.json`. It records resolved Foundation capabilities/packages/dependencies, delivery target, and module conventions. It is project-governance metadata; browser runtime configuration remains in `public/runtime-config.json`.


## 3. Optional API contract workflow

Contract mode is orthogonal to Profile and Deployment:

```bash
create-foundation-app my-admin --profile management --contract openapi
cd my-admin
pnpm install
pnpm foundation:contract
pnpm foundation:contract:verify
```

The committed contract lives at `contracts/openapi.json`; generated types live under `src/contracts/generated`; `foundation.contract.lock.json` records source/output hashes. In 0.10 the Candidate adapter is enabled for OpenAPI 3.1 only. Runtime calls continue through `@foundation/api`.

## 4. Add a module without editing the application registry

New 0.9 applications discover route-definition modules under `src/modules/*/routes.ts`. Generate a module using a domain-neutral Pattern:

```bash
foundation-generate module reports --project . --pattern page --title "Reports"
```

For a management Profile:

```bash
foundation-generate module records \
  --project . \
  --pattern management \
  --title "Records" \
  --permission records.update
```

For a data workbench:

```bash
foundation-generate module analysis \
  --project . \
  --pattern data-workbench \
  --title "Analysis"
```

The generator checks the project's resolved capabilities before writing files. Generated route components remain lazy-loaded; only lightweight route-definition files are aggregated eagerly by Vite.

## 5. Validate project drift

```bash
foundation-doctor . --strict
```

Doctor validates Foundation version/minor alignment, Profile requirements, `foundation.config.json`, module manifests/routes, deep imports, runtime config, and declared deployment assets.

## 6. Upgrade safely

Dry-run first:

```bash
foundation-upgrade . --target 0.10.0
foundation-upgrade . --target 0.10.0 --write
foundation-doctor . --target 0.9.0 --strict
```

The upgrader aligns Foundation package ranges and `foundation.config.json.foundationVersion`; it never rewrites project source.

## 7. Run repository examples

```bash
pnpm dev
pnpm dev:starter
pnpm storybook
```

## 8. Runtime configuration

Applications read `/runtime-config.json` at startup and validate it with Zod before rendering. Deployment environments can change API base URL, Router mode, Theme default, and Feature Flags without rebuilding application JavaScript.

## 9. Capability ownership model

Projects own server state, URL state, project APIs and domain behavior. Foundation provides stable cross-project semantics and common lifecycle/UI patterns.

Examples:

- `@foundation/data` does not own Query or Router state;
- `@foundation/forms` integrates structure/error semantics while projects use RHF/Zod directly;
- `@foundation/file` is transport-agnostic;
- `@foundation/async` accepts project-owned loaders;
- `@foundation/visualization` keeps native ECharts options available;
- Nginx is an optional delivery target;
- Redis is not a Frontend Foundation dependency.

See `apps/showcase` and both regression Pilots for executable examples.

For a contract-backed module after generation:

```bash
pnpm foundation:contract
pnpm foundation:generate -- module records --pattern management --contract api
```

0.10 Candidate accepts JSON OpenAPI 3.1 input only.

## Generate a conventional management resource (0.11)

For a `management` Profile project, create an explicit Resource Blueprint JSON and run:

```bash
foundation-generate resource ./records.resource.json --project .
foundation-doctor . --strict
```

The generator emits normal editable list/detail/edit project source. See `docs/RESOURCE_BLUEPRINT.md` and `examples/resource-blueprints/records.resource.json`.
