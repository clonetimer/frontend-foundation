# Kernel Compatibility — 0.21.0 Stable-Ready

0.21.0 is the Stable promotion line for the frozen 0.20/0.21 RC feature surface. It does not add Runtime features.

The completed 0.20 -> 0.21.0 SHA-256 review is:

```text
packages/{core,observability,security,api,theme,ui,app,testing}/src
old files = 62
new files = 62
changed   = 0
added     = 0
removed   = 0
```

The retained `@example/domain-widgets` workspace fixture and the independent package under `tooling/fixtures/secondary-domain-widgets` are validation-only assets outside the owned Runtime Kernel.

The reviewed 62-file Kernel baseline therefore remains authoritative and `pnpm oss:kernel-baseline` passes without re-baselining. The RC-to-Stable version change does not alter Kernel source bytes or public API snapshots.

Any Runtime source/API delta after this freeze is a new release line, not part of the 0.21.0 Stable promotion.
