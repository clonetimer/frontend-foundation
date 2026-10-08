# ADR-025 — Project Blueprint and deterministic project compiler

Status: Accepted for 0.13 Candidate

## Context

0.11 proved that a narrow Resource Blueprint can generate editable React/TypeScript source. 0.12 added Shell and UI Composition contracts so projects can differ structurally without forking the Runtime Kernel. The next problem is project-level orchestration: a project needs one reviewable description of its profile, shell, theme, navigation, pages and resource inputs.

Generating an application directly from free-form LLM output would make regeneration, upgrades and review non-deterministic. Turning the Blueprint into a runtime page schema would move application architecture into a browser low-code interpreter and couple the Runtime Kernel to project-generation concerns.

## Decision

Introduce `foundation.project.json` as a **build-time project contract** and `foundation-project` as a deterministic compiler/tooling surface.

1. Project Blueprint v1 selects existing Foundation contracts rather than redefining them: built-in Profile, Shell, Deployment, Contract mode, Composition Pattern IDs and Resource Blueprint inputs. Its target Foundation version must stay on the compiler's major/minor line.
2. The Runtime Kernel never reads `foundation.project.json`.
3. Compilation happens in a temporary staging project first. The compiler calculates the complete synchronization plan before modifying the target project.
4. Regeneration is governed by file ownership:
   - `generated-owned` — compiler-owned contract/composition files; local drift blocks compilation unless takeover is explicit.
   - `scaffold-once` — editable generated source; unchanged generator output preserves human edits, changed generator output conflicts with human edits rather than overwriting them.
   - `human-owned` — adopted existing source that the compiler must not rewrite.
5. The compiler records normalized Blueprint/resource input hashes and managed file hashes in `foundation.project.state.json`; Doctor reports Blueprint and generated-owned drift.
6. Resource Blueprint v1 stays an independent input. Project Blueprint references resource files instead of copying their field/API DSL into the project schema.
7. Existing Foundation projects can run `foundation-project init` to produce an inspectable migration plan. `--write` writes the Blueprint; first generated-owned takeover requires explicit `--force-generated`.
8. Future AI planning should emit/modify Project Blueprint. Deterministic tooling remains responsible for source generation and validation.

## Consequences

Positive:

- Requirements can converge on one auditable project-level intermediate representation.
- Generated output remains ordinary React/TypeScript rather than a runtime schema renderer.
- Regeneration has explicit, testable ownership semantics instead of destructive `--force` behavior.
- Existing 0.12-style projects have a conservative adoption path.
- Project-level generation evolves outside the Runtime Kernel.

Costs:

- The compiler must maintain migrations and ownership-state compatibility.
- Blueprint v1 intentionally supports only built-in Profiles and the current composition catalog.
- Arbitrary custom page composition, workflow DSLs and semantic merge of hand-edited source are deferred.
- A changed scaffold input plus a hand-edited dependent file becomes an explicit conflict requiring human resolution.

## Rejected alternatives

- Let an LLM directly rewrite an entire project on every request.
- Add project/page schema interpretation to `@foundation/app`.
- Merge Resource Blueprint and Project Blueprint into one universal low-code DSL.
- Silently overwrite modified generated files.
- Attempt heuristic source merging without a stable ownership boundary.
