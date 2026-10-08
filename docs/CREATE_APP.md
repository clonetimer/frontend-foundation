# @foundation/create-app

`@foundation/create-app` creates, inspects, upgrades and extends standalone Frontend Foundation applications.

0.9 adds a developer-productivity layer without changing the Runtime Kernel: resolved project manifests, convention-based module discovery, capability-gated module generation and JSON-defined custom Profile inheritance.

## Profiles

```bash
create-foundation-app --list-profiles
```

Built-in profiles:

```text
minimal
  application-shell, ui-patterns

management
  application-shell, ui-patterns, data-table, forms, permission

data-workbench
  application-shell, ui-patterns, file-transfer, async-operation, visualization
```

Profiles name domain-neutral capabilities. They do not select Refine, ProComponents or another implementation library.

## Create a project

```bash
create-foundation-app my-project \
  --name @example/my-project \
  --app-id example.project \
  --title "Example Project" \
  --router browser \
  --profile management \
  --deployment nginx
```

Generated projects contain ordinary semver dependencies, never `workspace:*`/`catalog:` or Monorepo-relative tsconfig inheritance.

0.9 also installs `@foundation/create-app` as a development dependency so the same version line supplies Doctor, Generator and Upgrade tooling inside the project.

## Project manifest

Every 0.9 project contains `foundation.config.json`:

```json
{
  "schemaVersion": 1,
  "foundationVersion": "0.9.0",
  "profile": {
    "name": "management",
    "source": "builtin",
    "capabilities": ["application-shell", "ui-patterns", "data-table", "forms", "permission"],
    "foundationPackages": ["app", "ui", "data", "forms", "security"],
    "dependencies": ["react-hook-form"]
  },
  "deployment": "none",
  "modules": {
    "directory": "src/modules",
    "routeFile": "routes.ts",
    "exportName": "module"
  }
}
```

This is tooling metadata, not runtime configuration. `public/runtime-config.json` remains the runtime deployment contract.

## Add modules

List standard patterns:

```bash
foundation-generate --list-patterns
```

Generate a simple page:

```bash
foundation-generate module reports --pattern page --title "Reports"
```

Generate a management module in a `management`-capable project:

```bash
foundation-generate module records \
  --pattern management \
  --title "Records" \
  --permission records.update
```

Generate a data workbench module:

```bash
foundation-generate module analysis --pattern data-workbench --title "Analysis"
```

Patterns are capability-gated. The generator refuses a management pattern in a minimal project rather than silently adding undeclared capabilities.

Generated applications use:

```text
src/modules/*/routes.ts -> export const module
```

`src/modules/index.ts` discovers route-definition modules automatically. Page components remain lazy route chunks, while adding a module no longer requires editing `src/app/application.ts`.

Each module also gets `foundation.module.json`; Doctor verifies its pattern and capability requirements.

## Custom organization Profiles

A project can use an organization-local JSON profile without teaching Foundation a new global business classification:

```json
{
  "engineering-console": {
    "extends": "management",
    "description": "Management capabilities plus visualization.",
    "capabilities": ["visualization"],
    "foundationPackages": ["visualization"],
    "dependencies": ["echarts"]
  }
}
```

Create it with:

```bash
create-foundation-app engineering-console \
  --profile engineering-console \
  --profile-file ./foundation-profiles.json
```

Inheritance is additive/deduplicated, built-in names cannot be overridden, and cycles are rejected. The fully resolved profile is copied into `foundation.config.json`, so the generated project does not depend on the source Profile file afterward.

## Doctor

```bash
foundation-doctor . --target 0.9.0 --strict
```

Doctor checks version-line alignment, deep imports, workspace/catalog leakage, runtime config, Profile dependency consistency, Deployment assets, module convention and generated module capability manifests.

## Upgrade

```bash
foundation-upgrade . --target 0.9.0
foundation-upgrade . --target 0.9.0 --write
```

Dry-run is the default. `--write` aligns every `@foundation/*` dependency and `foundation.config.json.foundationVersion`; it never rewrites application source.

## API contract generation

0.9 deliberately does **not** implement a partial OpenAPI parser/code generator. OpenAPI codegen is a commodity ecosystem problem and will be integrated through a measured upstream generator rather than reimplemented in Foundation. See `ADR-021-openapi-codegen-upstream-boundary.md`.

## 0.12 UI Composition

New projects can select application chrome independently from capability Profile and Deployment:

```bash
create-foundation-app my-app --profile data-workbench --shell workspace
```

Built-in shells:

- `sidebar` — compatibility default for management/operations;
- `top-nav` — SaaS/product/portal;
- `workspace` — engineering/data/Agent/monitoring;
- `bare` — landing/map/3D/embedded.

Inspect shell choices:

```bash
create-foundation-app --list-shells
```

Inspect planner/generator composition choices:

```bash
foundation-generate --list-composition
```

Composition-oriented module patterns:

```bash
foundation-generate module overview --pattern dashboard
foundation-generate module explorer --pattern master-detail
foundation-generate module simulation --pattern workspace
```

Shell choice is recorded in `foundation.config.json` and generated `package.json` metadata, while the generated `src/app/application.ts` binds the selected runtime preset. Changing only the manifest later does not rewrite application source automatically. For projects adopted by the 0.13 Project Blueprint lifecycle, change `foundation.project.json` and run `foundation-project compile`; unmanaged projects still require an explicit source edit.


## Project Blueprint compiler (0.13)

`create-foundation-app` remains the low-level project scaffold. `foundation-project` is the higher-level deterministic orchestrator that calls create-app and the existing generators in a staging directory, then synchronizes only after ownership conflicts have been checked.

```bash
foundation-project validate ./foundation.project.json
foundation-project compile ./foundation.project.json
foundation-project status .
```

Use `foundation-project init .` to plan adoption of an existing generated Foundation project. See `docs/PROJECT_BLUEPRINT.md` for schema and regeneration semantics.
