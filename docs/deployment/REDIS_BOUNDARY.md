# Redis boundary

Redis is **not** part of Frontend Foundation 0.8.

The browser already has local UI state, URL state and TanStack Query server-state caching. Adding Redis would not improve those layers; it would introduce a backend infrastructure dependency into a frontend product.

Evaluate Redis only when a concrete server-side requirement appears: distributed sessions, rate limiting, shared cache, background jobs, pub/sub/streams, or another measured shared-state need. At that point the decision belongs to the backend/BFF/platform architecture and should compare viable implementations rather than assume Redis in advance.

See `ADR-019-redis-service-boundary.md`.
