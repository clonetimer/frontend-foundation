# OSS Convergence — 0.6

Status: Candidate design and shadow-PoC phase  
Snapshot date: 2026-10-05

## Purpose

Frontend Foundation 0.1–0.5 established the contracts, quality gates, release tooling and two pilot applications needed to know what the platform actually requires. 0.6 changes the default implementation policy from **build-first** to **OSS-first**.

The goal is not to replace a working Foundation with a GitHub template. The goal is to stop owning commodity code when a maintained upstream can satisfy the same contract with acceptable coupling.

## Decisions

1. **Ant Design ProComponents is approved for the first shadow PoC.** It is aligned with Ant Design 6 and React 19-era applications and directly targets enterprise CRUD patterns.
2. **Refine Core is approved for a gated headless PoC.** We evaluate Data/Auth/AccessControl providers only.
3. **Do not adopt `@refinedev/antd` in this phase.** Its current package still targets Ant Design 5.
4. **Do not adopt `@refinedev/react-router` in this phase.** Its current peer range targets React Router 7, while Foundation uses React Router 8.
5. **Ant Design Pro is a benchmark, not the Foundation upstream.** It is a strong application reference but is coupled to Umi Max 4 and is still an application template rather than a package-based organization platform.
6. **React Admin is benchmark-only.** Its maturity is useful for comparison, but switching the platform to Material UI / RR6–7 would create more migration cost than it removes.

## What is allowed to change in 0.6

Shadow PoCs, benchmark tooling, migration plans and dependency research may be added. Existing stable Foundation packages remain intact until an OSS PoC passes the replacement gates.

## What is not allowed to change yet

- `ApplicationDefinition`, `ApplicationModule`, route metadata and runtime-config contracts.
- Foundation API transport / AppError / trace semantics.
- File, Async Operation and Visualization capabilities.
- Release, Doctor, Upgrade and tarball consumer gates.
- Production package dependencies on Refine or ProComponents before PoC promotion.

## Replacement hypotheses

These are hypotheses to test, not committed removals.

| Current owned area | OSS candidate | Expected outcome |
|---|---|---|
| `@foundation/data` | ProTable | Replace most table/search/pagination UI glue; keep organization-specific error/query adapters only if required. |
| `@foundation/forms` | ProForm | Replace layout/field boilerplate; retain AppError → field-error adapter if still useful. |
| AppShell presentation in `@foundation/app` | ProLayout | Potentially replace menu/layout presentation while retaining runtime/kernel composition. |
| selected `@foundation/ui` patterns | ProCard / ProDescriptions / ProSkeleton | Reduce owned high-level presentation primitives. |
| Query/data resource glue | Refine Core Data Provider | Evaluate whether it reduces project code without fighting OpenAPI/AppError semantics. |
| auth/access glue | Refine Core Auth/AccessControl Provider | Evaluate bridgeability to existing AuthAdapter and permission semantics. |
| Router integration | existing Foundation RR8 | Retain for this phase; Refine router adapter is not on RR8 today. |

## Promotion gates

An OSS candidate can replace Foundation code only if all apply:

- Both Management Pilot and Data Workbench Pilot remain buildable.
- No regression to Ant Design 5 or React Router 7.
- Runtime Config, AppError, trace-id, API timeout/cancel semantics remain intact.
- Owned LOC/Public API is materially reduced, not merely moved into wrappers.
- No new global service locator or framework-specific business coupling is introduced.
- Bundle impact is measured.
- Upstream license and release cadence are acceptable.
- Migration and rollback are documented.
- Existing `foundation-doctor`, upgrade and tarball consumer gates continue to work.

## Target architecture if the PoCs pass

```text
Project modules
    |
    +-- ProComponents (layout/table/form/presentation)
    |
    +-- optional Refine Core (data/auth/access only where beneficial)
    |
    +-- Thin Foundation
          |- Runtime/App composition
          |- API + AppError + Trace
          |- Async
          |- File policy
          |- Visualization
          |- Theme semantic tokens
          |- create-app / doctor / upgrade / release governance
```

The intended end state is a **thin organization platform**, not a competing frontend framework.
