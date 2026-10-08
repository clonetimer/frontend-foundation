# Action / Binding Model

Frontend Foundation 0.15 extends Visual Composition with a build-time interaction model inspired by mature GUI toolkits' separation of **widget signals**, **state**, **bindings**, and **slots/actions**.

The goal is not to reproduce Qt APIs and not to hide JavaScript inside JSON. Project Blueprint describes a finite, statically validated interaction graph; the Project Compiler emits ordinary React state and callbacks.

## Architecture

```text
Visual widget instance
      │
      ├── Binding ───────────────→ page-local state
      │                              ↑
      └── governed event             │
              │                      │
              ↓                      │
         named Action ───────────────┘
         (ordered Steps)
              │
              ↓
   Project Compiler emits TSX
              │
              ↓
     useState + React callbacks
```

The browser never loads or interprets the Action/Binding Blueprint.

## Page-local state v1

A page can declare typed state entries:

```json
"state": [
  { "id": "missionMode", "type": "string", "initial": "nominal" },
  { "id": "running", "type": "boolean", "initial": false },
  { "id": "runCount", "type": "number", "initial": 0 }
]
```

Supported v1 scalar types are:

- `string`
- `number`
- `boolean`

State IDs are lower-camel-case JavaScript-safe identifiers. Initial values must exactly match their declared type.

This state is deliberately page-local. Resource data, server/cache state, async operation state, URL/query state and form-schema state are future data-source adapters rather than being disguised as local state.

## Bindings

A visual widget can bind a governed property to page state:

```json
{
  "id": "missionMode",
  "kind": "widget",
  "type": "select",
  "props": {
    "label": "Mode",
    "options": [
      { "label": "Nominal", "value": "nominal" },
      { "label": "Analysis", "value": "analysis" }
    ]
  },
  "bindings": {
    "value": { "state": "missionMode" }
  }
}
```

Registry metadata declares which properties are bindable and the accepted state type. The compiler rejects unknown bindings and type mismatches before source generation.

Current governed binding surface:

| Widget | Bindings |
|---|---|
| `panel` | `title:string`, `description:string` |
| `text` | `text:string` |
| `button` | `label:string`, `disabled:boolean` |
| `input` | `value:string`, `disabled:boolean` |
| `select` | `value:string`, `disabled:boolean` |
| `metric` | `value:string|number` |
| `placeholder` | `title:string`, `description:string` |

A controlled `value` binding cannot be combined with `props.defaultValue`.

## Governed events

Widgets expose named semantic events rather than arbitrary handler-property strings.

Current v1 events:

| Widget | Blueprint event | Runtime callback | Event value |
|---|---|---|---|
| `button` | `press` | `onPress` | none |
| `input` | `change` | `onValueChange` | `string` |
| `select` | `change` | `onValueChange` | `string` |

The machine-readable Registry is available through:

```bash
foundation-generate --list-composition --json
```

A future graphical editor can therefore build a signal/action connection panel from the same Registry used by the compiler.

## Actions and steps

Page actions are named ordered step sequences:

```json
"actions": [
  {
    "id": "startMission",
    "steps": [
      { "type": "set", "state": "running", "value": true },
      { "type": "set", "state": "statusText", "value": "Running" },
      { "type": "increment", "state": "runCount" }
    ]
  }
]
```

Supported v1 steps:

- `set`: set state from a literal, another state value, or the connected event value;
- `toggle`: invert a boolean state entry;
- `increment`: add a finite number to numeric state;
- `reset`: restore the state entry's declared initial value.

Examples of structured values:

```json
{ "type": "set", "state": "name", "value": { "event": "value" } }
{ "type": "set", "state": "summary", "value": { "state": "name" } }
```

There is intentionally no `code`, `expression`, `script`, `eval`, or arbitrary function body field.

## Event → Action connection

The widget connects a governed event to one or more named actions:

```json
{
  "id": "startMissionButton",
  "kind": "widget",
  "type": "button",
  "props": { "label": "Start mission", "type": "primary" },
  "bindings": {
    "disabled": { "state": "running" }
  },
  "events": {
    "press": ["startMission"]
  }
}
```

For an input/select:

```json
"events": {
  "change": ["updateMode"]
}
```

where the action may consume the event value:

```json
{
  "id": "updateMode",
  "steps": [
    { "type": "set", "state": "missionMode", "value": { "event": "value" } }
  ]
}
```

A Button `press` event has no value. Connecting it to an action that requires `{ "event": "value" }` is a compile-time error. Likewise, a string-valued Select event cannot be written directly into numeric state.

## Generated source

The previous Blueprint compiles to normal React code conceptually equivalent to:

```tsx
const [missionMode, setMissionMode] = useState('nominal');
const [running, setRunning] = useState(false);
const [runCount, setRunCount] = useState(0);

<SelectWidget
  value={missionMode}
  onValueChange={(value) => { setMissionMode(value); }}
/>

<ButtonWidget
  disabled={running}
  onPress={() => {
    setRunning(true);
    setRunCount((current) => current + 1);
  }}
/>
```

The generated page remains `scaffold-once`: a developer may continue implementing project-specific behavior in ordinary TSX. If a later Blueprint change changes the generated scaffold while that page has also been edited manually, the ownership-aware compiler blocks regeneration instead of silently overwriting the page.

## Safety and design boundaries

0.15 deliberately does **not** model:

- arbitrary JavaScript expressions;
- network requests as free-form action code;
- Resource/Query cache bindings;
- async-operation orchestration;
- permission side effects;
- navigation actions;
- validation expressions;
- cross-page/global application state.

Those concerns need explicit typed adapters. The intended evolution is:

```text
0.14  Layout / Widget tree
0.15  local State / Binding / Event / Action graph
next  typed Data Sources + Async / Navigation / Permission actions
then  graphical designer and automated design/planning surfaces
```

This keeps the authoring model inspectable and deterministic while still giving future graphical tooling the same object-tree + property-inspector + signal/action-connection concepts that make mature desktop GUI builders productive.
