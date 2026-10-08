# Changelog

## 0.21.0 — Stable-Ready Promotion

- Removed the prerelease suffix from the frozen 0.21 RC line without adding product capability.
- Added explicit RC-to-Stable upgrade regression (`^0.21.0-rc.1` -> `^0.21.0`) while preserving application source.
- Retained the 62-file owned Runtime Kernel and public API snapshot byte-for-byte/API-stable from the accepted RC evidence.
- Re-ran offline, TypeScript/lint/test/build, Storybook, dual Domain SDK, packed-consumer and delivery-artifact gates on the final semver line.
- Added `docs/STABLE_ACCEPTANCE_0_21.md` to hand off unrestricted browser/visual, GitHub exact-commit and target-registry promotion evidence without falsely marking those external gates as passed.
- `0.21.0` must remain under the `candidate` dist-tag until the delegated external acceptance passes; Stable promotion is a dist-tag move of the same immutable bytes.

## 0.21.0-rc.1 — RC Convergence

- Froze the 0.20 Blueprint/Designer/Runtime feature surface; 0.21 RC accepts validation and defect fixes only.
- Added a second independently authored Domain Component SDK validation package outside the workspace product graph.
- Added compiler regression proving the second Registry works with distinct select/number/boolean bindings, no-payload events, boolean events and a child-accepting block.
- Extended Designer Chromium smoke with `DESIGNER_SMOKE_URL` so the same browser assertions can target an externally hosted preview when managed Chromium blocks localhost.
- Removed stale Designer beta-version UI text and aligned active examples/tests with the RC line.
- Added explicit RC readiness and Designer browser acceptance runbooks.
- Runtime Kernel contract remains frozen; any unexpected Runtime source delta is an RC blocker.

## 0.20.0 — Domain Component SDK Candidate

- Added `foundation-domain init / verify / merge` as a package-engineering workflow over Custom Registry v1.
- Added package admission for metadata identity, version compatibility, explicit/built exports and npm pack contents.
- Added a retained `@example/domain-widgets` regression package with InteractiveViewer, TimeSeriesChart and AnalysisSection.
- Added real Storybook rendering and Designer metadata regression for domain components.
- Replaced the initial product-specific SDK fixture with a domain-neutral `@example/domain-widgets` fixture and added a source-level domain-neutrality governance gate.
- Added Custom Registry regression to the dependency-independent clean-ZIP offline gate.
- Kept the Runtime Kernel unchanged from the reviewed 0.19 baseline.

## 0.19.0 — Designer Validation / Extensibility Candidate

- Added optional project-level `foundation.registry.json` for namespaced custom Widgets/Blocks.
- Added governed custom component properties, Binding types, semantic events, named exports and child-accepting blocks.
- Project Compiler now emits normal static imports, adds declared component package dependencies and hashes registry input for drift detection.
- Designer now loads project registries into the same Palette/Property/Binding/Event contract while using safe previews instead of executing project component code.
- Added browser-safe live diagnostics and `foundation-project diagnose --json` machine-readable compiler diagnostics.
- Added custom Registry container drag/drop support and required-property-via-Binding semantics.
- Added real Node 22 / pnpm dependency-backed TypeScript 6, lint, test, production build, Designer build and Storybook build validation.
- Fixed two existing `@foundation/ui` strict optional-property typing defects discovered by the real TypeScript 6 gate; no new Runtime feature was introduced.
- Added Chromium Designer smoke tooling; the current container policy blocks local navigation, so browser E2E remains an explicit environment-limited gate rather than a false pass.

## 0.18.0 — Designer Engineering Beta Candidate

- Added Blueprint-level undo/redo with redo-branch invalidation and saved-state dirty tracking.
- Added reference-safe rename for Node, State, Action, Data Source and Operation identities.
- Replaced Action/Data Source/Operation JSON cards with structured graphical editors.
- Added Desktop/Tablet/Mobile authoring viewport presets and keyboard/non-drag structural editing paths.
- Added private browser-safe `@foundation/design-model` shared authoring contract package.
- Moved the canonical Composition Registry into Design Model and added byte-for-byte `create-app` mirror verification.
- Added history/reference-rename regression and retained Designer -> Project Compiler round-trip coverage.
- Runtime Kernel `packages/{core,observability,security,api,theme,ui,app,testing}/src` remains unchanged.

## 0.17.0 — Visual Designer PoC Candidate

