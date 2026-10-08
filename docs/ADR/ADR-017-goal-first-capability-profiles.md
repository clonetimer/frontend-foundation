# ADR-017 — Goal-first capability model and project profiles

Status: Accepted (0.7.0)

## Context

0.6 introduced mandatory evaluation of mature OSS before expanding commodity capabilities. That corrected a build-everything-in-house bias, but “OSS-first” can be misread as an adoption objective in its own right.

Frontend Foundation's actual objective is faster project startup, lower lifecycle cost, stable contracts, reproducible upgrades and good fit for management/data/engineering applications.

## Decision

1. Project requirements are expressed as domain-neutral capabilities, not implementation libraries.
2. `@foundation/*` packages remain the public capability contracts until an explicit migration release changes a contract.
3. Mature OSS must be evaluated before expanding a commodity capability, but adoption requires measured superiority under the OSS promotion scorecard.
4. A validated owned implementation remains preferable when it is smaller, safer or better aligned with Foundation semantics.
5. `create-foundation-app` exposes capability profiles (`minimal`, `management`, `data-workbench`) rather than upstream-library profiles.
6. Profiles must not introduce business-domain models and must remain independently verifiable through packed Foundation artifacts.

## Consequences

- ProComponents and Refine remain candidates, not mandatory platform dependencies.
- Internal implementation changes can be made behind Foundation contracts without forcing projects to change profile or architecture.
- Foundation Doctor can detect profile dependency drift.
- Profile growth requires capability-registry changes and validation rather than arbitrary generator options.

## Supersedes / clarifies

This ADR clarifies ADR-013. ADR-013's requirement to evaluate maintained upstreams remains valid; any interpretation that OSS adoption itself is the goal is superseded by this ADR.
