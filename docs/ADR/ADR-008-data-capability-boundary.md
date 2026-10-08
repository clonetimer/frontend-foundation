# ADR-008: Data Capability Boundary

## Status
Accepted for 0.2.

## Decision
`@foundation/data` is a UI capability, not a server-state framework. It may depend on `core` and `ui`, but it must not depend on `@foundation/app`, React Router, TanStack Query, or a project API.

The first stable surface is controlled `DataTable` + `DataToolbar`. Projects own URL state, Query keys, API calls and domain filters, then pass the resulting state into the capability.

## Consequences
- Data components remain reusable in pages backed by Query, local data or other sources.
- Router and server-state APIs are not duplicated inside Foundation.
- A future `QueryTable` must justify any additional dependency before promotion to stable API.
