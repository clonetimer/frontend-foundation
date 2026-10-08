# ADR-013: OSS-first implementation policy

> Clarification: OSS evaluation remains required, but OSS adoption is not a goal by itself. The goal-first decision in ADR-017 supersedes that interpretation.

Status: Accepted for 0.6 candidate.

Frontend Foundation will not build commodity capabilities by default. New or replacement capabilities must evaluate maintained open-source upstreams first. Organization-owned code should concentrate on contracts, policy, integration and capabilities not adequately served upstream.

This ADR does not authorize destructive replacement. Existing packages remain until a shadow PoC meets the promotion gates in `docs/oss/OSS_CONVERGENCE.md`.
