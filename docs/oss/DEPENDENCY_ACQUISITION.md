# Acquiring OSS PoC Dependencies for Offline Cloud Validation

The existing Foundation Linux dependency snapshot does not contain the newly evaluated upstream packages. Do not rebuild or re-upload the full Foundation cache.

The next cloud phase only needs Linux-installable dependencies for these two isolated experiments:

- `experiments/oss-convergence/pro-components-poc`
- `experiments/oss-convergence/refine-core-poc`

## Preferred method (WSL/Linux)

From the 0.6 repository:

```bash
cd experiments/oss-convergence/pro-components-poc
pnpm install
cd ../refine-core-poc
pnpm install
cd ..
tar -czf foundation-oss-poc-linux-deps.tar.gz \
  pro-components-poc/node_modules \
  refine-core-poc/node_modules
```

Also include the two generated lockfiles if pnpm creates them.

The cloud validator can then run each PoC independently without adding either upstream to the production workspace.

## Why Linux bytes are preferred

Vite/esbuild and some transitive packages can contain platform-specific binaries. A Windows `node_modules` snapshot is useful for source/type inspection but is not sufficient evidence for Linux production builds.
