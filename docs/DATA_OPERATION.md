# Data / Operation Model — 0.16 Candidate

## Purpose

0.16 extends the build-time Project Blueprint so Visual Composition pages can connect governed UI events to real API work without embedding executable JavaScript in JSON. The browser still runs ordinary generated React/TypeScript; it does not interpret the Blueprint.

## Model

```text
Widget event
  -> named Action
      -> invoke Operation
          -> HTTP Data Source
          -> pending/error lifecycle state
          -> response field -> page state
      -> optional navigate
  -> state Binding
      -> Widget property
```

### HTTP Data Source

A Data Source declares a static API-relative endpoint:

```json
{
  "id": "missionStartApi",
  "type": "http",
  "method": "POST",
  "path": "/missions/start",
  "response": "json"
}
```

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
Supported response modes: `json`, `text`, `none`.
Absolute URLs are rejected. Requests compile against `@foundation/api` `ApiTransport`, so runtime base URL, auth token, timeout, request ID and error mapping remain governed by the existing Foundation API layer.

### Operation

```json
{
  "id": "startMissionRequest",
  "source": "missionStartApi",
  "body": {
    "mode": { "$state": "missionMode" }
  },
  "lifecycle": {
    "pendingState": "running",
    "errorState": "operationError"
  },
  "result": [
    { "state": "statusText", "path": "status" }
  ]
}
```

`query` values are limited to scalar literals or explicit `{ "$state": "stateId" }` references. `body` accepts JSON values plus explicit state references. Static v1 Data Source paths cannot contain query strings, fragments, or path-template syntax; query parameters stay explicit in the Operation model. The compiler never evaluates arbitrary expressions.

`pendingState` must be boolean. `errorState` must be string. The generated operation sets pending true before the request, clears the error string, writes failures to the error state, and restores pending false in `finally`.

For JSON responses, result assignments use a simple dot-separated property path and the target page state's scalar type as the runtime assertion. Text responses may assign only to string state and do not use a path.

### Action steps

0.16 adds:

```json
{ "type": "invoke", "operation": "startMissionRequest" }
{ "type": "navigate", "to": "/records" }
```

`invoke` awaits the generated operation. A failed operation returns `false`, so the compiled action stops before subsequent steps such as increments or navigation. `navigate` accepts internal router destinations only; URL schemes and line breaks are rejected.

Existing `set`, `toggle`, `increment`, and `reset` remain unchanged.

## Generated source

The compiler emits normal code such as:

```tsx
const transport = useApiTransport();
const navigate = useNavigate();

const runStartMissionRequest = async (): Promise<boolean> => {
  setRunning(true);
  setOperationError("");
  try {
    const response = await transport.fetch("/missions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: missionMode })
    });
    const payload: unknown = await response.json();
    // validated field extraction emitted by the compiler
    return true;
  } catch (error) {
    setOperationError(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    setRunning(false);
  }
};
```

No `eval`, `new Function`, runtime Blueprint renderer, or arbitrary handler string is introduced.

## Capability boundary

HTTP Operations require the selected Profile to include `api-transport`. In the built-in catalog, `management` currently provides that capability. A project with an incompatible Profile fails Blueprint validation before source generation.

## Deliberate v1 limits

0.16 is intentionally not a general workflow engine. It does not yet provide automatic mount queries, polling/SSE/WebSocket execution, cancellation, retries, object/list page state, contract-derived response typing, file upload operations, or operation-to-operation graphs. Those should be added only when the underlying model remains statically verifiable and visually authorable.
