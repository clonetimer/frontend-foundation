# Private registry and artifact distribution

Frontend Foundation supports two distribution channels without hard-coding a registry vendor.

## Channel A — private npm-compatible registry

Configure the `@foundation` scope in the consuming environment. Do not commit credentials into this repository.

Example user/CI `.npmrc`:

```ini
@foundation:registry=https://registry.example.invalid/
always-auth=true
//registry.example.invalid/:_authToken=${FOUNDATION_NPM_TOKEN}
```

The concrete URL/token are deployment concerns. GitHub workflows accept `registry_url`; authentication is supplied through the protected `NPM_TOKEN` secret.

### Candidate → Stable lifecycle

```text
verified tarballs
  ↓
publish version once with dist-tag candidate
  ↓
clean install/smoke from target registry
  ↓
dist-tag add exact-version latest
```

Candidate publication:

```bash
FOUNDATION_REGISTRY=https://registry.example.invalid/ \
  pnpm release:publish -- --tag candidate --execute
```

Stable promotion:

```bash
FOUNDATION_REGISTRY=https://registry.example.invalid/ \
  pnpm release:promote -- --tag latest --execute
```

Never attempt to publish the same immutable version a second time with `--tag latest`; npm-compatible registries normally reject duplicate version publication.

## Channel B — tarball / air-gapped delivery

`pnpm pack:foundation` writes immutable tarballs plus `artifacts/packages/manifest.json`.

A consuming project can install selected tarballs directly:

```bash
pnpm add ./artifacts/packages/foundation-app-0.10.1.tgz
```

For air-gapped deployments, preserve the complete artifact directory and its checksums. Do not copy source folders into consumer projects.

The offline consumer test may reuse a verified third-party dependency snapshot, but all `@foundation/*` packages under test must still come from the newly packed tarballs.

## Principle

The object validated by packed-consumer tests is the object intended for publication. Release tooling therefore publishes tarballs rather than rebuilding ad hoc at publish time.
