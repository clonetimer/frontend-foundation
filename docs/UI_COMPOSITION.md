# UI Composition Foundation

Frontend Foundation 0.12 introduces a project-facing UI composition layer between the stable application/runtime contracts and project-generation / AI planning work.

## Goals

- Let projects choose different application chrome without forking the Runtime Kernel.
- Provide a small set of reusable page composition patterns before introducing a larger Blueprint DSL.
- Keep generated output as ordinary React/TypeScript source.
- Give future planners stable IDs for shells, patterns, and blocks instead of asking an LLM to invent arbitrary DOM/CSS.
- Preserve the 0.11 Resource Blueprint v1 behavior and generated module contract.

## Shell Contract

`ApplicationDefinition.shell` accepts either a built-in preset or a project-owned component:

```ts
createApplication({
  // ...
  shell: { preset: 'workspace' }
});
```

Built-in presets:

| Shell | Intended use |
| --- | --- |
| `sidebar` | management/admin/operations; compatibility default |
| `top-nav` | SaaS, product and portal applications |
| `workspace` | engineering, data, Agent and monitoring tools |
| `bare` | landing pages, maps, 3D canvases and embedded applications |

A custom shell receives routed content as `children` plus `ApplicationShellOptions`. The router remains responsible for route access/error boundaries; the shell owns application chrome and content geometry only.

Existing applications that do not set `shell` continue to use `sidebar`.

## Theme Contract

`BrandTheme` keeps the legacy `primaryColor`, `borderRadius`, and `fontFamily` fields and adds:

- `token` — broader Ant Design token overrides;
- `components` — Ant Design component token overrides;
- `layout` — Foundation shell geometry (`sidebarWidth`, `headerHeight`, `contentPadding`, `contentMaxWidth`).

This is still a project design-token contract, not a runtime theme DSL.

## Composition primitives

`@foundation/ui` exports:

### Blocks

- `PanelBlock`
- `MetricBlock`
- `MetricGrid`

### Patterns

- `DashboardPattern` / `DashboardBlock`
- `MasterDetailPattern`
- `SplitPanePattern`
- `WorkspacePattern`

These are intentionally small layout/composition primitives. They do not own project data fetching, permissions, domain state or backend contracts.

## Tooling catalog

The published create-app tooling contains a serializable Composition Catalog:

```bash
foundation-generate --list-composition
```

This returns stable IDs for shell, pattern, and block choices. Project Blueprint and future AI planners should target these IDs first and fall back to project-owned React only when the catalog cannot express the requirement.

## Project generation

Create a project with an explicit shell:

```bash
create-foundation-app operations-ui --profile data-workbench --shell workspace
```

Generate composition-oriented modules:

```bash
foundation-generate module overview --pattern dashboard --title "Overview"
foundation-generate module explorer --pattern master-detail --title "Explorer"
foundation-generate module simulation --pattern workspace --title "Simulation"
```

The existing `page`, `management`, `data-workbench`, and Resource Blueprint generators remain available.

## Deliberate non-goals for 0.12

- richer Project Blueprint block-instance composition beyond current page Pattern selection
- runtime page builder
- arbitrary JSON-to-React renderer
- drag-and-drop editor
- AI directly writing an entire project without deterministic generation
- generated-source regeneration/merge lifecycle
- responsive visual regression automation

Those concerns are staged for later versions after the composition contract is proven.
