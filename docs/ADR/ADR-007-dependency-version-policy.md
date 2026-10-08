# ADR-007: Dependency version policy

## Status

Accepted for Kernel 0.1.

## Context

The Foundation is infrastructure consumed by multiple applications. Automatic adoption of every new toolchain minor can create platform-wide breakage, especially for TypeScript/ESLint parser compatibility and build-system changes.

## Decision

- Runtime/framework libraries follow their selected stable major/minor policy and are locked exactly by `pnpm-lock.yaml` after the first connected install.
- TypeScript is intentionally constrained to the 6.0 patch line (`~6.0.2`) until the lint/parser toolchain explicitly supports and the Foundation validates the next TypeScript minor.
- Storybook remains on the 10.6 stable line; Storybook 10.3+ explicitly supports Vite 8.
- pnpm remains on the maintained pnpm 11 line for Foundation 0.1 even though pnpm 12 exists. Package-manager major upgrades are deliberate architecture/toolchain changes, not routine dependency refreshes.
- Node.js 24 LTS is CI/recommended; Node.js 22.13+ is the compatibility floor for the Kernel 0.1 toolchain.

## Consequences

- Renovation of TypeScript minor, pnpm major, Vite major, React major, React Router major, or Storybook major requires an explicit compatibility change and full consumer-test run.
- Patch updates remain routine but still pass the complete release gates.
- The committed lockfile is the exact reproducibility boundary once generated.


## 0.2 validation note
The repository `packageManager` is pinned to pnpm 11.7.0 because that exact binary is available in the current validation environment. A later 11.x uplift is a deliberate toolchain change after full install/build/consumer validation.
