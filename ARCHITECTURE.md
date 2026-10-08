# Architecture

## Runtime layers

```text
Project
  |
  +--> data ----------> ui ----> theme ----> core
  +--> forms ---------> core
  +--> file ----------> no Foundation runtime dependency
  +--> async ---------> core
  +--> visualization -> core/theme/ui
  +--> app -----------> core/theme/ui/api/security/observability

security ------> core
api -----------> core
observability -> core
testing -------> Foundation test infrastructure
```

`@foundation/app` 是 Runtime Composition Root。Capability 不能依赖 `app`，Kernel 也不能感知具体 Capability。





## Domain Component SDK boundary (0.20)

0.20 adds a package-engineering layer around the existing Custom Registry without moving domain implementations into the Foundation Kernel.

```text
project-owned React package
  |-- src/*.tsx
  |-- dist/*
  `-- foundation.registry.json
           |
           +--> foundation-domain verify --built --pack
           |       package / version / source export / built export / npm pack admission
           |
           +--> Visual Designer metadata only
           |       safe placeholders / containers
           |
           `--> Project Compiler
                   static import from domain package
                   -> ordinary generated React / TypeScript

Storybook regression
  `--> imports and renders the real retained @example/domain-widgets package
```

`foundation-domain` is shipped by `@foundation/create-app`, so no new Runtime package or plugin host is introduced. Package-level Registry fragments use the same Custom Registry v1 shape as projects and can be deterministically merged. The retained `@example/domain-widgets` fixture is private and non-Foundation-scoped; it exists to prove that project-owned modules can evolve independently of `@foundation/*`. See `docs/DOMAIN_COMPONENT_SDK.md`, ADR-030 and `docs/KERNEL_COMPATIBILITY_0_20.md`.

## Designer validation / extensibility boundary (0.19)

0.19 extends the authoring/tooling layer without introducing a runtime plugin system:

```text
foundation.registry.json
        |
        +--> browser-safe Design Model metadata --> Visual Designer Palette/Inspector
        |                                      \-> safe placeholder/container preview
        |
        `--> Project Compiler --> static package import + dependency --> generated React/TSX

foundation.project.json
        |
        +--> diagnoseBlueprintModel() --> live browser preflight
        `--> foundation-project diagnose --json --> Node compiler authority
```

Project components are namespaced and declare only metadata: package/version, named export, governed properties, Binding types, events and optional child-container capability. The Designer never imports arbitrary project packages. Compiler output remains ordinary static source.

The real TypeScript 6 gate also required a reviewed two-file `@foundation/ui` compatibility repair for `exactOptionalPropertyTypes`; no Registry/diagnostics/Designer runtime behavior was added to the Kernel. See `docs/CUSTOM_REGISTRY.md`, `docs/COMPILER_DIAGNOSTICS.md`, ADR-029 and `docs/KERNEL_COMPATIBILITY_0_19.md`.

## Visual Designer engineering boundary (0.18)

0.18 turns the graphical authoring PoC into an engineering beta without adding a second design document or moving Blueprint interpretation into Runtime.

```text
packages/design-model
  |-- Project Blueprint authoring contracts
  `-- canonical Composition Registry
          |
          +-------------------> @foundation/designer
          |                         |
          |                    Blueprint history
          |                    safe rename
          |                    structured editors
          |                         |
          |                         v
          |                 foundation.project.json
          |                         |
          |                         v
          |                  Project Compiler
          |                         |
          |                         v
          |               ordinary React / TypeScript
          |
          `-- verified byte-identical mirror
                 tooling/create-app/composition.json
                 (keeps create-app npm tarball standalone)
```

`@foundation/design-model` is a private browser-safe authoring contract package. The Designer consumes it directly; `@foundation/create-app` keeps a packaged Registry mirror because its npm tarball must remain independently executable. `tooling/scripts/design-model-sync.mjs` makes registry drift a release failure instead of allowing two independently maintained definitions.

Designer history snapshots the Project Blueprint itself, so undo/redo crosses Canvas, Inspector and structured editor changes consistently. Reference-safe rename migrates dependent Binding/Event/Action/Data Source/Operation references before committing the new document. Desktop/Tablet/Mobile viewport presets only change authoring preview width; they do not add responsive semantics to the Project Blueprint.

The Designer remains a private workspace authoring application. Generated projects do not depend on it, and the owned Runtime Kernel remains unchanged from the reviewed 0.15 baseline. See `docs/VISUAL_DESIGNER.md`, `docs/ADR/ADR-028-visual-designer-authoring-contract.md`, and `docs/KERNEL_COMPATIBILITY_0_18.md`.

## Data / Operation compiler boundary (0.16)

0.16 extends the structured interaction graph with governed external work while keeping execution in generated source rather than a runtime schema engine.

```text
Widget event
  -> named Action
      -> invoke Operation
          -> API-relative HTTP Data Source
          -> pending/error page state
          -> response field -> page state
      -> optional internal navigation
  -> existing state Binding -> Widget property
                       ↓
               Project Compiler
                       ↓
      useApiTransport + async React source
```

Data Sources cannot embed absolute URLs, query strings, fragments, path templates, or code. Operation query values are scalar literals or explicit `$state` references; request bodies are JSON plus explicit `$state` references. Response assignments target declared scalar page state and are runtime-checked at the generated boundary. HTTP Operations require the `api-transport` capability and reuse the existing `@foundation/api` transport contract.

The Runtime Kernel is unchanged from the reviewed 0.15 baseline. See `docs/DATA_OPERATION.md` and `docs/KERNEL_COMPATIBILITY_0_16.md`.

## Structured interaction compiler boundary (0.15)

0.15 extends the 0.14 visual tree with a statically validated signal/action graph. The model borrows the useful GUI-toolkit separation between widget events, state bindings and action handlers, without importing Qt APIs or embedding executable code in Blueprint.

```text
visual widget
  -> governed event ------> named Action -> typed Steps -> page-local state
  -> governed Binding <-------------------------------------------|
                              ↓
                     Project Compiler
                              ↓
                   useState + React callbacks
```

The Registry declares which Widget properties are bindable and which semantic events exist. The compiler rejects unknown connections, event-value misuse and state-type mismatches before TSX generation. Runtime receives only additive controlled-value/callback props on existing `@foundation/ui` widgets; Project Blueprint remains tooling-only.

See `docs/ACTION_BINDING.md`, ADR-027 and `docs/KERNEL_COMPATIBILITY_0_15.md`.

## Visual composition compiler boundary (0.14)

0.14 adds a graphical-module-style intermediate representation above the 0.13 Project Compiler. The useful model is the separation of layout containers, widgets, stable node identity and properties; it is not a Qt/PyQt importer.

```text
Planner / future visual editor / project author
  -> page.composition tree
      -> layout nodes + widget nodes + stable IDs
  -> semantic validation / Registry resolution
  -> TSX source generation
  -> ordinary @foundation/ui components
```

Patterns remain high-level presets. Explicit composition trees are an additive lower-level authoring path. The compiler rejects arbitrary executable properties and emits ordinary TSX rather than a browser-side schema renderer. This keeps Git diff, type checking, testing and human ownership intact.

See `docs/VISUAL_COMPOSITION.md` and `docs/KERNEL_COMPATIBILITY_0_14.md`.

## Project Blueprint compiler boundary (0.13)

0.13 adds a project-level intermediate representation to the tooling layer without expanding the Runtime Kernel:

```text
Requirement / PRD / future AI Planner
  -> foundation.project.json
  -> semantic validation
  -> temporary staging project
  -> ownership-aware synchronization plan
  -> ordinary React/TypeScript project
  -> existing Foundation Runtime contracts
```

Project Blueprint selects existing Profile, Shell, Deployment, Contract, Theme and Composition Pattern contracts. Resource entries reference Resource Blueprint v1 files; the Project schema does not duplicate the resource field/API DSL. The browser Runtime never reads `foundation.project.json` or `foundation.project.state.json`.

Regeneration is intentionally conservative. `generated-owned` files are compiler-controlled and local drift blocks compilation unless takeover is explicit. `scaffold-once` files remain editable; unchanged generator output preserves human edits, while a changed generator input plus a human edit produces a conflict instead of destructive overwrite. Existing projects adopted without state classify pre-existing editable source as `human-owned`. The compiler computes the complete sync plan before mutating the target, so a conflict is a zero-write failure.

`foundation-project init` provides a best-effort migration plan from existing Foundation metadata. It does not silently assume ownership. Doctor reads project state only for tooling/governance drift checks.

See `docs/PROJECT_BLUEPRINT.md` and ADR-025.

## UI composition boundary (0.12)

0.12 intentionally evolves `@foundation/app`, `@foundation/theme`, and `@foundation/ui` to remove the hard-coded single-shell assumption:

```text
Project requirement
  -> Shell preset/custom shell
  -> Page Pattern / Block composition
  -> ordinary project React/TypeScript
  -> existing route/module/api/security contracts
```

`ApplicationDefinition.shell` is the only Runtime entrypoint required for shell selection. Built-in presets are `sidebar`, `top-nav`, `workspace`, and `bare`; omitting the field preserves the previous sidebar behavior. Custom shells receive routed content as children and do not replace Router access/error boundaries.

The Composition Catalog lives in tooling and exposes stable shell/pattern/block IDs for generators and future Project Blueprint / AI planning. The Runtime Kernel does **not** parse this catalog or a page schema. Resource Blueprint remains resource-focused and independent from UI composition.

Theme expansion is additive: legacy brand fields remain valid while broader Ant Design tokens/component tokens and Foundation layout geometry can be supplied.

See `docs/UI_COMPOSITION.md` and ADR-024.

## Resource-generation boundary (0.11)

0.10.1 Local Stable remains frozen. 0.11 adds Resource Blueprint only to the Tooling / generated-project layer:

```text
explicit resource.json
  -> foundation-generate
  -> ordinary project React/TypeScript
  -> existing Foundation public APIs
```

Resource Blueprint is not a Runtime Kernel schema, database model, OpenAPI parser or browser low-code engine. Generated HTTP helpers use the existing `ApiTransport`; generated permission UX uses existing `@foundation/security`; backend authorization remains authoritative.

The Kernel remains unaware of Resource Blueprint and continues to receive only explicit `ApplicationModule[]`.

## Productization layer

产品化工具位于 Runtime graph 之外：

```text
create-app
  -> independent project
  -> foundation-doctor

release tools
  -> version sync
  -> preflight
  -> topological plan
  -> validated tarballs
  -> candidate registry tag
  -> clean registry smoke
  -> immutable dist-tag promotion
```

这些工具不能成为业务运行时依赖，也不能为了发布便利修改 Kernel Contract。


## Stable promotion boundary (0.10.1)

Stable promotion is a delivery/governance concern, not a Runtime concern:

```text
GitHub CI on exact commit
  -> immutable 0.10.1 tarballs
  -> private registry candidate dist-tag
  -> clean registry consumer smoke
  -> dist-tag promotion to latest
```

The version is published once. Stable promotion changes registry metadata (`dist-tag`) only; it does not rebuild or republish package bytes. GitHub `release.yml`, `registry-smoke.yml` and `promote.yml` intentionally separate these trust boundaries.

The optional OpenAPI generator adapter has an independent admission lifecycle. A Candidate adapter does not become a Runtime Kernel dependency and does not block Foundation Stable when the default `contract=none` path remains isolated and fully validated.

## Kernel contracts

当前持续稳定的核心契约：

- `ApplicationDefinition`
- `ApplicationShell` / `ApplicationShellDefinition`
- `ApplicationModule`
- `FoundationRouteObject`
- `FoundationRouteMeta`
- `FoundationRuntimeConfig`
- `AuthAdapter`
- `AppError`

0.10.1 继续保持上述 Kernel Public Contract；CI/CD、Contract Tooling、Profile、Deployment 与发布治理均不得扩张 Runtime Kernel。

## Dependency and import policy

- Foundation -> Project：禁止。
- Capability -> `app`：禁止。
- `api` -> concrete auth/telemetry implementation：禁止。
- `@foundation/x/src/...` deep import：禁止。
- 外部项目中的 `workspace:*` / `catalog:` Foundation range：禁止。
- 1.0 前同一应用混用多个 Foundation minor line：禁止。

## Route single source of truth

```text
ApplicationModule
  -> Route Definition
      -> Router
      -> Navigation
      -> Breadcrumb
      -> Permission UX
```

## Distribution architecture

Workspace 内部 package 继续使用 `workspace:*`，由 pnpm pack/publish 转换为可发布依赖关系。外部项目只允许使用普通 semver 或经过验证的 tarball。

发布流程遵循：

```text
source
  -> full validation
  -> pack tarballs
  -> generated consumer installs tarballs
  -> release preflight/plan
  -> candidate registry tag
  -> clean external registry smoke
  -> Stable promotion
```

“测试的制品”和“发布的制品”必须一致。

## Upgrade policy

`foundation-doctor` 是迁移前后检查器，至少阻止：

- Foundation minor line 混用；
- deep import；
- workspace/catalog 协议泄漏；
- 缺失核心 Foundation app 依赖。

每个 pre-1.0 minor 若存在 breaking change，必须在 `docs/releases/<version>.md` 写清迁移动作。

## Non-goals

- Microfrontend
- Runtime remote plugins
- Low-code/Page Builder
- Backend-controlled React component routes
- Universal CRUD generator
- Universal backend task/upload protocol
- Service Locator
- Registry vendor lock-in

## Goal-first implementation policy (0.7+)

Foundation exists to make project frontends faster to start, cheaper to maintain, safer to upgrade and easier to validate. A specific library, including an OSS library, is never the goal.

Projects select domain-neutral **capabilities** (for example `data-table`, `forms`, `async-operation`) rather than implementation libraries. `@foundation/*` packages are the current public contracts for those capabilities; internal implementations may evolve without forcing every project to change architecture. See `docs/capabilities/CAPABILITY_MODEL.md`.

Maintainers must evaluate mature upstreams before expanding a commodity capability, but adoption is conditional. An OSS candidate is promoted only when measured PoCs show lower total maintenance cost, preserved Foundation contracts, acceptable bundle/runtime impact and a reversible migration. Otherwise the validated owned implementation stays in place.

Preferred implementation order is: direct upstream dependency when no Foundation contract is needed → thin Foundation adapter when organizational semantics are needed → maintained owned implementation when it is smaller/safer → maintained fork only as a last resort. Copying an application template per project is not platform reuse.

The 0.6 ProComponents/Refine work therefore remains a **shadow evaluation**, not a migration mandate.

## Goal-first delivery boundary (0.8)

Project capability, delivery and server infrastructure are separate axes:

```text
Project Goal
  -> Profile / Capabilities
  -> Foundation public contracts

Built SPA
  -> Delivery Target (none | nginx | future edge targets)

Backend/BFF
  -> Service Infrastructure (database/cache/queue/etc.)
```

Nginx is therefore an optional Delivery Target. Redis is deliberately outside Frontend Foundation and may only be selected by a backend/BFF architecture when a measured shared-state requirement exists. Neither decision is allowed to expand the Runtime Kernel public contract.

## Developer productivity boundary (0.9)

Developer productivity features remain outside the Runtime Kernel:

```text
@foundation/create-app
  -> create project
  -> foundation.config.json
  -> foundation-generate module
  -> src/modules/*/routes.ts (export const module)
  -> generated src/modules/index.ts discovers route definitions
  -> explicit ApplicationModule[] passed to @foundation/app
```

The Runtime Kernel does not scan files, read project manifests or know generator patterns. Convention-based discovery is generated Vite application code only. This preserves the explicit `ApplicationModule` runtime contract while eliminating repetitive registration edits in generated projects.

`foundation.config.json` is a tooling/governance manifest, not Runtime Config. It records the resolved capability profile, Foundation version, deployment target and module convention. Generated modules carry `foundation.module.json` with their required capabilities; Doctor checks that those requirements remain a subset of the project's resolved capabilities.

Custom Profiles are data-only JSON and may extend built-in/custom profiles additively. Built-in names cannot be overridden and inheritance cycles are rejected. Organization-specific Profile names therefore stay outside Foundation's global product taxonomy.

API contract generation follows the Goal-first/OSS-evaluated policy: Foundation will not own a partial OpenAPI parser/code generator. Mature upstream generators must be evaluated first; Foundation-specific integration may wrap their outputs around `ApiTransport`, `AppError`, trace and cancellation semantics.
