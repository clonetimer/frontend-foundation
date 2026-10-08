# 0.21 RC convergence readiness

0.21 is not a feature release. Its purpose is to decide whether the 0.20 architecture is ready for immutable RC distribution and, later, Stable promotion.

## Frozen scope

Allowed during 0.21 RC:

- validation coverage;
- release/build/upgrade/packaging fixes;
- defects discovered by those gates;
- documentation required to operate or roll back the RC.

Not allowed without ending the RC and returning to Candidate development:

- new Blueprint schema fields;
- new Widget/Layout/Action/Data/Operation DSL semantics;
- new Runtime plugin loading;
- new Designer authoring feature families;
- Kernel API changes that are not defect fixes with explicit review.

## Current evidence matrix

| Evidence | RC requirement | 0.21.0-rc.1 status | Stable requirement |
|---|---:|---:|---:|
| dependency-independent offline gate | required | **125/125 PASS** | required |
| Node 22 / TypeScript 6 / lint / test / build | required | **PASS** | required |
| Storybook production build | required | **PASS** | required |
| packed consumers: minimal/management/data-workbench | required | **3/3 PASS** | required |
| primary Domain SDK package admission | required | **PASS / 3 components** | required |
| second independently authored Domain SDK package admission | required | **PASS / 2 components** | required |
| public API / Kernel baseline / release preflight+plan | required | **PASS** | required |
| 0.20 -> 0.21 owned Runtime source hash | required | **0 changed / 0 added / 0 removed** | required |
| real-browser Designer smoke | required before external RC acceptance | **BLOCKED by hosted Chromium policy** | required |
| Desktop/Tablet/Mobile visual baseline | may be collected during RC | **PENDING external browser host** | required |
| connected frozen install / GitHub exact-commit gates | external | **PENDING** | required |
| target-registry Candidate smoke | external | **PENDING** | required |

## Current conclusion

The local engineering evidence does **not** identify a reason to add more product functionality. The Foundation/Designer/SDK contracts have passed the dependency-independent gate, real TypeScript/build/test pipeline, two independent Domain SDK admissions and three tarball-based consumer profiles.

The remaining blockers are environmental/external promotion evidence rather than missing local feature work:

1. run the Designer Chromium smoke on a host where browser navigation to the built application is permitted;
2. retain Desktop/Tablet/Mobile screenshot baselines;
3. execute connected exact-commit GitHub/release workflow evidence;
4. publish the immutable Candidate to the target registry and run a clean-registry consumer smoke.

## Browser policy constraint

The current hosted container returns:

```text
BROWSER_POLICY_BLOCKED
Chromium policy blocked Designer navigation to http://127.0.0.1:4177.
```

0.21 supports the same smoke against an externally hosted HTTPS preview through `DESIGNER_SMOKE_URL`. This policy block is not a pass and is not a reason to alter the application architecture.

## Promotion rule

Do not add another Blueprint/Designer feature merely to keep development moving. If external RC evidence passes without exposing a contract defect, the next action should be **RC -> Stable promotion work**, not another feature version. If external evidence exposes a genuine contract defect, fix that defect on the RC line and repeat the frozen gates.
