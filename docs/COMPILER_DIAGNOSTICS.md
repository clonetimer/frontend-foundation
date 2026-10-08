# Project Compiler Diagnostics

## Goal

0.19 makes Project Blueprint failures usable by the Visual Designer, CI and future repair/planning agents without parsing human terminal text.

## CLI authority

```bash
foundation-project diagnose foundation.project.json --json
```

Valid input returns `valid: true` and no diagnostics. Invalid input returns a non-zero status and a stable diagnostic envelope:

```json
{
  "valid": false,
  "diagnostics": [
    {
      "code": "REGISTRY_INVALID",
      "severity": "error",
      "source": "foundation.registry.json",
      "message": "..."
    }
  ]
}
```

Current stable diagnostic categories are:

- `BLUEPRINT_INVALID`
- `REGISTRY_INVALID`
- `COMPOSITION_INVALID`
- `INTERACTION_INVALID`
- `DATA_OPERATION_INVALID`

The Node Project Compiler remains the release authority because it owns filesystem inputs, Resource Blueprints, Project State, staging and generation semantics.

## Browser-safe preflight

`@foundation/design-model` exposes `diagnoseBlueprintModel()` for immediate authoring feedback. It uses the same diagnostic categories and validates the browser-safe subset that can be determined from the in-memory Project Blueprint and loaded component registry, including:

- duplicate identities;
- unknown Layout/Widget IDs;
- split/tabs structural rules;
- custom required properties and binding satisfaction;
- Binding type/reference validity;
- Event -> Action references;
- Action State/Operation references;
- Data Source/Operation lifecycle/result references.

The Designer exposes these results in a live **Diagnostics** tab and can navigate from a diagnostic to its page/node.

This is intentionally a preflight, not a browser port of the entire Node compiler. The UI says so explicitly and recommends the CLI diagnostic command for final authority.

## Repair-loop boundary

Diagnostics are data, not executable repair instructions. A future rule engine or AI planner may consume the code/source/message/path/node identity, propose Blueprint changes, then rerun validation. It must not bypass compiler validation or generated-file ownership checks.
