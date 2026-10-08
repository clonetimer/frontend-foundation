# ADR-006: API transport is infrastructure-only and callback-injected

## Status

Accepted for Kernel 0.1.

## Decision

`@foundation/api` depends only on `@foundation/core`. It does not import authentication or observability packages.

Authentication credentials and error observation are injected through narrow callbacks (`getAccessToken`, `onError`). The application package is the composition root that connects Auth, Runtime Config, Telemetry, and API Transport.

The transport normalizes network/timeout/cancellation/HTTP/auth-token-acquisition failures to `AppError`. Custom backend error mappers are advisory; if they fail, the deterministic default mapper is used.

## Consequences

- API transport remains reusable outside a specific auth/telemetry implementation.
- Package cycles are avoided.
- Observability callbacks cannot turn a server error into a network error or otherwise change request semantics.
