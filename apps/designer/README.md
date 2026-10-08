# @foundation/designer

Private workspace application for graphical authoring of the same `foundation.project.json` consumed by the Project Compiler.

## Run

```bash
pnpm designer
```

## 0.18 Engineering Beta surface

- Layout / Widget Palette from the canonical `@foundation/design-model` Composition Registry;
- Object Tree and live Foundation UI Canvas;
- Blueprint-level undo/redo;
- drag/drop plus parent selector, reorder buttons and keyboard structural editing;
- safe rename for visual node, State, Action, Data Source and Operation IDs;
- Properties / Bindings / Events inspectors driven by Registry metadata;
- structured Action step editor;
- structured HTTP Data Source and Operation editors;
- Desktop / Tablet / Mobile preview widths;
- JSON source mode;
- File System Access open/save with import/download fallback.

## Authoring contract

The Designer does not own a second document format. Every edit mutates the Project Blueprint model, and the normal Project Compiler remains responsible for semantic validation and React/TypeScript generation.

The Designer is not shipped to generated applications and is not a runtime Blueprint renderer.

## Candidate limitations

Browser E2E, production Vite build with the repository-pinned dependency graph, and visual regression remain required before Stable promotion. Complex Action/Data flows use structured forms rather than a node-graph canvas in 0.18.
