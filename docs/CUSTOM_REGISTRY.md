# Project Component Registry v1

## Purpose

`foundation.registry.json` is an optional **project-level authoring and compile-time extension contract**. It lets a project register domain widgets/blocks such as `example.interactive-viewer`, `telemetry.time-series`, or `lab.parameter-panel` without modifying the Foundation Runtime Kernel.

The registry is not a runtime plugin loader. The Visual Designer reads metadata only and never executes the declared component package. The Project Compiler validates the registry and emits normal named imports into generated TSX.

## File location

Place the file beside `foundation.project.json`:

```text
project/
├── foundation.project.json
└── foundation.registry.json
```

The compiler discovers it automatically. The Designer can load the same file using **Registry**.

## Example

```json
{
  "schemaVersion": 1,
  "widgets": [
    {
      "id": "example.interactive-viewer",
      "package": "@example/domain-widgets",
      "version": "^2.0.0",
      "exportName": "InteractiveViewer",
      "description": "Project-owned overview visualization widget.",
      "properties": [
        { "key": "itemId", "label": "Item", "kind": "text", "required": true },
        { "key": "mode", "label": "Mode", "kind": "select", "options": ["2d", "3d"], "default": "3d" }
      ],
      "bindings": { "itemId": "string" },
      "events": {
        "select": { "prop": "onSelect", "valueType": "string", "parameter": "value" }
      }
    }
  ],
  "blocks": [
    {
      "id": "example.analysis-section",
      "package": "@example/domain-widgets",
      "version": "^2.0.0",
      "exportName": "AnalysisSection",
      "description": "Project-owned composition container.",
      "acceptsChildren": true,
      "properties": [
        { "key": "title", "label": "Title", "kind": "text", "default": "Analysis" }
      ]
    }
  ]
}
```

IDs must be namespaced. Built-in IDs cannot be shadowed.

## Governed metadata

A component declaration may define:

- package/version and named export;
- editable properties (`text`, `number`, `boolean`, `select`, `json`);
- defaults and required properties;
- state-compatible bindings;
- semantic events and their React callback prop;
- `acceptsChildren` for project-owned composition containers.

A required property may be satisfied either by a static property value or by a valid state Binding. Arbitrary JavaScript, JSX, callback bodies, dynamic imports, package install scripts and runtime plugin code are not accepted by the registry format.

## Compile behavior

For a visual node such as:

```json
{
  "id": "overview",
  "kind": "widget",
  "type": "example.interactive-viewer",
  "props": { "mode": "3d" },
  "bindings": { "itemId": { "state": "itemId" } },
  "events": { "select": ["selectItem"] }
}
```

the compiler emits ordinary source:

```tsx
import { InteractiveViewer } from '@example/domain-widgets';

<InteractiveViewer
  mode="3d"
  itemId={itemId}
  onSelect={(value) => { setItemId(value); }}
/>
```

and adds the declared package/version to the generated project's dependencies. The registry file and its bytes participate in Project State input hashing, so a registry change is visible as compiler input drift.

## Designer behavior

The Designer merges the project registry with the canonical Foundation Composition Registry. Project components become Palette items and drive the same Property/Binding/Event inspectors. `acceptsChildren` blocks can receive drag/drop children.

For safety, the Designer canvas does **not** import or execute arbitrary project packages. Custom leaf components render as safe placeholders; child-accepting blocks render as safe authoring containers. The generated project uses the real component package.

## Validation

- Formal schema: `tooling/create-app/registry.schema.json`
- Compiler authority: `foundation-project validate` / `foundation-project diagnose`
- Retained example: `tooling/create-app/examples/custom-registry-project`
