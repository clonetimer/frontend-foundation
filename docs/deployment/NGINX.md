# Nginx delivery target

## Generate

```bash
create-foundation-app my-project --profile management --deployment nginx
```

or inside the Foundation repository:

```bash
pnpm create:app ../my-project -- --profile management --deployment nginx
```

Deployment is independent from the project Profile.

## Modes

### Absolute API URL

Build the SPA once, then configure the container per environment:

```bash
pnpm build
docker build -f deploy/nginx/Dockerfile -t my-project:local .
docker run --rm -p 8080:8080 \
  -e APP_ENVIRONMENT=production \
  -e API_BASE_URL=https://api.example.com \
  my-project:local
```

The browser calls the API directly; the API owns CORS policy.

### Same-origin `/api`

```bash
docker run --rm -p 8080:8080 \
  -e APP_ENVIRONMENT=production \
  -e API_BASE_URL=/api \
  -e API_UPSTREAM=http://backend:8080 \
  my-project:local
```

Nginx proxies `/api/*` without stripping the `/api` prefix.

## Cache contract

| Path | Policy | Reason |
|---|---|---|
| `/assets/*` | 1 year + immutable | Vite filenames are content hashed |
| `/index.html` | no-cache/revalidate | discover new deployment asset graph |
| `/runtime-config.json` | no-store/no-cache | environment configuration changes independently from build |
| `/healthz` | no application dependency | frontend container liveness |

## Why CSP/HSTS are not generic defaults

HSTS requires the operator to own HTTPS for the relevant domain. CSP can legitimately differ for embedded applications, analytics, fonts and CSS-in-JS. These policies should be set by the project/security edge rather than hidden inside a reusable frontend template.

## Validation

```bash
pnpm deploy:verify
```

This verifies generated assets, runtime-mode selection and Nginx syntax when a local `nginx` binary is available.
