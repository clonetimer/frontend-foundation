# Performance and package-size baseline — 0.5.0

This baseline separates **publishable Foundation library size** from **application bundle size**. They are different concerns and must not be conflated.

## Hard release gate: Foundation library entry bundles

`pnpm pack:foundation` rejects any publishable TypeScript Foundation library whose declared `exports["."].import` entry exceeds **100 KiB uncompressed**. This protects consumers from accidental bundling of React, ReactDOM, Ant Design, ECharts, or other peer dependencies into Foundation packages.

0.5.0 measured entry sizes:

| Package | `dist/index.js` |
| --- | ---: |
| `@foundation/core` | 1.04 KiB |
| `@foundation/api` | 5.47 KiB |
| `@foundation/theme` | 2.16 KiB |
| `@foundation/ui` | 3.58 KiB |
| `@foundation/security` | 1.48 KiB |
| `@foundation/observability` | 1.08 KiB |
| `@foundation/app` | 13.68 KiB |
| `@foundation/async` | 5.43 KiB |
| `@foundation/data` | 1.74 KiB |
| `@foundation/file` | 5.43 KiB |
| `@foundation/forms` | 2.98 KiB |
| `@foundation/testing` | 3.09 KiB |
| `@foundation/visualization` | 3.27 KiB |

The `@foundation/app` entry had previously reached ~812 KiB when `react-dom/client` was accidentally bundled. The externalization fix reduced it to 13.68 KiB; the 100 KiB release gate prevents this class of regression.

## Application bundle observations

The following are regression observations, **not universal product budgets**. Real applications have different route density and visualization requirements.

### Starter

Largest generated chunks:

- shared AntD/runtime chunk: ~544.9 KiB raw;
- application index chunk: ~280.5 KiB raw;
- Home lazy route: ~44.8 KiB raw.

### Showcase

- Visualization lazy route: ~1.09 MiB raw (ECharts-heavy, isolated behind a lazy route);
- shared UI chunk: ~548.9 KiB raw;
- Records list route: ~160.1 KiB raw.

### Regression Pilots

- Management Pilot largest chunk: ~603.1 KiB raw;
- Data-workbench Pilot visualization route: ~1.27 MiB raw.

The large visualization chunks are expected from the current full ECharts peer. They remain outside Foundation library bundles and behind route-level lazy loading. A modular ECharts-core build may be evaluated later **only if real application measurements justify narrowing the generic `EChart` contract**.

## Policy

1. The 100 KiB Foundation library entry limit is a hard release gate.
2. React/ReactDOM/AntD/ECharts remain peer/external dependencies for libraries.
3. Large application features should remain route-lazy by default.
4. Application budgets should be set from a real application's deployment profile, not from arbitrary framework-wide numbers.
5. Any change that increases a Foundation library entry by more than 25% should be reviewed even when still below 100 KiB.