- Added private `@foundation/designer` workspace app over the existing Project Blueprint model.
- Added Registry-backed Layout/Widget Palette, Object Tree, Canvas and Property Inspector.
- Moved Designer-editable Layout/Widget property metadata into the same machine-readable Composition Registry, removing a duplicated hard-coded Inspector catalog.
- Added drag/drop insertion and reparenting with cycle prevention and split-capacity enforcement.
- Added typed Binding and named Event/Action inspectors over existing page state/actions.
- Added Page Model authoring for State, Actions, Data Sources and Operations.
- Added exact JSON source mode and browser File System Access open/save with import/download fallback.
- Added a minimal browser-side Project Blueprint shape guard so malformed JSON is rejected before the Designer attempts to render it.
- Added Designer model destructive tests, file round-trip tests and Designer -> Project Compiler regression.
- Added Designer build script and release-preflight workspace/lockfile governance.
- Runtime Kernel `packages/*/src` remains byte-for-byte unchanged from 0.16.0.

## 0.16.0 — Data / Operation Candidate

- Added governed API-relative HTTP Data Sources to Project Blueprint visual pages.
- Added Operations with state-backed query/body values, pending/error lifecycle state and response-to-state assignments.
- Added `invoke` and internal `navigate` Action steps with static reference and safety validation.
- Compiler now emits ordinary `useApiTransport`, async request functions and `useNavigate`; no runtime Blueprint interpreter was introduced.
- Added machine-readable Data/Operation metadata to the Composition Registry for future graphical authoring.
- Added regeneration/ownership tests covering Operation changes and human-modified scaffold protection.
- Runtime Kernel `src/` remains byte-for-byte aligned with the reviewed 0.15 owned baseline.

## 0.15.0 — Action / Binding Candidate

- Added typed page-local state to Project Blueprint visual pages.
- Added Registry-governed Widget property bindings and semantic events.
- Added named Action sequences with `set`, `toggle`, `increment`, and `reset` steps.
- Added static validation for state/action references, event-value availability, and type compatibility.
- Compiler now emits ordinary React `useState` and callbacks; Blueprint still contains no executable JavaScript.
- Expanded `ButtonWidget`, `InputWidget`, and `SelectWidget` with additive controlled/callback props.
- Added machine-readable event/binding metadata for future graphical authoring tools.
- Added Mission Console interaction example and Action/Binding integration tests.

## 0.14.0 — Visual Composition Candidate

- Added a build-time recursive Visual Composition tree to Project Blueprint pages.
- Added governed `stack`, `grid`, `split`, and `tabs` layout modules.
- Added governed `panel`, `text`, `button`, `input`, `select`, `metric`, and `placeholder` visual widgets.
- Added ordinary React runtime primitives in `@foundation/ui`; the browser does not interpret Blueprint JSON.
- Added stable visual-node trace IDs in compiled TSX for future graphical editors and deterministic repair tooling.
- Added strict visual property validation, depth/node limits, split/tab invariants, and rejection of executable event-code strings.
- Kept existing page Patterns as high-level presets and Resource Blueprint v1 as a separate input.
- Updated the Mission Console example and Storybook source coverage to exercise Visual Composition.

## 0.13.0 — Project Blueprint Candidate

- Added `foundation.project.json` Project Blueprint v1 and formal JSON Schema.
- Added `foundation-project validate`, `compile`, `status`, and `init`.
- Added staging-first deterministic project compilation with a zero-write conflict plan.
- Added `generated-owned`, `scaffold-once`, and `human-owned` file ownership semantics for safe regeneration.
- Added project/resource input hashes and managed-file state, with Doctor drift detection.
- Added conservative migration planning/adoption for existing 0.12-style Foundation projects.
- Added module generator support for `split-pane`, explicit index routes, and independent navigation labels.
- Kept Resource Blueprint v1 separate and reused it as a Project Blueprint input.
- Runtime Kernel source is intended to remain byte-for-byte aligned with the reviewed 0.12 owned baseline.
- Hardened the create-app packaged template so generated `.gitignore` survives real `npm pack` publication.

## 0.12.0 — UI Composition Candidate

- Replaced the hard-coded router/AppShell binding with an additive application Shell Contract.
- Added built-in `sidebar`, `top-nav`, `workspace`, and `bare` shells; `sidebar` remains the compatibility default.
- Added broader theme token/component-token/layout-token support while preserving legacy brand fields.
- Added reusable UI composition blocks and Dashboard/Master-detail/Split-pane/Workspace patterns.
- Added create-app `--shell` / `--list-shells` and generator `--list-composition`.
- Added `dashboard`, `master-detail`, and `workspace` module generator patterns.
- Added Doctor validation for shell metadata and new ADR/UI composition documentation.
- Preserved Resource Blueprint v1 semantics.
- This release intentionally changes 16 Runtime Kernel source files in `app/theme/ui`; full Stable gates must be rerun.

## 0.11.0 — Resource Blueprint Candidate

