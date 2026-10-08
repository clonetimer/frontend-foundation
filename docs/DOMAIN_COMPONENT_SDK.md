# Domain Component SDK — 0.20

## Goal

The Domain Component SDK turns the 0.19 Custom Registry contract into a repeatable component-package engineering workflow. A project can own specialized React components (overview viewers, telemetry charts, editors, scientific visualizations, etc.) without modifying the Foundation Runtime Kernel.

The SDK remains **compile-time / authoring-time infrastructure**. The Visual Designer reads metadata only and does not import arbitrary project packages. Generated applications use normal static React imports.

## Package contract

A domain package contains ordinary React source plus a package-level `foundation.registry.json`:

```text
@example/domain-widgets
├── package.json
├── foundation.registry.json
├── src/
│   ├── InteractiveViewer.tsx
│   ├── TimeSeriesChart.tsx
│   └── index.ts
└── dist/
```

The registry uses the same v1 Custom Registry schema accepted by a project. Each entry must declare:

- namespaced component ID;
- npm package name and compatible version/range;
- named public export;
- governed property metadata;
- bindable scalar state types;
- semantic events;
- optional `acceptsChildren` container behavior.

## CLI

`@foundation/create-app` now publishes the `foundation-domain` binary.

### Scaffold

```bash
foundation-domain init packages/domain-widgets \
  --package @example/domain-widgets \
  --namespace example
```

The generated starter is a strict TypeScript/React ESM package with a buildable `DomainPanel`, package-level registry, `dist` export contract and `domain:verify` script.

### Verify / admission

```bash
npm run build
foundation-domain verify . --built --pack
foundation-domain verify . --built --pack --json
```

Admission verifies:

1. npm package identity/version/type/exports;
2. React peer dependency;
3. publish-file allowlist includes `dist` and `foundation.registry.json`;
4. Registry normalization and package identity;
5. component version range includes the package version;
6. named exports are explicit in `src/index.ts`;
7. built ESM entry can actually be imported and exposes every Registry export;
8. `npm pack --dry-run --json` contains the Registry plus declared JS/type entry points.

Stable diagnostic codes are:

- `DOMAIN_PACKAGE_INVALID`
- `DOMAIN_REGISTRY_INVALID`
- `DOMAIN_EXPORT_MISSING`
- `DOMAIN_PACK_INVALID`

### Merge package registries

Projects can combine package-level fragments without hand-editing one large Registry:

```bash
foundation-domain merge \
  packages/domain-widgets/foundation.registry.json \
  packages/lab-widgets/foundation.registry.json \
  --out foundation.registry.json
```

The merged output is normalized with the existing Custom Registry collision/version checks.

## Retained domain-neutral fixture

`packages/domain-widgets-fixture` is a private workspace regression fixture published under the package name `@example/domain-widgets` for local engineering validation. It contains:

- `example.interactive-viewer` → `InteractiveViewer`
- `example.time-series-chart` → `TimeSeriesChart`
- `example.analysis-section` → `AnalysisSection` (`acceptsChildren: true`)

The package is compiled with TypeScript, admitted with `foundation-domain verify --pack`, and rendered as real React components in Storybook. The Visual Designer still renders safe metadata-driven authoring placeholders/containers.

This split deliberately validates both sides:

```text
Foundation Designer                     Domain package engineering
(metadata only)                         (real component implementation)
       |                                           |
       +----------- foundation.registry.json ------+
                           |
                    Project Compiler
                           |
                static package import
```

## Safety and ownership boundaries

The SDK does **not** add:

- runtime plugin loading;
- remote component execution;
- arbitrary JavaScript in Registry metadata;
- dynamic package installation from the Designer;
- a second project document beside `foundation.project.json` / `foundation.registry.json`.

Domain packages own implementation quality, accessibility, performance, tests and release lifecycle. Foundation owns the metadata contract, admission tooling, Designer authoring behavior and static compilation boundary.

## Stable-candidate gates

A domain component package intended for real project use should pass:

```text
typecheck
build
foundation-domain verify --built --pack
Storybook or equivalent preview validation
project compile/doctor with the emitted registry
```

The retained `@example/domain-widgets` fixture exercises all of these except unrestricted browser screenshot automation, which remains blocked by the hosted Chromium navigation policy documented in `VALIDATION.md`.
