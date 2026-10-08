# Visual Designer Validation / Extensibility

## Purpose

The Visual Designer is a browser-based authoring frontend for the existing Project Blueprint. It borrows the productive GUI-builder model of **Palette + Object Tree + Canvas + Property Inspector + signal/action wiring**, while preserving Foundation's compile-to-source architecture.

It is not a PyQt input adapter, it is not a runtime low-code renderer, and it does not persist a private canvas format.

## Single source model

The Designer edits the same structures consumed by the Project Compiler:

- `pages[].composition` — layout/widget instance tree;
- `pages[].state` — typed page-local state;
- `composition.bindings` — property-to-state connections;
- `composition.events` — widget event-to-action connections;
- `pages[].actions` — structured Action steps;
- `pages[].dataSources` — governed HTTP endpoints;
- `pages[].operations` — request/lifecycle/result mapping.

No `designer.json`, hidden scene graph, runtime JSON page renderer or executable code string is introduced.

## Shared browser-safe Design Model

0.18 extracted the Designer-facing contract from tooling internals into private `@foundation/design-model`.

The package owns:

- Project Blueprint authoring TypeScript interfaces;
- Layout / Widget type identities;
- machine-readable Composition Registry metadata;
- property, binding and event signatures used by Designer UI.

The Designer therefore no longer imports `tooling/create-app/composition.json` directly.

`@foundation/create-app` still carries a `composition.json` file because the published CLI must work independently after `npm pack`. This is a verified mirror of `packages/design-model/composition.json`; `tooling/scripts/design-model-sync.mjs` fails offline verification if the copies drift.

## UI structure

```text
+----------------+---------------------------+----------------------+
| Palette        | Page / Viewport / History | Properties           |
| Layouts        +---------------------------+ Bindings             |
| Widgets        |                           | Events               |
+----------------+          Canvas           +----------------------+
| Object Tree    |                           | Page Model           |
|                |                           | State/Action/API     |
+----------------+---------------------------+----------------------+
```

## History

Undo/Redo records immutable **Project Blueprint snapshots**, not canvas-specific commands. A new edit after Undo clears the redo branch.

Shortcuts:

- `Ctrl/Cmd+Z` — Undo;
- `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` — Redo.

The dirty marker is derived from the current Blueprint bytes versus the last saved/opened Blueprint bytes, so undoing back to the saved state clears the dirty indicator.

## Structural authoring

The Canvas and Object Tree preserve stable Blueprint node IDs. Structural operations include:

- Palette insertion;
- drag/drop reparenting;
- Parent Container selector for non-drag reparenting;
- Object Tree and `Alt+ArrowUp/Down` reorder;
- delete buttons plus `Delete` / `Backspace` shortcut;
- cycle prevention;
- root protection;
- `split` maximum child count.

## Reference-safe rename

IDs are edited with commit-on-blur/Enter controls. Rename is rejected when the new ID is invalid or already exists.

State rename updates bindings, Action state references, Action state-value references, Operation `$state` references, lifecycle states and result targets.

Action rename updates Widget event connections. Data Source rename updates Operation `source`. Operation rename updates Action `invoke` steps. Visual node rename keeps stable structure identity while enforcing uniqueness.

## Properties, Bindings and Events

The Property Inspector is generated from the same Composition Registry as the Palette. Binding choices are filtered by state type. Event choices are generated from Registry event signatures and connect only to named structured Actions.

Arbitrary JavaScript remains forbidden.

## Structured Action editor

0.18 replaced the PoC JSON card for Actions with structured step editing for:

- `set` — literal, State or connected Event value source;
- `toggle` — boolean State;
- `increment` — number State and delta;
- `reset` — State reset;
- `invoke` — named Operation;
- `navigate` — internal destination and replace flag.

Steps can be inserted, removed and reordered without editing JSON manually.

## Structured Data Source / Operation editor

HTTP Data Sources expose governed method/path/response fields.

Operations expose:

- Data Source selection;
- pending boolean State;
- error string State;
- JSON query/body value editors;
- response-field-to-State result mappings.

The Project Compiler remains authoritative for complete semantic validation.

## Responsive viewport preview

Designer authoring widths:

- Desktop — 1320 px;
- Tablet — 768 px;
- Mobile — 390 px.

This is intentionally a preview-only feature. 0.19 does not add breakpoint-specific values to Project Blueprint. Real usage must first demonstrate where responsive layout metadata is actually required.

## File workflow

When the browser exposes the File System Access API, Open/Save can update the same `foundation.project.json` file. Otherwise the Designer falls back to JSON import/download.

Imported/opened JSON first passes a minimal browser-side Project Blueprint shape guard. Full semantic validation remains owned by `foundation-project validate` and the Project Compiler.


## Project component Registry (0.19)

The Designer can load a sibling `foundation.registry.json` and merge project-owned widgets/blocks into the same Palette/Property/Binding/Event metadata surface. Custom packages are metadata-only in the Designer: the canvas does not execute arbitrary project component code. Leaf components render as safe placeholders; `acceptsChildren` blocks render as safe authoring containers and participate in drag/drop/reparenting.

See `docs/CUSTOM_REGISTRY.md`.

## Live diagnostics (0.19)

The Diagnostics tab uses browser-safe `diagnoseBlueprintModel()` for immediate Project Blueprint feedback with stable compiler-style categories. Diagnostics can identify a page/node and the Designer can navigate to it. The Node `foundation-project diagnose --json` command remains the final compiler authority because filesystem/resource/staging semantics are intentionally not ported into the browser.

See `docs/COMPILER_DIAGNOSTICS.md`.

## Current engineering limits

Before Stable Designer promotion the repository still needs:

1. browser E2E in an environment that permits local Chromium navigation;
2. screenshot/visual regression baselines for Desktop / Tablet / Mobile;
3. import/schema-upgrade conflict UX;
4. measured evaluation of graph-canvas Action/Operation editing versus the current ordered structured editor;
5. responsive Blueprint semantics only after project evidence shows preview-only widths are insufficient.

0.19 now has real Node 22/pnpm dependency-backed TypeScript, lint, unit/integration, production build, Designer build and Storybook build validation.
