# ADR-004 — Toolchain stability over newest-major adoption

## Status
Accepted for Foundation Kernel 0.1.

## Decision

- CI targets Node.js 24 LTS; Node.js 22.13+ remains supported during Kernel 0.1.
- Stay on the maintained pnpm 11 line for Kernel 0.1 even though pnpm 12 is available.
- Pin TypeScript 6.0.x for Kernel 0.1 even though TypeScript 7 is available.
- Use current stable application/runtime majors: React 19, React Router 8, Vite 8 and Ant Design 6.
- Set `verifyDepsBeforeRun: warn`: scripts never trigger an implicit dependency install; installation remains an explicit developer/CI step.

## Rationale

The workspace keeps `minimumReleaseAge: 1440`; dependency ranges should therefore not require a package published inside that quarantine window. Security-sensitive package-manager patches may be adopted explicitly after review.

Foundation 0.1 is establishing public contracts, package boundaries, publishing semantics and consumer verification. Migrating the package manager and compiler major at the same time would add compatibility variables without improving the Kernel contracts themselves.

The next-major adoption gate is therefore evidence-based: all core dependencies, lint/type tooling, Storybook, declaration publishing and the packed consumer test must pass on the candidate major before the baseline is raised.

## Consequence

The repository may deliberately lag the newest TypeScript/pnpm major. This is not a permanent freeze; it is a stability policy for the first public Foundation contract.


## 0.2 validation note
The repository `packageManager` is pinned to pnpm 11.7.0 because that exact binary is available in the current validation environment. A later 11.x uplift is a deliberate toolchain change after full install/build/consumer validation.
