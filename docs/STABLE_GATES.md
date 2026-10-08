# Stable release gates

A version is not Stable merely because package builds succeed.

## Repository / code gates

- connected or internal-mirror `pnpm install --frozen-lockfile`;
- `pnpm github:verify`;
- `pnpm verify:offline`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build` (Foundation packages, Starter, Showcase and both regression Pilots);
- `pnpm release:api`;
- `pnpm storybook:build`;
- `pnpm deploy:smoke` for Nginx;
- `pnpm consumer:test` using packed Foundation tarballs;
- `pnpm release:preflight`;
- `pnpm release:plan`;
- completed release note with no `TODO` placeholders.

The cloud/isolation validation may use the explicit offline consumer mode for third-party dependencies, but GitHub Stable promotion must also demonstrate a connected fresh install.

## GitHub CI gate

The exact release commit must pass the checked-in GitHub workflows:

- `Static gates (no install)`;
- `Node 22 compatibility`;
- `Node 24 release gates`;
- Security / CodeQL and dependency review as applicable.

The Node 24 release gate performs a frozen connected install, full release checks, Nginx runtime smoke, Storybook, packed consumer, preflight/plan and artifact upload.

## Registry gate

1. publish the exact version once under a non-`latest` `candidate` dist-tag;
2. install that exact version from the target registry into a clean external application;
3. run Doctor strict, TypeScript and production build;
4. only then move the accepted exact version to `latest` with dist-tag promotion.

Do not republish the same version for Stable promotion.

## Regression Pilot gate

Two domain-neutral applications remain in the repository as regression consumers:

- `@foundation/pilot-management`: Table + Form + Permission;
- `@foundation/pilot-data`: File + Async + Visualization.

A Foundation change must not require application-specific Kernel hooks merely to keep these Pilots working.

## Public API gate

`tooling/release/public-api.snapshot.json` records named public exports from every publishable TypeScript Foundation package. Additions/removals require an intentional `pnpm release:api -- --write` update and release-note explanation. Deep imports remain unsupported.

## Release artifact gate

Each packed tarball must have matching byte-size and SHA-256 metadata in `artifacts/packages/manifest.json`; registry publication rejects tampered artifacts.

`pnpm pack:foundation` verifies each library has the declared `exports.import` and `exports.types` files and rejects unexpectedly large library entry bundles before producing tarballs. Consumer validation consumes packed tarballs, not workspace source folders.

## Goal-first profile gates

Every Stable candidate validates:

- `minimal`;
- `management`;
- `data-workbench`.

For each profile:

```text
create-foundation-app
  -> profile capability check
  -> packed Foundation tarballs
  -> TypeScript typecheck
  -> Vite production build
  -> foundation-doctor --strict
```

`management` smoke-imports Data/Form/Permission contracts. `data-workbench` smoke-imports File/Async/Visualization. Custom Profile support stays pure JSON and outside Runtime Kernel.

## Delivery gates

Nginx must pass `pnpm deploy:verify` and real HTTP behavior through `pnpm deploy:smoke`: SPA fallback, runtime config, health check, cache boundaries and optional `/api` proxy.

Redis is not a Frontend Foundation Stable gate because it is a server-side shared-state concern.

## Developer-productivity gates

The packed create/generate/Doctor/upgrade path must remain valid. `foundation-upgrade` keeps dependency ranges, `foundation.config.json.foundationVersion` and current pinned contract-adapter metadata aligned without source rewrites.

## Contract productivity gate

Contract tooling remains optional: `contract=none` projects have zero generator runtime/dependency cost.

The Hey API adapter in 0.10.1 remains **Candidate**, not Stable/default. Its independent admission requires real exact-pinned upstream bytes, representative correctness fixtures, dependency security policy, TypeScript 6 compile, deterministic regeneration and packed-consumer validation. A fake adapter only validates Foundation orchestration and does not satisfy upstream semantic admission.

A Candidate adapter does not block Foundation Stable when it is opt-in, isolated from Runtime Kernel and cannot be marked `stable` unless admission status is `passed`.

## Governance gate for 1.0

Before a future **1.0 Stable**:

- at least two materially different real applications use the platform (repository Pilots are regression tests, not substitutes for real adoption);
- at least one successful Foundation upgrade of a real application;
- frozen Kernel public contracts;
- documented deprecation and rollback policies;
- private-registry candidate smoke and promotion runbook demonstrated in the target organization.
