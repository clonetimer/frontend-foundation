# @foundation/app

Composition root for Foundation applications: bootstrap, runtime config, modules, routes, feature flags, QueryClient defaults and configurable application shells.

## Shells

`createApplication` accepts `shell: 'sidebar' | 'top-nav' | 'workspace' | 'bare'` or a project-owned shell definition. Omitting `shell` preserves the compatibility `sidebar` shell.

```ts
createApplication({
  // ...
  shell: { preset: 'workspace' }
});
```

## Install

```bash
pnpm add @foundation/app
```

Use only exports from the package root; deep imports are unsupported. See the repository architecture and release documentation for compatibility policy.
