# Stable promotion runbook

A source tree can be called **Stable-ready** only after all repository and browser gates pass. It becomes **Stable** only after the external GitHub + registry evidence below exists for the exact immutable version.

## 1. Select the exact candidate version and commit

Do not modify package source or lockfile after the release artifact is selected. Record the version, commit SHA and package artifact manifest/checksums.

## 2. GitHub exact-commit validation

The exact commit must pass the checked-in workflows, including static gates, Node compatibility/release gates and applicable security/dependency review jobs. The connected release job must perform a frozen install rather than relying only on an offline dependency snapshot.

## 3. Publish immutable Candidate packages

Publish the exact version once under the non-`latest` `candidate` dist-tag. Never publish an RC/Candidate directly as `latest` and never republish the same version with different bytes.

## 4. Clean target-registry smoke

From a clean external project, install the exact `@foundation/create-app@<version>` from the target registry, generate a representative application and run Doctor strict, TypeScript and production build. Run the organization-required Designer browser acceptance against an allowed host.

## 5. Promote the accepted immutable bytes

Review the dry-run promotion plan, then move the exact accepted version to `latest` with npm-compatible dist-tag promotion. Promotion must not rebuild or republish package tarballs.

## 6. Git release metadata

Create the repository tag/release for the exact promoted commit and attach or reference the immutable artifact manifest/checksums and validation evidence.

## 7. Rollback

Package bytes are immutable. Rollback means moving `latest` back to the previously accepted version and reverting consuming applications. Never overwrite an already-published version.

## Stable decision

Only after GitHub exact-commit, Candidate publication, clean target-registry smoke, browser acceptance and dist-tag promotion succeed may the version be described as Stable.
