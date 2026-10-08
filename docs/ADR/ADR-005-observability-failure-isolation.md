# ADR-005: Observability is failure-isolated

## Status

Accepted for Kernel 0.1.

## Decision

Telemetry is best-effort infrastructure. Failures inside a custom telemetry adapter must never alter application, API, routing, or error-handling control flow.

Foundation therefore wraps telemetry adapters with a safety boundary and API error callbacks are also invoked defensively.

## Consequences

- Application errors retain their original semantics even if the telemetry backend is unavailable.
- Telemetry failures are intentionally swallowed at the Foundation boundary; telemetry implementations must monitor their own delivery health externally when required.
- Foundation code must not make application availability depend on Sentry/OpenTelemetry/vendor-specific SDK availability.
