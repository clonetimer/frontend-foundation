import { composition as builtInComposition, mergeCompositionRegistry } from '@foundation/design-model';
import type { CompositionRegistry, ProjectComponentRegistry, RegistryProperty, VisualNode } from '@foundation/design-model';

export type { RegistryProperty } from '@foundation/design-model';

export function createDesignerCatalog(customRegistry?: ProjectComponentRegistry) {
  const registry = customRegistry ? mergeCompositionRegistry(customRegistry) : builtInComposition;
  const layoutEntries = registry.layouts;
  const widgetEntries = registry.widgets;
  const bindingProperties = Object.fromEntries(
    registry.widgets.map((entry) => [entry.id, entry.bindings ?? {}])
  ) as Record<string, Record<string, string | readonly string[]>>;
  const widgetEvents = Object.fromEntries(
    registry.widgets.map((entry) => [entry.id, Object.keys(entry.events ?? {})])
  ) as Record<string, readonly string[]>;
  const widgetById = new Map<string, (typeof registry.widgets)[number]>(registry.widgets.map((entry) => [entry.id, entry]));
  const layoutById = new Map<string, (typeof registry.layouts)[number]>(registry.layouts.map((entry) => [entry.id, entry]));

  function propertySchema(node: VisualNode): readonly RegistryProperty[] {
    return (node.kind === 'layout' ? layoutById.get(node.type) : widgetById.get(node.type))?.properties ?? [];
  }

  return { registry: registry as CompositionRegistry, layoutEntries, widgetEntries, bindingProperties, widgetEvents, propertySchema, widgetById };
}
