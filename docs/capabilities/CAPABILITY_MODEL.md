# Capability Model

Frontend Foundation is goal-first. Projects select capabilities; they do not select implementation libraries.

## Stable user-facing model

A project is described by domain-neutral capabilities such as:

- application-shell
- ui-patterns
- data-table
- forms
- permission
- api-transport
- file-transfer
- async-operation
- visualization

`@foundation/*` packages are the current public contracts for those capabilities. An upstream OSS package can replace an internal implementation only after the existing OSS promotion gates pass.

## Ownership modes

- `strategic-owned`: Foundation intentionally owns the behavior because it encodes organization-level semantics or recurring engineering requirements.
- `replaceable-implementation`: Foundation owns the public contract, but the implementation may be backed by a mature upstream when that demonstrably reduces total maintenance cost.

A replaceable capability does **not** imply an OSS migration. The current implementation remains the default until a candidate wins the measured comparison.

## Profiles

`create-foundation-app --profile ...` is a convenience layer over capabilities:

- `minimal`: application shell + UI patterns
- `management`: minimal + data table + forms + permission
- `data-workbench`: minimal + file transfer + async operation + visualization

Profiles contain no business-domain concepts and are intentionally small. Projects may add further Foundation packages after creation.

## Replacement rule

A project must not import OSS convergence candidates merely because a candidate is being evaluated. Promotion happens behind the Foundation contract or through an explicit migration release after scorecard approval.