- Added Resource Blueprint v1 as an explicit build-time JSON input for conventional management resources.
- Added `foundation-generate resource <resource.json>` to generate ordinary editable list/detail/edit React modules, typed request helpers and module metadata.
- Generated resource HTTP calls continue to use `@foundation/api` `ApiTransport`; permission-aware edit actions use `@foundation/security` without moving authorization to the browser.
- Added strict relative API-path validation, `{id}` placeholder rules, PUT/PATCH-only update methods and `generatorVersion: 1` resource metadata.
- Doctor now checks normalized resource SHA-256 drift, generator metadata and required generated files.
- Management Profile explicitly carries `error-model` and `api-transport` capabilities/packages required by generated resource code.
- Packed consumer validation now generates a real Resource Blueprint module and compiles it from 0.11 tarball bytes.
- Runtime Kernel `src/` remains byte-for-byte unchanged from 0.10.1 Local Stable.

## 0.10.1 — Stable-Ready RC

- Added GitHub Actions for CI, Node 22/24 validation, CodeQL/dependency review, Storybook Pages, Candidate publication, target-registry smoke and Stable dist-tag promotion.
- Added `pnpm github:verify` and repository gates for GitHub CI/CD safety invariants.
- Added `pnpm release:promote`; Stable promotion now changes `latest` using `dist-tag` rather than republishing immutable tarballs.
- Added automated real Nginx HTTP smoke with SPA fallback, runtime-config/cache and API proxy checks.
- Added explicit offline packed-consumer support while still requiring newly packed Foundation tarball bytes.
- Hardened `foundation-upgrade` to realign the current exact Contract Adapter metadata.
- Added Contract Adapter admission policy/audit gates while keeping Hey API Candidate/opt-in.
- Release Preflight now rejects release-note `TODO` placeholders.
- Runtime Kernel `src/` remains byte-for-byte unchanged from 0.10.0.

## 0.10.0 — Contract Productivity Candidate

- Added opt-in local JSON/OpenAPI 3.1 Contract Pipeline tooling, deterministic source/output lock hashes and project-side `ApiTransport` facade.
- Added Contract-to-Module governance without adding a Foundation-owned OpenAPI parser or generated HTTP runtime.
- Added Candidate Contract Adapter admission boundaries and kept the default `contract=none` workflow zero-cost.
- Runtime Kernel source remained unchanged from 0.9.


## 0.9.0 — Developer Productivity Candidate

- Added `foundation.config.json` as a resolved project tooling manifest, separate from runtime configuration.
- Added convention-based module discovery in newly generated Vite applications without changing `@foundation/app`.
- Added publishable `foundation-generate` CLI and capability-gated `page`, `management`, and `data-workbench` module patterns.
- Added `foundation.module.json` manifests and Doctor checks for module pattern/capability drift.
- Added data-only custom Profile inheritance with built-in override/cycle protection.
- Added local generated-project scripts for Doctor, Generator and Upgrade tooling.
- Hardened `foundation-upgrade` so project manifest version metadata stays aligned and already-aligned `@foundation/app` dependencies are valid.
- Added ADR-020 for the module-generation boundary and ADR-021 explicitly rejecting a Foundation-owned partial OpenAPI generator.
- Runtime Kernel source remains byte-for-byte unchanged from 0.8.

## 0.8.0 — Delivery Readiness Candidate

- Added a deployment dimension independent from capability Profiles.
- Added `--deployment nginx` and `--list-deployments` to create-app.
- Added generated Nginx/Docker delivery assets with SPA fallback, cache boundaries, runtime configuration, health check, gzip and optional `/api` proxy.
- Added deployment checks to Doctor, repository verification, offline verification and release preflight.
- Added ADR-018 for the Nginx delivery boundary and ADR-019 keeping Redis outside Frontend Foundation until a server-side requirement justifies it.
- Runtime Kernel public APIs remained unchanged.

## 0.7.0 — Goal-First Candidate

Added a capability registry and domain-neutral `minimal`, `management`, and `data-workbench` project profiles. OSS evaluation is explicitly subordinate to Foundation goals: mature upstreams must be evaluated, but are adopted only when measured PoCs beat the validated owned implementation. Profile drift is checked by `foundation-doctor`; all three profiles are release-preflight/consumer-test targets.

## 0.6.0 — OSS Convergence Candidate

Introduced isolated ProComponents and Refine Core shadow PoCs, OSS decision/migration governance and quantitative promotion gates while keeping production dependencies and Kernel frozen.

## 0.5.0 — Stable Readiness Candidate

Dependency lock freeze, two regression Pilots, public-API snapshot governance, safe `foundation-upgrade`, package-size/artifact-integrity gates, and packed-tarball external-consumer validation.

## 0.4.0 — Productization Candidate

Publishable create-app CLI, project doctor, release preflight/planning/versioning, tarball-first publication, registry guidance and Stable governance gates.

## 0.3.2 — Candidate

File, Async and Visualization capabilities plus cloud hardening and initial create-app tooling.
