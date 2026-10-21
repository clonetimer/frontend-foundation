/** Editor-only layer navigation. Does not alter Blueprint, Studio files or exported React. */
import type { CompositionNode } from '../bridge';

export interface LayerSearchResult {
  /** Matched components and their ancestors, including the page root when matches exist. */
  visibleIds: ReadonlySet<string>;
  matchedIds: ReadonlySet<string>;
}

export function searchStudioLayers(root: CompositionNode, query: string, displayName: (node: CompositionNode) => string): LayerSearchResult {
  const search = query.trim().toLocaleLowerCase();
  const visibleIds = new Set<string>();
  const matchedIds = new Set<string>();
  // Empty search displays everything without an extra pass of the visible tree.
  if (!search) return { visibleIds, matchedIds };
  const visit = (node: CompositionNode): boolean => {
    const match = `${node.id} ${node.type} ${displayName(node)}`.toLocaleLowerCase().includes(search);
    if (match) matchedIds.add(node.id);
    let childMatch = false;
    for (const child of node.children ?? []) childMatch = visit(child) || childMatch;
    if (match || childMatch) visibleIds.add(node.id);
    return match || childMatch;
  };
  visit(root);
  return { visibleIds, matchedIds };
}

export function expandableLayerIds(root: CompositionNode): string[] {
  const result: string[] = [];
  const walk = (node: CompositionNode) => {
    if (node.children?.length) result.push(node.id);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return result;
}

/** Root-to-selection path, with no generated or unstable node identities. */
export function selectedLayerPath(root: CompositionNode, selectedId: string): CompositionNode[] {
  const visit = (node: CompositionNode, parents: CompositionNode[]): CompositionNode[] => {
    const chain = [...parents, node];
    if (node.id === selectedId) return chain;
    for (const child of node.children ?? []) {
      const found = visit(child, chain);
      if (found.length) return found;
    }
    return [];
  };
  return visit(root, []);
}

/** Reveal a canvas-selected component by unfolding only its ancestor groups.
 * Collapsing a group that already contains the selection remains possible until
 * a fresh canvas/breadcrumb/layer selection. Unknown IDs never alter folds. */
export function revealSelectedLayerAncestors(root: CompositionNode, selectedId: string, collapsed: readonly string[]): string[] {
  const path = selectedLayerPath(root, selectedId);
  if (!path.length) return [...collapsed];
  const ancestors = new Set(path.slice(0, -1).map((node) => node.id));
  return collapsed.filter((id) => !ancestors.has(id));
}

/** An explicit selection outside the active filter must not remain hidden. */
export function layerSearchAfterSelection(query: string, selectedId: string, visibleIds: ReadonlySet<string>): string {
  return query.trim() && !visibleIds.has(selectedId) ? '' : query;
}

/** Scroll only the Layers pane, by the minimum amount necessary to reveal a row.
 * Item coordinates are measured relative to the scroller's content origin. */
export function layerScrollPosition(scrollTop: number, viewportHeight: number, itemTop: number, itemBottom: number, margin = 8): number {
  if (![scrollTop, viewportHeight, itemTop, itemBottom, margin].every(Number.isFinite)
      || viewportHeight <= 0 || itemBottom < itemTop) return scrollTop;
  const inset = Math.min(Math.max(0, margin), viewportHeight / 4);
  if (itemTop < scrollTop + inset) return Math.max(0, itemTop - inset);
  if (itemBottom > scrollTop + viewportHeight - inset) return Math.max(0, itemBottom - viewportHeight + inset);
  return scrollTop;
}

export type StudioUndoAction = 'undo' | 'redo' | null;
export function studioUndoShortcut(input: {
  key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
  editableTarget: boolean; editingDisabled: boolean;
}): StudioUndoAction {
  if (input.editingDisabled || input.editableTarget || input.altKey || !(input.ctrlKey || input.metaKey)) return null;
  const key = input.key.toLowerCase();
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !input.shiftKey) return 'redo';
  return null;
}
