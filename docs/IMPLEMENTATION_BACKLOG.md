# Implementation Backlog

## 0.1 Kernel

- [x] Workspace / package boundaries
- [x] `core`, `observability`, `security`, `api`, `theme`, `ui`, `app`, `testing`
- [x] Runtime Config / bootstrap / Module / Route / Navigation / Permission
- [x] Starter / Showcase / Consumer Test
- [x] Offline architecture and repository checks

## 0.2 Data / Forms

- [x] controlled `DataTable` / `DataToolbar`
- [x] Form layout/field/actions/error bridge
- [x] list/edit Showcase vertical slice
- [x] connected `pnpm install` completed on Windows
- [x] offline check reached ESLint after install
- [x] 0.2.4 includes lint/tooling/build-script-policy corrections
- [ ] 0.2.4 full connected `pnpm check` was intentionally deferred into the next consolidated validation run

## 0.3.2 Candidate — File / Async / Visualization + hardening + project generator

### File

- [x] `@foundation/file`
- [x] file type/size/count validation
- [x] drag/click file selection
- [x] transfer status/progress list
- [x] invariant unit tests
- [x] Showcase + Storybook scenario

### Async

- [x] `@foundation/async`
- [x] generic operation status model
- [x] abortable polling helper
- [x] progress/status panel
- [x] log viewer
- [x] helper/polling tests
- [x] overall timeout/cancellation remains deterministic even if `load()` ignores AbortSignal
- [x] Showcase + Storybook scenario

### Visualization

- [x] `@foundation/visualization`
- [x] ECharts peer dependency
- [x] chart lifecycle + ResizeObserver
- [x] theme/renderer re-init re-applies option/loading state
- [x] Foundation theme reinitialization
- [x] loading/error/empty `ChartPanel`
- [x] `TimeSeriesChart` + option builder test
- [x] Showcase + Storybook scenario

### Cloud hardening

- [x] API external-cancel vs timeout first-cause semantics
- [x] pre-aborted API request skips token acquisition
- [x] Async Poll enforces overall deadline against non-cooperative loaders
- [x] EChart theme/renderer reinitialization preserves option/loading
- [x] pnpm 11 non-auth settings moved from `.npmrc` to `pnpm-workspace.yaml`
- [x] repository check rejects generated JS/maps inside Foundation `src/`
- [x] repository check validates Foundation version alignment and app imports


### Project generation / release consumption

- [x] Experimental `@foundation/create-app` CLI
- [x] standalone tsconfig/runtime config generation
- [x] Browser/Hash router generation
- [x] dependency snapshot sync test
- [x] generated-app pure Node contract tests
- [x] packed consumer now starts from create-app output
- [~] generated app install/build — design complete; cloud registry blocked

### 0.3 release validation

- [x] offline architecture check
- [x] repository integrity check
- [x] TypeScript AST syntax parse
- [x] tooling `.mjs` syntax check
- [x] packed consumer source updated to consume File/Async/Visualization
- [~] `pnpm install` — attempted in cloud; blocked by registry DNS/network (`EAI_AGAIN`), not by dependency resolution
- [~] `pnpm check` — offline/independent subsets pass; dependency-linked gate blocked by registry access
- [ ] `pnpm consumer:test`
- [ ] `pnpm storybook:build`
- [ ] browser smoke test

## Deferred

- SchemaForm
- runtime plugin / microfrontend
- low-code/page builder
- universal upload protocol
- SSE/WebSocket-specific async adapters
- domain-specific chart annotations


## 0.4.0 Candidate — Productization

- [x] Publishable `@foundation/create-app`
- [x] `foundation-doctor` compatibility checks
- [x] Workspace version synchronization
- [x] Release metadata preflight
- [x] Topological publish plan
- [x] Tarball-first dry-run/execute publisher
- [x] Private-registry and air-gapped distribution guide
- [x] Stable gates / upgrade / deprecation policy
- [x] Per-package README + Node engines metadata
- [ ] Dependency-linked `pnpm check`
- [ ] Packed consumer install/build
- [x] Storybook production build
- [ ] Target-registry candidate smoke

## 0.12.0 Candidate — UI Composition Foundation

- [x] decouple hard-coded `AppShell` from router root
- [x] additive `ApplicationDefinition.shell` contract
- [x] `sidebar`, `top-nav`, `workspace`, `bare` built-in shells
- [x] custom project-owned shell support
- [x] broader design/component/layout theme tokens
- [x] UI block catalog (`Panel`, `Metric`, `MetricGrid`)
- [x] page patterns (`Dashboard`, `MasterDetail`, `SplitPane`, `Workspace`)
- [x] create-app `--shell` / `--list-shells`
- [x] generator Composition Catalog / composition module patterns
- [x] Doctor shell metadata checks
- [x] reset OSS isolation to explicit current owned-Kernel baseline after planned Kernel evolution
- [x] dependency-free offline governance/tooling verification
- [ ] dependency-backed strict typecheck / Vitest / production builds
- [ ] Storybook visual coverage for all shell presets and composition primitives
- [ ] packed consumer validation from 0.12 tarballs
- [ ] responsive / visual-regression gate

