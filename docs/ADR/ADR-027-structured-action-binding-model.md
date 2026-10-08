# ADR-027 — Structured Action / Binding model

Status: Accepted for 0.15 Candidate

## Context

Visual Composition 0.14 can describe layout/widget trees but intentionally rejects executable handler strings. A graphical authoring model needs a safe way to express widget interaction without turning Project Blueprint into a second programming language or runtime low-code interpreter.

## Decision

Introduce an additive build-time interaction model with four concepts:

1. typed page-local scalar state;
2. governed widget property bindings;
3. governed semantic widget events;
4. named Actions made from a finite set of typed Steps.

Widget event and binding capabilities live in the machine-readable Composition Registry. The compiler validates the complete interaction graph and emits ordinary React `useState` and callback source. Blueprint never embeds arbitrary JavaScript.

Initial Action Steps are `set`, `toggle`, `increment`, and `reset`. Initial event surface is `button.press`, `input.change`, and `select.change`.

## Consequences

- visual editors can expose property binding and signal/action connection panels using the same Registry as the compiler;
- invalid type/event connections fail before source generation;
- existing 0.14 visual-only Blueprints remain valid;
- Runtime changes are limited to optional callback/controlled-value props on existing visual widgets;
- server data, Resource/Contract bindings, navigation, permissions and async orchestration remain explicit future adapters rather than arbitrary action scripts.
