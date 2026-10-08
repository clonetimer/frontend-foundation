# Project Blueprint / Project Compiler

Frontend Foundation 0.13 introduced the build-time Project Blueprint; 0.14 added Visual Composition; 0.15 added optional typed page state, Widget bindings, governed events and named Actions; 0.16 adds governed HTTP Data Sources, Operations and internal navigation steps.

The goal is not a runtime low-code renderer. `foundation.project.json` is an **input to deterministic source generation**. The output remains ordinary React/TypeScript that can be read, tested and edited.

## Architecture

```text
Requirement / PRD / API
        ↓
Project Planner (future AI layer)
        ↓
foundation.project.json
        ├── project identity
        ├── Foundation profile / shell / delivery / contract
        ├── theme
        ├── navigation
        ├── pages → Pattern + optional visual tree + state/action graph
        └── resources → Resource Blueprint v1 references
        ↓
foundation-project validate
        ↓
Project Compiler
        ↓
create-foundation-app + deterministic generators (staging directory)
        ↓
ownership-aware synchronization
        ↓
normal React / TypeScript project
```

Project Blueprint deliberately reuses existing contracts instead of creating a second DSL:

- Profile selects capabilities and package composition.
- Shell selects application chrome.
- Page `pattern` selects an existing generator/UI Composition Pattern.
- Optional page `composition` selects governed layout/widget instances with stable node IDs; the compiler emits them as TSX.
- Optional page `state` / `actions` plus node `bindings` / `events` define a statically validated interaction graph compiled to React state/callbacks.
- Resource entries reference Resource Blueprint v1 files.
- Deployment and Contract remain independent axes.

