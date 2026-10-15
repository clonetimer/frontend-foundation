# Pattern Atlas Studio 1.0.0 RC1 — Draft release notes

**Status: release candidate draft, NOT Studio Stable.** Separate from frozen Foundation 0.21.0 npm package promotion.

## Included
- Unified `/create` → `/studio` visual editing workflow: project pages, component palette, tree, design inspector, layout modes and interaction preview.
- Re-editable `atlas.studio.json` and compatibility `foundation.project.json` in the exported business React ZIP.
- Server-driven records/tables: GET list, search/filter/sort/pagination, GET detail, PATCH/POST save and guarded DELETE/ETag; user-supplied business backend required.
- Independent React ZIP generation and an installable localhost-only production Studio editor bundle (includes Showcase pages).

## Automatic acceptance evidence
- Mainline exact source SHA will be recorded by this GitHub Release draft tag.
- Windows Node 24.12.0 + Linux Node 22.23.2 full Studio Stable gate PASS before draft creation.
- Real Windows `start-studio.cmd` and production Chrome; Linux equivalent.
- P0 browser actions: create, add component, inspector edit, screen modes, live preview, actual ZIP download, wipe browser data, re-import `atlas.studio.json`, compare JSON document.
- Separate generated React app tested with real HTTP mock service and failure/uncertain-result conditions.
- All distributed file bytes are checked against per-file SHA256 manifest; standalone zip SHA256SUMS is attached.

## Explicit limits
- This GitHub Release is **draft and prerelease**, and cannot be promoted as final Stable without finishing Issue #29.
- No bundled backend, DB, API authorization, audit trail, deployment environment or automatic cross-device synchronization.
- Real business backend integration and manual operator/usability acceptance remain open; automated screenshots do not constitute a human signoff.
- The Studio preview is richer than Foundation Compiler Blueprint-only output; use emitted React TSX/CSS for Studio-specific interactions.

## Use (candidate)
Download the Windows or Linux ZIP, extract, change into the `studio-rc` folder and run `start-studio.cmd` on Windows, or `bash start-studio.sh` on Linux. Open `http://127.0.0.1:5188/studio`. The server binds localhost. Node 22.13+ or Node 24 is required.

For source, traceability and P0 signoff checklist see [Issue #29](https://github.com/clonetimer/frontend-foundation/issues/29).
