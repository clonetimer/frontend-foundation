# Dependabot × pnpm 11 catalogs · Issue #68 admission contract

## Observed defect and scope

Dependabot npm PRs #7, #8, #50, #51 and #66–#72 advertised a package version bump, yet the new `pnpm-lock.yaml` still contained the **previous catalog resolution**. Their patches reordered importer entries and passed ordinary frozen-lockfile CI. Upstream Dependabot has catalog/lockfile issues (for example [#14339](https://github.com/dependabot/dependabot-core/issues/14339), [#14919](https://github.com/dependabot/dependabot-core/issues/14919)). The precise upstream cause of our repeated no-op cannot be proven from a GitHub PR diff alone.

This repair applies two independent controls. npm Dependabot now requests `versioning-strategy: increase`, which requests updated declared lower bounds rather than `increase-if-necessary`. This is a **candidate mitigation**, not an assertion that the upstream updater honors it. More importantly, the *Dependabot resolved-version admission* job fails any npm Dependabot PR without a verifiable actual lockfile version upgrade. No automatic merging has been enabled.

## Fail-closed policy

- Validate the `pnpm-workspace.yaml` `catalog:` declarations against the exact `pnpm-lock.yaml` `catalogs.default` specifiers. Reject omissions and malformed/unresolved versions.
- For a Dependabot npm PR titled `bump NAME from OLD to NEW`, require `OLD` in the **base** lockfile and `NEW` in the candidate catalog (if catalog-managed). Also require a new `packages:` resolution for that exact NAME and NEW. An unrelated dependency bump cannot satisfy it.
- For non-standard group/security-update titles, require at least one newly resolved package version in `packages:`. Reordering `importers:` never qualifies.
- The workflow reads the immutable PR base SHA from the GitHub event and fetches git history read-only. Never execute title text as a command or use contributor-controlled shell interpolation.
- The gate has no npm-registry write, no token use, no package installs, no `--no-frozen-lockfile`, and no `minimumReleaseAge` exception. Node tests for the parser run in ordinary CI even when the admission job is skipped for non-Dependabot PRs.

The admission job protects **npm Dependabot branches** only. It is not a full supply-chain integrity guarantee or a replacement for dependency-review, security scanning, exact-head CI and review. Package aliases or future lockfile schemas may need deliberate parser updates; unrecognized formats fail closed.

## Legitimate manual/catalog update procedure

If the Dependabot updater remains unable to update catalog entries, use an isolated feature branch (not `main`):

1. Update only the intended dependency version range in `pnpm-workspace.yaml` `catalog:`; keep Storybook packages aligned where applicable.
2. With the repository-pinned **pnpm 11.7.0** and supported Node 22/24, run `pnpm install --lockfile-only`. Verify its resulting `catalogs.default.NAME.version`, `packages: NAME@VERSION` and source catalog specifier. Do not assume a green command updated the targeted version.
3. Run `node tooling/scripts/dependabot-catalog-guard.mjs --check-catalog` and `node --test tooling/scripts/test-dependabot-catalog-guard.mjs`.
4. Run `pnpm install --frozen-lockfile` and the repository CI/Stable/Chromium checks on the exact feature HEAD, then merge and check `main` again.

The existing `minimumReleaseAge: 1440`, `catalogMode: strict`, build-script allowlist and frozen lockfile remain mandatory. Manual security exceptions require separate documented review; this change does not provide one.

## Reproduction / verification

```bash
node tooling/scripts/dependabot-catalog-guard.mjs --check-catalog
node --test tooling/scripts/test-dependabot-catalog-guard.mjs
```

The regression suite includes an importer-order-only lockfile change with a false upgrade title (must fail), an actual catalog/package upgrade (must pass), a catalog/package mismatch, a maliciously unrelated change, and a grouped/transitive update.

**Acceptance:** Exact-head CI including Linux/Windows release gates, Security and any path-triggered Stable/ZIP tests must pass. Confirm merged `main` afterward. Do not close Issue #68 until a fresh real Dependabot upgrade demonstrates that the updater itself reliably changes versions; the guard is the immediate fail-closed protection.
