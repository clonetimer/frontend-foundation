# 0.21.0 Stable acceptance handoff

This document separates the Stable closure completed inside the source delivery from the external acceptance explicitly delegated to the user.

## Frozen release object

- final semver: `0.21.0`
- feature surface: frozen from `0.21.0-rc.1`
- Project Blueprint schema: `1`
- Custom Registry schema: `1`
- owned Runtime Kernel: 62 reviewed source files
- new Runtime feature/API changes from RC to Stable: none

Do not modify source or lockfile after selecting the immutable publication bytes. Any code change requires a new candidate/RC cycle.

## Completed before handoff

The delivery must show PASS for:

1. dependency-independent offline verification;
2. release preflight and exact-version release plan;
3. public API snapshot and Kernel baseline;
4. TypeScript 6, ESLint, workspace tests and production builds;
5. Designer and Storybook production builds;
6. two independent Domain Component SDK admissions;
7. three tarball-based consumer profiles;
8. clean-source `@foundation/create-app` pack/compile/Doctor smoke;
9. final ZIP reverse acceptance and repository manifest match.

See `VALIDATION.md` for the measured evidence.

## User-owned external acceptance

### A. Real local/browser validation

Use a machine/browser without the hosted-container localhost policy restriction.

```bash
pnpm designer:build
pnpm designer:browser-smoke
```

Or host the built Designer over an accepted HTTPS origin and run:

```bash
DESIGNER_SMOKE_URL=https://<accepted-host>/ pnpm designer:browser-smoke
```

Retain evidence for at least:

- Palette add;
- node selection/property edit;
- Undo/Redo;
- custom Registry widget presence;
- Desktop / Tablet / Mobile viewport;
- screenshot baselines / visual comparison;
- open/save flow required by the target environment.

### B. GitHub exact-commit validation

Push/tag the exact source commit corresponding to the immutable package bytes. Run the checked-in GitHub CI/security/release workflows with a frozen connected install. Record the commit SHA and successful workflow URLs.

### C. Target registry candidate smoke

Publish the exact `0.21.0` package bytes once under the `candidate` dist-tag. Do not publish as `latest` yet and never overwrite the same version.

From a clean external project, install the exact version from the target registry and run at minimum:

```text
create app
foundation-doctor --strict
TypeScript semantic typecheck
production build
```

### D. Stable promotion

Only after A/B/C pass, move the same immutable `0.21.0` version from `candidate` to `latest` with dist-tag promotion. Do not rebuild or republish package tarballs.

## Stable decision

- Source/artifact closure status before external acceptance: **Stable-Ready**.
- Final product status after A/B/C/D succeed on the exact bytes/commit: **Stable**.
- If any external check exposes a contract defect, do not promote; fix it on a new RC and repeat frozen gates.
