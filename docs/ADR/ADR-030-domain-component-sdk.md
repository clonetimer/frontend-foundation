# ADR-030 — Domain Component SDK stays package-owned and compile-time admitted

Status: Accepted for 0.20 Candidate

## Context

0.19 proved that a project-level Custom Registry can make domain Widgets/Blocks first-class Designer and Project Compiler inputs. It did not define how teams should create, build, publish and validate the React packages behind those metadata entries.

## Decision

Provide a `foundation-domain` SDK CLI from `@foundation/create-app` and keep domain implementations in normal npm packages. Package-level `foundation.registry.json` uses the same Custom Registry schema as the project. Admission checks package identity, version compatibility, source/built exports and npm pack contents.

The Visual Designer continues to consume metadata only. Real domain code is exercised in package preview/test surfaces such as Storybook and is statically imported only by generated applications.

## Consequences

- domain components can evolve independently from the Foundation Kernel;
- projects can add specialized modules without adding generic widgets to Foundation;
- npm packaging mistakes become detectable before project compilation;
- the Designer is not a remote-code execution/plugin host;
- package-level and project-level Registry fragments can be merged deterministically;
- a package author still owns accessibility/performance/runtime testing of the component implementation.
