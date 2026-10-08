# ADR-018: Nginx is an optional delivery target

Status: Accepted in 0.8.0

## Context

Frontend Foundation builds Vite single-page applications. Production delivery needs a repeatable answer for BrowserRouter fallback, immutable hashed assets, mutable runtime configuration, health checks, compression, and an optional same-origin API proxy. These are delivery concerns, not application capabilities.

## Decision

Nginx is supported as an **optional Delivery Target**. It is not a Runtime Kernel dependency and is not part of a project capability profile.

`create-foundation-app --deployment nginx` generates:

- a pinned stable Nginx container image tag;
- SPA `try_files` fallback;
- immutable caching for `/assets/`;
- no-store/no-cache semantics for `/runtime-config.json`;
- revalidation for `index.html`;
- `/healthz` independent from backend health;
- gzip for text assets;
- minimal non-invasive security headers;
- runtime selection between an absolute API URL and an optional `/api` reverse proxy.

The default remains `--deployment none`. Projects may use CDN/object storage, IIS, Apache, Kubernetes ingress, a platform CDN, or another edge without violating Foundation architecture.

## Boundaries

- TLS certificates, HSTS and WAF policy belong to the owning edge/platform.
- CSP is intentionally not hardcoded because valid policies vary by embedding, analytics and CSS-in-JS requirements.
- Nginx API caching is disabled by default.
- WebSocket/SSE-specific proxy tuning is opt-in and should be added only when a project requires it.
- A relative `API_BASE_URL` requires `API_UPSTREAM`; otherwise startup fails instead of silently serving SPA HTML for API calls.

## Consequence

Deployment can evolve independently from Profile/Capability contracts, and projects do not become coupled to Nginx at runtime.
