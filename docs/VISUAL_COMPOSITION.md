# Visual Composition Model

Frontend Foundation 0.14 introduced a build-time visual composition model inspired by mature GUI toolkits' separation of **layouts**, **widgets**, **properties**, and **stable object identity**. It does not emulate Qt and does not consume PyQt projects. The useful idea is the composition model: a page can be described as a recursive tree of governed visual modules.

## Position in the architecture

```text
Project requirement / visual editor / planner
                ↓
        Visual Composition Tree
       (layout + widget instances)
                ↓
       foundation.project.json
                ↓
         Project Compiler
                ↓
        ordinary TSX source
                ↓
        @foundation/ui runtime
```

The browser does **not** interpret the Blueprint tree. The compiler emits readable React/TypeScript with imports such as `StackLayout`, `GridLayout`, `PanelWidget`, and `MetricWidget`.

## Node contract

Every visual node has stable identity:

```json
{
  "id": "mainWorkspace",
  "kind": "layout",
  "type": "split",
  "props": { "secondarySize": 320 },
  "children": []
}
```

Common fields:

- `id`: page-unique stable node identity;
- `kind`: `layout` or `widget`;
- `type`: governed Registry ID;
- `props`: component-specific JSON properties;
- `children`: recursive child nodes when supported;
- `label`: tab label metadata when a node is a direct child of `tabs`;
- `placement.span`: grid-column span metadata.

Compiler limits are deliberate: maximum depth 20 and maximum 500 nodes per page. Unknown properties are rejected.

## Layout Registry v1

| ID | Runtime export | Purpose |
|---|---|---|
| `stack` | `StackLayout` | vertical/horizontal sequential layout |
| `grid` | `GridLayout` | fixed-column or auto-fit grid |
| `split` | `SplitLayout` | two-region horizontal/vertical split |
| `tabs` | `TabsLayout` | tabbed container |

`split` requires exactly two children. `tabs` requires at least one child and each direct child must provide `label`.

## Widget Registry v1

| ID | Runtime export | Purpose |
|---|---|---|
| `panel` | `PanelWidget` | child-capable content container |
| `text` | `TextWidget` | title/body/secondary text |
| `button` | `ButtonWidget` | action affordance skeleton |
| `input` | `InputWidget` | text input skeleton |
| `select` | `SelectWidget` | select input skeleton |
| `metric` | `MetricWidget` | metric/status card |
| `placeholder` | `PlaceholderWidget` | domain-component placeholder |

`placeholder` is intentional. Domain views such as maps, 3D scenes, time-series viewers, code editors, terminals, or proprietary widgets should not be faked by the Foundation. The generated page exposes a stable location that project code can replace.

## Example

```json
{
  "id": "root",
  "kind": "layout",
  "type": "stack",
  "props": { "gap": 16 },
  "children": [
    {
      "id": "metrics",
      "kind": "layout",
      "type": "grid",
      "props": { "columns": 3 },
      "children": [
        { "id": "active", "kind": "widget", "type": "metric", "props": { "label": "Active", "value": 3 } },
        { "id": "queued", "kind": "widget", "type": "metric", "props": { "label": "Queued", "value": 1 } },
        { "id": "health", "kind": "widget", "type": "metric", "props": { "label": "Health", "value": "Nominal" } }
      ]
    },
    {
      "id": "workbench",
      "kind": "layout",
      "type": "split",
      "props": { "secondarySize": 320 },
      "children": [
        { "id": "viewer", "kind": "widget", "type": "placeholder", "props": { "title": "Mission view" } },
        {
          "id": "inspector",
          "kind": "widget",
          "type": "panel",
          "props": { "title": "Inspector" },
          "children": [
            { "id": "mode", "kind": "widget", "type": "select", "props": { "label": "Mode", "options": [{ "label": "Nominal", "value": "nominal" }] } },
            { "id": "run", "kind": "widget", "type": "button", "props": { "label": "Run", "type": "primary" } }
          ]
        }
      ]
    }
  ]
}
```

The compiler emits normal TSX and includes trace comments such as `foundation-node:viewer`, which gives future visual editors and repair tooling a stable bridge between Blueprint node identity and generated source.

## Pattern relationship

Patterns are retained as **high-level presets/macros**. A page can still use `pattern: dashboard`, `workspace`, `split-pane`, and so on without declaring a visual tree.

When `page.composition` is present, the Project Compiler uses the explicit visual tree for the page implementation while retaining `pattern` for capability/semantic classification. This means the system supports both:

```text
fast path:  Pattern -> generated starter page
explicit:   Pattern + Composition Tree -> generated visual page
```

Future tools may expand a Pattern into an editable Composition Tree, but 0.14 does not silently rewrite a Pattern into a second hidden representation.

## Deliberate safety boundary

Visual Composition accepts JSON data, not executable code. Properties such as `onClick: "runTask()"` remain rejected.

Frontend Foundation 0.15 adds the explicit Action/Binding model anticipated by 0.14: Widget `bindings` reference typed page-local state and governed Widget `events` connect to named structured Actions. Arbitrary JavaScript is still forbidden. See `docs/ACTION_BINDING.md`.

## Registry discovery

```bash
foundation-generate --list-composition --json
```

The JSON output is the tooling-facing palette contract for shells, patterns, layouts, widgets and retained blocks. It lets authoring tools discover governed modules instead of hard-coding their own component list.

## Future visual editor

The v1 model is intentionally suitable for a graphical editor:

- Registry -> palette/toolbox;
- recursive `children` -> object tree;
- node `id` -> selection identity;
- `props` -> property inspector;
- layout nodes -> drop targets;
- compiler -> source export;
- source ownership -> safe transition to hand-written implementation.

A future editor is therefore an **authoring surface for the same Blueprint**, not a second runtime low-code platform. In 0.15 the same Registry also exposes bindable properties and governed events, enabling a property-binding panel and signal/action connection editor without a parallel metadata model.
