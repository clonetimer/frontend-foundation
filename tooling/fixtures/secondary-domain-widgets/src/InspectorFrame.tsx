import type { ReactNode } from 'react';

export interface InspectorFrameProps {
  title: string;
  width?: number;
  collapsed?: boolean;
  children?: ReactNode;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function InspectorFrame({
  title,
  width = 320,
  collapsed = false,
  children,
  onCollapseChange
}: InspectorFrameProps) {
  return (
    <aside data-inspector-frame style={{ width }}>
      <button type="button" onClick={() => onCollapseChange?.(!collapsed)}>
        {collapsed ? `Expand ${title}` : `Collapse ${title}`}
      </button>
      {collapsed ? null : <div>{children}</div>}
    </aside>
  );
}
