# ADR-026: Build-time Visual Composition Model

Status: Accepted for 0.14 Candidate

## Context

Project Blueprint 0.13 can select page Patterns but cannot explicitly represent a page assembled from reusable graphical modules. Extending the system only with more fixed Patterns would eventually produce a large template catalog, while a runtime low-code renderer would weaken source ownership, type checking, testability and normal React development.

GUI toolkits demonstrate a useful architectural idea independent of any specific technology: layouts and widgets are distinct object types, instances have stable identity and properties, and containers compose children recursively.

## Decision

Add an optional build-time `page.composition` tree to Project Blueprint.

- Nodes have stable IDs and are either `layout` or `widget` instances.
- The Registry governs valid type IDs and property schemas.
- Layouts own structural composition; widgets own leaf/container presentation semantics.
- The Project Compiler validates the tree and emits ordinary TSX source.
- Existing page Patterns remain high-level presets and continue to work without a composition tree.
- The browser never parses or renders Project Blueprint JSON.
- Executable JavaScript/event strings are not accepted as widget properties.
- Generated page TSX stays `scaffold-once`, preserving the 0.13 human-edit conflict model.

## Initial Registry

Layouts: `stack`, `grid`, `split`, `tabs`.

Widgets: `panel`, `text`, `button`, `input`, `select`, `metric`, `placeholder`.

`placeholder` is the boundary for domain-specific components that Foundation should not pretend to own.

## Consequences

Advantages:

- graphical editors can share the same Project Blueprint instead of introducing a second format;
- planners can make deterministic Registry selections rather than invent arbitrary DOM/CSS;
- generated output remains readable React/TypeScript;
- stable node IDs provide a bridge between design state and source diagnostics;
- Pattern and explicit-composition workflows can coexist.

Costs:

- `@foundation/ui` gains additive visual primitives and therefore requires a new reviewed Kernel baseline;
- Registry/tooling/runtime export drift must be governed;
- interactions and data binding cannot be represented safely until a separate Action/Binding contract is designed.

## Rejected alternatives

1. **PyQt/Qt import as the primary goal** — too specific; the reusable idea is the composition model, not the source format.
2. **Runtime JSON renderer** — rejected because it moves application structure into an interpreter and weakens normal source workflows.
3. **Arbitrary JSX/CSS strings in Blueprint** — rejected because they are not safely analyzable or deterministic.
4. **Pattern explosion** — rejected as the only composition mechanism; Patterns remain useful macros, not the lowest-level design representation.
