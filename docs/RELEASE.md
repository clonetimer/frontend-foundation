# Release workflow

## 1. Set version

```bash
pnpm release:version -- <version>
```

This synchronizes the root and every `@foundation/*` workspace manifest and creates a release-note template if missing.

## 2. Complete the release note

`docs/releases/<version>.md` must describe scope, compatibility/migration and gate status. `release:preflight` rejects release notes that still contain `TODO` placeholders.

## 3. Review public API

```bash
pnpm release:api
```

If a deliberate public export change is part of the release, update the snapshot explicitly and document it:

```bash
pnpm release:api -- --write
```

## 4. Preflight and plan

```bash
pnpm release:preflight
pnpm release:plan
```

Preflight validates version alignment, lockfile presence, regression Pilots, public API snapshot, publish metadata, create-app independence, completed release notes, contract-adapter admission state, internal dependency ranges and publish graph integrity.

## 5. Full validation and immutable pack

```bash
pnpm release:pack
```

The release path runs code/test/build gates, packed consumer validation and Storybook before producing verified tarballs. `artifacts/packages/manifest.json` records each tarball filename, byte size and SHA-256.

## 6. Publish Candidate only

Dry-run:

```bash
FOUNDATION_REGISTRY=https://registry.example.invalid/ \
  pnpm release:publish -- --tag candidate
```

Execute only after review:

```bash
FOUNDATION_REGISTRY=https://registry.example.invalid/ \
  pnpm release:publish -- --tag candidate --execute
```

GitHub `release.yml` follows this rule and never publishes directly as `latest`.

## 7. Clean registry smoke

Install the exact Candidate from the target registry in a clean external project and run Doctor strict, TypeScript and production build. GitHub `registry-smoke.yml` automates this gate.

## 8. Promote immutable bytes to Stable

Do **not** republish the same version. Promote the already-published Candidate with a dist-tag:

```bash
FOUNDATION_REGISTRY=https://registry.example.invalid/ \
  pnpm release:promote -- --tag latest
# dry run

FOUNDATION_REGISTRY=https://registry.example.invalid/ \
  pnpm release:promote -- --tag latest --execute
```

GitHub `promote.yml` puts this action behind the `stable-promotion` environment.

## 9. Rollback

Package bytes are immutable. Rollback means moving the `latest` dist-tag back to the previously accepted version and reverting consuming projects. Never overwrite an already-published version.

See `docs/STABLE_PROMOTION.md` for the exact Stable runbook.
