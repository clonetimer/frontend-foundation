# ADR-029 — Project-owned component registry is metadata, not a runtime plugin system

## Status

Accepted for 0.19 Candidate.

## Context

The Visual Designer must support domain modules such as interactive viewers, time-series plots and engineering panels without adding each project-specific component to `@foundation/ui`. A generic runtime plugin loader would weaken build-time guarantees and make generated applications dependent on the authoring system.

## Decision

Add optional sibling `foundation.registry.json` as a project-level build-time contract.

The registry declares namespaced component identity, package/version, named export, editable property metadata, state bindings, semantic events and optional child-container capability. Project Compiler validates it, adds declared package dependencies and emits ordinary static imports/TSX.

The Designer consumes metadata only. It must not execute arbitrary project component packages while authoring; custom modules use safe preview placeholders/containers.

## Consequences

- projects can extend the graphical module palette without modifying Runtime Kernel;
- compiler output remains ordinary source with normal package dependencies;
- registry changes participate in Project State input drift;
- project component packages remain responsible for their own implementation, accessibility, performance and runtime compatibility;
- runtime dynamic plugin loading and executable registry expressions remain out of scope.