## 0.13.0 Candidate — Project Blueprint / Project Compiler

- [x] define `foundation.project.json` schema separate from Runtime Config
- [x] model shell, navigation, theme, pages, resources and composition IDs
- [x] deterministic Blueprint validator + compiler
- [x] compile in staging before target-project mutation
- [x] generate ordinary project source without a runtime JSON page renderer
- [x] ownership model: generated-owned / scaffold-once / human-owned
- [x] zero-write conflict planning before synchronization
- [x] Blueprint and Resource-input drift detection in Doctor
- [x] existing-project `init` migration plan from `foundation.config.json`, module manifests and Resource Blueprints
- [x] explicit generated-owned takeover for first migration compile
- [x] `split-pane` and explicit index-route generator coverage needed by project compilation
- [x] formal Project Blueprint v1 JSON Schema + example project
- [x] preserve 0.12 Runtime Kernel owned baseline
- [ ] dependency-backed strict typecheck / package Vitest / production builds
- [ ] packed consumer validation from 0.13 tarballs
- [x] Storybook production build

## 0.14.0 Candidate — Visual Composition Model

- [x] recursive page composition tree in Project Blueprint
- [x] stable visual node identity and trace markers in generated TSX
- [x] Layout Registry: stack / grid / split / tabs
- [x] Widget Registry: panel / text / button / input / select / metric / placeholder
- [x] strict component-property whitelists and structural invariants
- [x] compile composition to ordinary TSX; no runtime schema renderer
- [x] keep Pattern generation as a high-level preset path
- [x] published example + Storybook source coverage
- [ ] dependency-backed strict typecheck / package Vitest / production builds
- [x] Storybook production build
- [ ] browser visual/responsive regression

## 0.15.0 Candidate — Actions / bindings

- [x] explicit event/action model; do not embed arbitrary code strings in Blueprint
- [x] page-local typed state/property binding model
- [x] build-time HTTP Data Source / Operation v1 for visual pages
- [x] `invoke` / internal `navigate` Action steps and pending/error/result state wiring
- [ ] direct data-source property bindings and contract-derived response typing
- [x] machine-readable Widget binding/event signatures in Composition Registry
- [ ] richer domain-neutral Widget/Block Registry after measured use cases
- [ ] design preset catalog and project-level theme selection
- [ ] graphical editor proof-of-concept over the same composition + action graph (palette / object tree / property inspector / signal-action connections)
- [ ] requirement/PRD/OpenAPI planner as one optional authoring adapter, not the sole input path
- [ ] compiler diagnostics suitable for deterministic repair loops
- [ ] evaluate semantic extension points before adding any source-merge mechanism

## 0.16.0 Candidate — Data / Operation Model

- [x] governed API-relative HTTP Data Source declarations
- [x] Operation query/body state references without arbitrary expressions
- [x] pending/error lifecycle state
- [x] JSON/text response-to-state assignments
- [x] `invoke` and internal `navigate` Action steps
- [x] static safety/type/reference validation
- [x] machine-readable operation capability registry
- [x] ordinary React/TypeScript compilation using existing `@foundation/api`
- [x] preserve 0.15 Runtime Kernel owned baseline
- [ ] automatic query/polling/cancellation model
- [ ] contract-derived operation typing
- [ ] first graphical Designer PoC over Layout/Widget/Property/Binding/Event/Action/Data models

## 0.17.0 Candidate — Visual Designer PoC

- [x] private browser-based Designer workspace app
- [x] use existing Project Blueprint as the only authoring document
- [x] Registry-backed Layout / Widget Palette
- [x] Registry-owned editable property metadata shared by Palette / Property Inspector
- [x] Object Tree with stable Blueprint node IDs
- [x] Canvas preview using Foundation UI primitives
- [x] Palette drag/drop insertion
- [x] existing-node reparenting with cycle prevention
- [x] split-layout child-capacity enforcement
- [x] node reorder / delete operations
- [x] property inspector over governed v1 properties
- [x] typed Binding inspector
- [x] named Event -> Action inspector
- [x] Page State / Action / Data Source / Operation authoring surface
- [x] exact Blueprint JSON source mode
- [x] File System Access open/save with import/download fallback
- [x] Designer model destructive regression tests
- [x] Designer -> Project Blueprint -> Project Compiler round-trip regression
- [x] Designer workspace/lockfile/release-preflight governance
- [x] preserve 0.16 Runtime Kernel owned baseline
- [ ] real dependency-backed Designer TypeScript typecheck/build
- [ ] browser E2E drag/drop and file workflow tests
- [ ] visual regression and responsive viewport preview
- [ ] undo/redo command history
- [ ] reference-safe rename for nodes/state/actions
- [ ] dedicated graphical Action/Operation editor
- [ ] shared browser-safe design-model/Registry package before Designer stabilization



