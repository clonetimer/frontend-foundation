# ADR-019: Redis stays outside Frontend Foundation

Status: Accepted in 0.8.0

## Context

Redis is useful for shared server-side state such as caches, sessions, distributed rate limits, job coordination, pub/sub and streams. None of those concerns belongs inside a browser SPA runtime by default.

## Decision

Frontend Foundation has **zero Redis dependency and zero Redis public API**.

Redis becomes a project/platform evaluation item only when a server-side component has a concrete requirement such as:

1. shared session state across stateless backend replicas;
2. distributed per-user/per-tenant rate limiting;
3. measured backend cache pressure that benefits from a shared cache;
4. background job coordination or queue semantics;
5. pub/sub, stream processing or ephemeral shared real-time state.

When such a trigger exists, evaluate the server-side requirement and available implementations at that time. Do not introduce Redis merely because a frontend uses async operations or charts.

## Explicit non-use cases

Redis is not used for:

- browser state management;
- frontend runtime configuration;
- React/TanStack Query cache replacement;
- storing browser authentication tokens;
- Foundation feature flags;
- static asset caching;
- Nginx SPA routing.

## Consequence

A future BFF/backend platform may adopt Redis (or another compatible shared-state implementation) without changing Frontend Foundation public contracts.