## Minimal example

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "operations.console",
    "packageName": "operations-console",
    "title": "Operations Console"
  },
  "foundation": {
    "version": "0.21.0",
    "profile": "management",
    "shell": "workspace",
    "router": "browser",
    "deployment": "none",
    "contract": "none"
  },
  "theme": {
    "primaryColor": "#1677ff",
    "layout": { "contentPadding": 16 }
  },
  "pages": [
    { "id": "overview", "title": "Overview", "pattern": "dashboard", "index": true },
    { "id": "simulation", "title": "Simulation", "pattern": "workspace", "route": "simulation" }
  ],
  "resources": [
    { "source": "resources/records.resource.json" }
  ],
  "navigation": {
    "items": [
      { "target": "overview", "label": "Overview", "order": 0 },
      { "target": "records", "label": "Records", "order": 10 },
      { "target": "simulation", "label": "Simulation", "order": 20 }
    ]
  }
}
```

The published package also includes `project.schema.json` (JSON Schema 2020-12) and `examples/project-blueprint/`.

### Optional visual composition

A page may keep the Pattern-only path or add an explicit recursive composition tree:

```json
{
  "id": "overview",
  "title": "Overview",
  "pattern": "dashboard",
  "index": true,
  "composition": {
    "id": "root",
    "kind": "layout",
    "type": "stack",
    "children": [
      { "id": "heading", "kind": "widget", "type": "text", "props": { "text": "Overview", "variant": "title" } }
    ]
  }
}
```

`composition` is compiled to ordinary TSX. It is not interpreted in the browser. See `docs/VISUAL_COMPOSITION.md` for the Registry and node contract.


## Action / Binding relationship

0.15 keeps interaction semantics inside the Project Blueprint without turning it into executable code. Page-local scalar `state` is referenced by visual-node `bindings`; governed Widget events connect to named `actions`. The semantic validator checks state/action references, event signatures and type compatibility before source generation.

The compiler emits ordinary `useState` declarations and React callbacks. See `docs/ACTION_BINDING.md` for the exact event, binding and Action Step contracts.

## Data / Operation relationship

0.16 adds optional page `dataSources` and `operations`. HTTP Data Sources are API-relative and compile through the existing `@foundation/api` transport. Operations can reference scalar page state in query/body values, drive boolean pending and string error states, and assign JSON/text response values back to scalar state. Actions connect to Operations through `invoke`; internal router transitions use `navigate`. See `docs/DATA_OPERATION.md`.

## Commands

Validate without writing:

```bash
foundation-project validate ./foundation.project.json
```

Compile in-place:

```bash
foundation-project compile ./foundation.project.json
```

Inspect Blueprint/input/generated-owned drift:

```bash
foundation-project status .
foundation-doctor . --strict
```

The v1 compiler intentionally compiles in the directory containing `foundation.project.json`. Referenced Resource Blueprint paths must be relative POSIX paths inside that project.

## Validation rules

The semantic validator goes beyond the JSON Schema. It checks:

- exactly one index page;
- unique page/resource IDs and route paths;
- page Pattern IDs exist and are allowed by the selected Profile capabilities;
- Resource Blueprints are valid v1 resources and the Profile has management/API capabilities;
- navigation targets cover every page/resource exactly once;
- contract references exist in the selected Contract mode;
- Shell/Profile/Deployment/Router/Contract IDs are known;
- `foundation.version` stays on the same major/minor line as the installed Project Compiler (0.18.x compiler targets 0.18.x Foundation);
- Resource input paths cannot escape the project directory;
- Theme values are JSON-serializable and layout dimensions are finite/non-negative.

## Ownership and safe regeneration

`foundation.project.state.json` is a committed compiler state file. It stores normalized input hashes plus per-file ownership/baseline hashes.

### `generated-owned`

Machine contract/composition files such as:

- `package.json`
- `foundation.config.json`
- `src/app/application.ts`
- `src/app/project-theme.ts`
- module `routes.ts`, `index.ts`, `foundation.module.json`
- normalized generated `foundation.resource.json`

The compiler overwrites these only when their current hash still matches the previous compiler state. Local modifications block compilation. `--force-generated` is an explicit escape hatch and should be used only after review/back-up.

### `scaffold-once`

Human implementation surfaces such as:

- generated page TSX files;
- Resource `api.ts` / `types.ts` / page TSX files;
- `src/app/runtime-config.ts`;
- OpenAPI source/runtime extension files;
- project README/main entry scaffolds.

If the generated scaffold has not changed, user edits are preserved. If a Blueprint/template change requires a new scaffold **and** the same file has human edits, compilation stops with a conflict. If the file is untouched, it is safely regenerated and its baseline advances.

### `human-owned`

When adopting an existing project, pre-existing scaffold surfaces are conservatively classified as human-owned. The Project Compiler never assumes it may rewrite them.

This prevents the dangerous state where a manifest/spec is advanced while an edited implementation silently remains generated for an older Blueprint.

## Resource Blueprint relationship

Project Blueprint does not embed another copy of the Resource DSL:

```json
"resources": [
  { "source": "resources/records.resource.json" }
]
```

The Project Compiler validates the referenced resource, includes its normalized content in the project input hash, then delegates source generation to Resource Blueprint v1. Editing the external resource therefore makes `foundation-project status` and `foundation-doctor` report input drift until the project is recompiled.

## Existing project migration

Plan migration without writing:

```bash
foundation-project init .
```

Write `foundation.project.json` and copy existing generated Resource specs into a stable `resources/` source directory:

```bash
foundation-project init . --write
```

The migration parser derives what it can from:

- `package.json`
- `foundation.config.json`
- `public/runtime-config.json`
- `src/app/application.ts`
- module `foundation.module.json`
- generated route metadata
- generated Resource Blueprint metadata/specs

It refuses custom Profiles in v1 because converting those to a built-in profile automatically would not be faithful. If the existing project is on an earlier Foundation minor line (for example 0.12.x), the migration plan explicitly targets the current 0.18.x line and reports that upgrade as a warning; Project Blueprint v1 does not silently generate a project whose tooling and Foundation runtime belong to different minor lines.

A migrated project has no ownership state yet, so the first compile intentionally refuses to claim existing generated-owned files. After reviewing the generated Blueprint and source diff, explicitly adopt the machine-owned surfaces:

```bash
foundation-project compile ./foundation.project.json --force-generated
```

Existing page/domain scaffolds are preserved as human-owned during adoption.

## Contract mode

Project compilation may emit modules/resources that reference a declared project contract before contract code generation has run. The compiler validates that the contract name belongs to the selected Contract mode, but defers the normal contract-readiness gate while staging. `foundation-doctor` / `foundation-contract verify` still report missing or stale generated contract output afterward, so contract runtime/codegen correctness is not bypassed.

## Deliberate v1 limits

0.14 still does **not** introduce:

- runtime JSON-to-React rendering;
- drag/drop editing;
- arbitrary DOM/CSS generation;
- workflow/state-machine generation;
- custom Profile definition inside Project Blueprint;
- automatic merge of simultaneously changed human and generated code.

0.14 now provides the first governed block/layout-instance composition tree. Interaction/action bindings, arbitrary domain widgets, source merging, and graphical drag/drop authoring remain separate future layers. See `docs/VISUAL_COMPOSITION.md`.
