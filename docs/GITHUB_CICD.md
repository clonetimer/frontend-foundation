# GitHub CI/CD setup

0.10.1 ships GitHub Actions as repository source. They are intentionally split by responsibility rather than collected into one privileged workflow.

## Workflows

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | PR/main static checks, Node 22 compatibility and Node 24 release gates |
| `.github/workflows/security.yml` | dependency review and CodeQL |
| `.github/workflows/pages.yml` | build and deploy Storybook to GitHub Pages |
| `.github/workflows/release.yml` | validate, pack and optionally publish immutable `candidate` tarballs |
| `.github/workflows/registry-smoke.yml` | install the exact candidate from the target registry into a clean external project |
| `.github/workflows/promote.yml` | promote the already-published version to `latest` with `npm dist-tag`, never by republishing |

`pnpm github:verify` checks the required GitHub files and key safety invariants locally and is included in `pnpm verify:offline`.

## Repository configuration required in GitHub

Create these Environments:

- `release` — protect registry publication and registry smoke;
- `stable-promotion` — require manual approval before changing the `latest` dist-tag;
- `github-pages` — created/used by GitHub Pages deployment.

Configure the repository/environment secret:

- `NPM_TOKEN` — token accepted by the selected npm-compatible private registry.

The concrete registry URL is **not** committed. Operators provide `registry_url` through workflow inputs.

## Branch protection / ruleset recommendation

Protect `main` and require successful PR checks corresponding to:

- `Static gates (no install)`;
- `Node 22 compatibility`;
- `Node 24 release gates`;
- `CodeQL`;
- dependency review on pull requests that change dependencies.

Also require pull requests and prevent force-pushes to the protected release branch. Exact branch/ruleset names remain repository-owner policy and are not hard-coded into Foundation.

## GitHub Pages

Set Pages source to **GitHub Actions**. `pages.yml` publishes `apps/storybook/storybook-static` after a frozen install and Storybook production build.

## Stable promotion sequence

Use `docs/STABLE_PROMOTION.md`. Stable promotion is deliberately not automatic on every merge to `main`.
