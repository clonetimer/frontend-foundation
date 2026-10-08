# ADR-024 — UI Composition and Shell Contract

Status: Accepted for 0.12 Candidate

## Context

The 0.10/0.11 Runtime Kernel hard-coded one `AppShell` (left sidebar, top header, breadcrumb and padded content). Resource Blueprint proved deterministic project source generation, but every generated application still inherited essentially the same application chrome. Expanding Resource Blueprint into a universal UI DSL would couple data/resource semantics to layout and eventually create a runtime low-code engine.

## Decision

Introduce a separate UI composition layer.

1. `ApplicationDefinition` receives an optional `shell` contract.
2. The compatibility default remains `sidebar`.
3. Foundation ships `sidebar`, `top-nav`, `workspace`, and `bare` presets.
4. Projects may provide a custom shell component receiving routed content as children.
5. `@foundation/ui` exposes small block/pattern primitives for deterministic project composition.
6. Tooling publishes a serializable composition catalog and module templates targeting stable composition IDs.
7. Resource Blueprint v1 remains resource-focused and unchanged.
8. A future Project Blueprint will select Shell/Pattern/Block IDs; it will not make the Runtime Kernel parse a page schema.

## Consequences

Positive:

- Projects can diverge structurally without forking Foundation.
- Existing projects remain compatible because `sidebar` is the default.
- Future AI planning has a constrained, auditable search space.
- CRUD/resource generation stays separate from page/layout composition.

Costs:

- `@foundation/app`, `@foundation/theme`, and `@foundation/ui` Runtime Kernel source changes in 0.12 and therefore require a fresh full Stable validation cycle.
- Built-in presets must remain accessible, responsive and upgrade-safe.
- The first catalog is deliberately small and will need measured expansion.

## Rejected alternatives

- Keep one global AppShell and let every project fork it.
- Put layout/schema fields into Resource Blueprint until it becomes universal.
- Add a runtime JSON page renderer.
- Let an LLM generate arbitrary application structure without stable composition contracts.
