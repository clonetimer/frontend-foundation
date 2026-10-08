# Kernel Compatibility — 0.20.0

Frontend Foundation 0.20.0 Domain Component SDK changes only authoring/tooling, documentation, Storybook regression coverage and the retained non-Foundation `@example/domain-widgets` fixture.

No `packages/{core,theme,observability,security,api,ui,data,forms,file,async,visualization,app,testing}/src` Runtime Kernel source is intentionally changed from 0.19. The reviewed 0.19 owned-Kernel baseline therefore remains authoritative at 62 files.

The Domain Component SDK is not a runtime plugin loader. Generated projects statically import project-owned component packages declared by `foundation.registry.json`.
