# OSS Convergence Shadow PoCs

These experiments are deliberately **outside the pnpm workspace**. They do not affect the validated 0.5 runtime or release packages until the upstream dependencies are acquired and the PoCs pass promotion gates.

- `pro-components-poc`: ProLayout + ProTable + ProForm comparison.
- `refine-core-poc`: headless Data/Auth/AccessControl comparison, no Refine UI/router adapter.
- `ant-design-pro-benchmark`: benchmark instructions only; no source vendoring.

The manifests pin research-snapshot versions. They are not production dependency policy.
