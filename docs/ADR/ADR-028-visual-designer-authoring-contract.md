# ADR-028 — Visual Designer authoring contract and shared Design Model

## Status

Accepted for 0.18 Candidate.

## Context

The 0.17 Designer proved that Project Blueprint can be edited graphically, but the Designer imported the Composition Registry from an internal `tooling/create-app` path and still used JSON cards for Actions/Data/Operations. Long-term authoring requires undo/redo, safe identity changes and a browser-safe shared contract without turning the Designer into a second schema owner.

## Decision

1. `foundation.project.json` remains the only persisted Designer document.
2. Add private `@foundation/design-model` as the browser-safe authoring type/Registry boundary.
3. The canonical Composition Registry lives with Design Model; `create-app/composition.json` is a verified packed mirror so `@foundation/create-app` remains standalone on npm.
4. Undo/redo stores complete immutable Blueprint snapshots at the Designer boundary. The Compiler remains unaware of Designer history.
5. Renaming governed IDs must update all Blueprint references or be rejected.
6. Action/Data/Operation editors manipulate existing structured DSL fields; they do not introduce arbitrary JavaScript or a new workflow schema.
7. Responsive preview presets only change authoring viewport width. They do not add breakpoint semantics to Project Blueprint in 0.18.
8. Keyboard and explicit controls must provide structural authoring paths in addition to drag/drop.

## Consequences

The Designer becomes more usable without changing generated application runtime semantics or expanding the Project Blueprint language. A future visual workflow graph can build on the same Action/Operation structures. If responsive authoring later proves that breakpoint-specific layout data is required, that addition must be justified by measured Designer friction rather than by the preview feature itself.
