# Upgrading Foundation applications

## Compatibility rule before 1.0

All `@foundation/*` packages in one application stay on the same minor line. Mixing `0.9.x` and `0.10.x` is a migration error even when package-manager resolution succeeds.

## Inspect first

```bash
foundation-doctor . --target 0.10.0 --strict
```

Doctor checks mixed minor lines, monorepo protocol leakage, deep imports, runtime config, tooling drift, `foundation.config.json`, resolved Profile requirements, module conventions/manifests, and declared deployment assets.

## Plan/apply dependency alignment

`foundation-upgrade` is intentionally narrow. Default is dry-run:

```bash
foundation-upgrade . --target 0.10.0
foundation-upgrade . --target 0.10.0 --write
```

When `foundation.config.json` exists, `--write` updates both:

- Foundation version ranges in `package.json`;
- `foundation.config.json.foundationVersion`.

It never rewrites application source. Source migrations required by a pre-1.0 minor release must be documented in that release note.

After a write:

```bash
pnpm install
foundation-doctor . --target 0.10.0 --strict
pnpm typecheck
pnpm test
pnpm build
```

## 0.9 module convention adoption

0.9 does not require existing projects to adopt filesystem module discovery. Newly generated projects use:

```text
src/modules/
  index.ts
  <module>/
    routes.ts
    foundation.module.json
    pages/...
```

`src/modules/index.ts` aggregates exported `module` route definitions with Vite `import.meta.glob`. `@foundation/app` still receives an explicit `ApplicationModule[]`; no Runtime Kernel migration is involved.

Projects adopting the 0.9 workflow should commit `foundation.config.json` and run Doctor strict after moving modules.

## Rollback

Treat the previous `package.json` + `pnpm-lock.yaml` + `foundation.config.json` as one rollback unit. For private registries, do not delete immutable bad versions: move the application back to the previous Foundation version/lockfile/config or move the registry promotion tag to the last accepted version.

Tarball/offline deployments retain the previous `artifacts/packages/manifest.json` and `.tgz` set until the new version has passed deployment smoke.

## Public API rule

Import only package public exports:

```ts
import { Page } from '@foundation/ui';
```

Deep imports such as `@foundation/ui/src/...` are unsupported and block upgrades.

## 0.10 contract-tooling adoption

Existing projects remain `contract=none`; there is no Runtime migration. To adopt OpenAPI tooling, prefer regenerating project metadata with the documented 0.10 contract fields or add the same fields deliberately, pin the selected adapter exactly, generate once, and commit `foundation.contract.lock.json`.

When upgrading a contract-enabled project to the current Foundation line, `foundation-upgrade --write` aligns the adapter package/version metadata as well as Foundation package ranges. It does not regenerate contracts or rewrite project API source; run `pnpm foundation:contract` and review the generated diff explicitly.

0.10 does not enable OpenAPI 3.0 or 3.2 for the Candidate adapter. Do not bypass this by editing `supportedOpenApi` in generated project metadata; change the Foundation adapter policy only after semantic evaluation.
