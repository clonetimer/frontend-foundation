# Designer browser acceptance

The Visual Designer browser gate is intentionally separate from build/typecheck. A production Vite build does not prove drag/drop-style authoring behavior or file workflows.

## Local host

```bash
pnpm designer:build
pnpm designer:browser-smoke
```

The smoke launches Chromium through CDP and checks:

- Designer shell renders;
- Palette `Add` increases the visual-node count;
- Undo restores the prior node count;
- Mobile viewport can be selected;
- a PNG screenshot is captured.

## Externally hosted Designer

Some managed containers block all Chromium navigation to localhost. The same smoke can target an externally hosted build instead of starting local Vite preview:

```bash
pnpm designer:build
# deploy apps/designer/dist to an HTTPS preview host
DESIGNER_SMOKE_URL=https://designer-preview.example.test/ \
DESIGNER_SMOKE_SCREENSHOT=./artifacts/designer-external.png \
pnpm designer:browser-smoke
```

When `DESIGNER_SMOKE_URL` is set, the script does not require or start the local Vite preview server. Chromium/CDP remains local; only the page under test is external.

## Required RC evidence

Retain the JSON stdout from `designer:browser-smoke` and the screenshot artifact. The result must report `ok: true` and the expected target URL/mode.

## Stable file-workflow evidence

Before Stable promotion, also execute the browser file workflow on an unrestricted Chromium-family desktop browser:

1. Open a valid `foundation.project.json` with File System Access when supported.
2. Modify one property and save back to the same file.
3. Use `Save As` to create a new Blueprint file.
4. In a browser without File System Access, verify `Open` falls back to JSON import and `Save` falls back to JSON download.
5. Re-run `foundation-project validate`, `compile`, `status` and `foundation-doctor --strict` on the saved/imported Blueprint.

This evidence is a Stable gate; this repository does not treat an organization-policy browser block as a pass.