## 0.18.0 Candidate — Designer Engineering Beta

- [x] extract browser-safe Design Model / Composition Registry contract from tooling ownership
- [x] undo/redo command history with deterministic Blueprint patches
- [x] reference-safe rename for node/state/action/data-source/operation IDs
- [x] graphical Action step editor (set/toggle/increment/reset/invoke/navigate)
- [x] graphical Data Source / Operation editor with lifecycle/result wiring
- [x] viewport presets and responsive canvas preview
- [x] keyboard/non-drag parity for structural editing
- [ ] browser E2E for drag/drop, open/save/import/download and compiler round-trip
- [ ] visual regression coverage for Designer canvas/inspectors
- [ ] only after measured Designer friction: extend the Blueprint model where existing abstractions are insufficient


## 0.19.0 Candidate — Designer Validation / Extensibility

- [x] custom project Widget/Block Registry extension contract
- [x] Registry-driven custom Properties / Bindings / Events
- [x] child-accepting project blocks in Designer structural editing
- [x] custom Registry input hashing and generated dependency/import compilation
- [x] machine-readable `foundation-project diagnose --json`
- [x] browser-safe live diagnostics panel with compiler-style categories
- [x] real dependency-backed TypeScript 6 / lint / test / production build / Storybook build
- [x] add Chromium Designer smoke command and screenshot path
- [ ] run browser smoke in an environment without local-navigation organization policy
- [ ] visual regression baselines for Desktop / Tablet / Mobile Designer states
- [ ] import/schema-upgrade conflict UX
- [ ] evaluate graph-canvas Action/Operation editing against the ordered structured editor
- [ ] add responsive Blueprint semantics only if measured project use cases require them

## 0.20.0 Candidate — Domain Component SDK / Designer Validation

- [x] `foundation-domain init` component-package scaffold
- [x] package-level Custom Registry admission
- [x] package/version/export/pack validation with stable diagnostics
- [x] deterministic multi-package Registry merge
- [x] retained `@example/domain-widgets` domain fixture
- [x] real InteractiveViewer / TimeSeriesChart / child-accepting AnalysisSection components
- [x] Designer metadata regression against a real domain Registry
- [x] Storybook real-component preview coverage
- [x] preserve the reviewed 0.19 Runtime Kernel baseline
- [ ] unrestricted Chromium Designer E2E / screenshot baselines
- [x] measure a second independent domain component package before stabilizing the SDK vocabulary (closed by 0.21 RC convergence)
- [ ] optional Registry package discovery only if manual merge becomes measurable friction; do not add runtime plugin loading


## 0.21.0-rc.1 — RC Convergence

- [x] freeze Blueprint / Designer / Runtime feature scope
- [x] add second independently authored Domain Component SDK validation package
- [x] add second Registry -> Project Compiler round-trip coverage
- [x] add externally hosted Designer browser-smoke target (`DESIGNER_SMOKE_URL`)
- [x] remove stale Designer version label and align active RC examples
- [x] real dependency-backed lint / TypeScript 6 / tests / production builds
- [x] Storybook production build
- [x] both Domain SDK package build/export/pack admissions
- [x] packed consumer validation for all three profiles
- [x] Release Preflight / Plan / Public API / Kernel baseline
- [ ] unrestricted real-browser Designer smoke + screenshot evidence
- [ ] connected GitHub exact-commit and target-registry Candidate smoke (external Stable evidence)

No new Blueprint/Designer feature is admitted on the RC line unless a validation blocker proves the existing contract is insufficient; such a change returns the line to Candidate development.

## 0.21.0 — Stable promotion closure

Scope is frozen. No new Blueprint/Designer/Runtime feature belongs to this line.

Completed in source/artifact closure:

- final semver synchronization to `0.21.0`;
- prerelease-to-Stable upgrade regression;
- Stable release note and external acceptance handoff;
- repeat offline / real workspace / packed-consumer / artifact-reverse gates;
- Kernel/public API freeze verification.

Delegated external acceptance before `latest` promotion:

- unrestricted real-browser + visual baseline evidence;
- connected GitHub exact-commit workflows;
- target-registry Candidate smoke;
- immutable `0.21.0` candidate -> `latest` dist-tag promotion.
