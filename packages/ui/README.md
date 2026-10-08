# @foundation/ui

Common page/state primitives plus reusable UI composition blocks, patterns, visual layouts and visual widgets. Business-specific components and data access do not belong here.

0.14 added the first Visual Composition primitives:

- layouts: `StackLayout`, `GridLayout`, `SplitLayout`, `TabsLayout`;
- widgets: `PanelWidget`, `TextWidget`, `ButtonWidget`, `InputWidget`, `SelectWidget`, `MetricWidget`, `PlaceholderWidget`;
- retained higher-level blocks/patterns: `PanelBlock`, `MetricBlock`, `MetricGrid`, `DashboardPattern`, `MasterDetailPattern`, `SplitPanePattern`, `WorkspacePattern`.

The low-level visual primitives are intentionally small. 0.15 adds optional controlled-value/callback props required by the structured Action/Binding compiler (`ButtonWidget.onPress`, `InputWidget.value/onValueChange`, `SelectWidget.value/onValueChange`). Project Blueprint still compiles visual/interaction descriptions into ordinary TSX source; the browser does not interpret Blueprint JSON at runtime.

## Install

```bash
pnpm add @foundation/ui
```

Use only exports from the package root; deep imports are unsupported. See the repository architecture and release documentation for compatibility policy.
