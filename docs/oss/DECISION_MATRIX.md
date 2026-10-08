# OSS Decision Matrix

Snapshot: 2026-10-05. Versions are research snapshots, not permanent pins.

| Candidate | Decision | Strong fit | Primary blockers / risks |
|---|---|---|---|
| Ant Design ProComponents 3.x | **Approved shadow PoC** | AntD 6, ProLayout, ProTable, ProForm, enterprise CRUD | Larger abstraction surface; request conventions must not swallow our API/Error contract |
| Refine Core 5.x | **Gated shadow PoC** | Headless Data/Auth/AccessControl, TanStack Query, React 19 | Resource model may overfit CRUD; needs bridge to OpenAPI/AppError; official RR adapter is RR7 |
| `@refinedev/antd` 6.x | **Reject for current baseline** | Refine UI convenience | Current package still depends/peers on AntD 5 |
| `@refinedev/react-router` 2.x | **Reject for current baseline** | Refine routing convenience | Current package peer is React Router 7 |
| Ant Design Pro 6 | **Benchmark only** | Excellent enterprise reference, React 19 + AntD 6 + ProComponents | Umi Max 4 application template; copying/forking recreates drift problem |
| React Admin 5 | **Benchmark only** | Mature CRUD/data/admin model | MUI-centered and RR6/7; conflicts with AntD6/RR8 platform choice |

## Current owned baseline

The baseline is generated in `docs/oss/owned-baseline.json`. The largest kernel surface is `@foundation/app`; `data`, `forms` and `ui` are intentionally small and therefore should only be replaced if OSS removes project-level boilerplate as well as package code.

A smaller Foundation package count is not, by itself, success. The measured target is **less organization-owned code and fewer public contracts across Foundation + generated projects**.
