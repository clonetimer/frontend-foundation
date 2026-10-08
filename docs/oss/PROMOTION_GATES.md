# OSS Promotion Gates

These are project governance thresholds for 0.6; they are not claims about the upstream projects.

## ProComponents gate

Promote ProComponents into production dependencies only when the Management Pilot comparison shows all of the following:

- semantic typecheck, tests and production build pass;
- zero Kernel public-contract changes;
- no Ant Design downgrade and no React Router downgrade;
- at least **25% reduction** in organization-owned LOC across the compared management UI surface (`ui + data + forms + pilot glue`), after including any adapters we must maintain;
- no increase in Foundation public exports for the replacement layer;
- management-route gzip bundle increase no greater than **200 KiB** versus the baseline unless a documented UX capability justifies it;
- API/AppError/trace semantics remain owned by Foundation, not hidden in ProTable request conventions.

## Refine Core gate

Promote Refine Core only when all apply:

- Core-only PoC typecheck/tests/build pass with React 19;
- no dependency on `@refinedev/antd` or `@refinedev/react-router` for the current baseline;
- no Ant Design 5 or React Router 7 downgrade;
- API transport, timeout/cancel, Problem Details, AppError and trace-id behavior are preserved;
- total Refine bridge/adapter code is at most **200 LOC**;
- project-owned data/auth/access glue drops at least **20%** across the Management Pilot;
- Foundation Kernel contracts do not change merely to fit Refine's resource model.

## Reject / defer conditions

A candidate is rejected or deferred when its adapter layer becomes comparable in size to the code it replaces, when it requires a platform major-version downgrade, or when it increases public-contract surface without a measurable project-level reduction.
