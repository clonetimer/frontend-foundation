# @foundation/create-app

Productivity tooling for Frontend Foundation projects.

## Create

```bash
create-foundation-app ./my-app --profile management --deployment nginx
```

Built-in profiles: `minimal`, `management`, `data-workbench`.

A custom organization profile can be supplied as data, not executable code:

```bash
create-foundation-app ./my-app --profile internal-tool --profile-file ./foundation-profiles.json
```

The JSON file may either define a full profile or extend a built-in/custom profile with `"extends"`. Arrays are additive and deduplicated. Built-in profile names cannot be overridden, inheritance cycles are rejected, and the fully resolved profile is copied into `foundation.config.json`, so generated projects do not depend on the original profile file after creation.

## Generate modules

```bash
foundation-generate module reports --project . --pattern page --title "Reports"
foundation-generate module records --project . --pattern management --title "Records"
foundation-generate module analysis --project . --pattern data-workbench --title "Analysis"
foundation-generate module explorer --project . --pattern split-pane --title "Explorer"
foundation-generate module overview --project . --pattern dashboard --title "Overview" --index
```

Module patterns are capability-gated. A `minimal` project cannot generate a management/data-workbench pattern until its resolved capabilities are upgraded intentionally.

Generated applications discover `src/modules/*/routes.ts` automatically. Each route file exports a stable `module` symbol, so adding a module does not require editing the application composition file.

## Project Blueprint / Visual Composition / Actions / Operations (0.16)

Project Blueprint is a build-time project contract; it is not a runtime page schema.

```bash
foundation-project validate ./foundation.project.json
foundation-project compile ./foundation.project.json
foundation-project status .
```

Adopt an existing Foundation project conservatively:

```bash
foundation-project init .
foundation-project init . --write
foundation-project compile ./foundation.project.json --force-generated
```

The first command only prints/plans. `--write` persists the inferred Blueprint and Resource input copies. The first compile of an adopted project will not silently overwrite existing machine-looking files; `--force-generated` is the explicit takeover boundary. Existing editable source is preserved as `human-owned` or `scaffold-once` according to compiler state.

The compiler stages the complete generated project before synchronization and records managed input/file hashes in `foundation.project.state.json`. See repository `docs/PROJECT_BLUEPRINT.md`.

A Project Blueprint page may also declare a recursive `composition` tree using governed layout/widget IDs. The compiler emits ordinary TSX; it does not ship a runtime JSON renderer. Use `foundation-generate --list-composition` for human-readable output or `foundation-generate --list-composition --json` for a machine-readable Registry suitable for design tools. The JSON Registry includes Layout/Widget editable property descriptors as well as governed Binding/Event signatures, so graphical authoring tools can build their Palette and Inspector from the same contract.

Visual Composition includes `stack`, `grid`, `split`, `tabs` layouts and `panel`, `text`, `button`, `input`, `select`, `metric`, `placeholder` widgets. 0.15 added typed page-local state, governed `bindings`, semantic Widget `events`, and named Actions. 0.16 adds API-relative HTTP Data Sources, request Operations, pending/error/result state wiring, and `invoke` / internal `navigate` Action steps. Executable handler/request code strings remain rejected. See `docs/ACTION_BINDING.md` and `docs/DATA_OPERATION.md` in the repository.

## Inspect

```bash
foundation-doctor . --strict
```

## Upgrade version line

```bash
foundation-upgrade . --target 0.21.0
foundation-upgrade . --target 0.21.0 --write
```

## Contract tooling (0.10)

`create-foundation-app --contract openapi` configures a local OpenAPI 3.1 source and exact-pinned Candidate codegen adapter. Use `foundation-contract generate|verify|status`; generated code is types-only and runtime HTTP remains owned by `@foundation/api`.

## Resource Blueprint

For conventional management resources, generate list/detail/edit page skeletons from an explicit JSON blueprint:

```bash
foundation-generate resource ./records.resource.json --project .
```

The generator emits normal editable React/TypeScript source; there is no runtime schema interpreter. Resource Blueprint v1 supports `string`, `number`, `boolean` and `enum` fields, uses `ApiTransport`, records `generatorVersion: 1` plus a SHA-256 of the normalized blueprint, rejects unsafe/absolute API paths, and uses existing permission gates for edit affordances. `foundation-doctor --strict` detects resource drift and incomplete generated modules.

The published CLI package includes `examples/records.resource.json`; the repository also contains `docs/RESOURCE_BLUEPRINT.md` for the full contract.

## UI Composition (0.12)

```bash
create-foundation-app my-app --shell workspace --profile data-workbench
create-foundation-app --list-shells
foundation-generate --list-composition
foundation-generate module overview --pattern dashboard
foundation-generate module explorer --pattern master-detail
foundation-generate module simulation --pattern workspace
foundation-generate module explorer --pattern split-pane
```

Shell, Profile, Deployment and Contract are independent axes. `sidebar` is the compatibility default.

## Domain Component SDK (0.20)

`@foundation/create-app` also exposes `foundation-domain` for project-owned React component packages:

```bash
foundation-domain init ./domain-widgets --package @example/domain-widgets --namespace mission
foundation-domain verify ./domain-widgets --built --pack
foundation-domain merge ./domain-widgets/foundation.registry.json ./lab-widgets/foundation.registry.json --out foundation.registry.json
```

`verify` checks Registry/package identity, semantic version compatibility, public exports and actual npm pack contents. See `docs/DOMAIN_COMPONENT_SDK.md` in the repository.
