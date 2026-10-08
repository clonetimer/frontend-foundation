export interface InteractiveViewerProps {
  itemId: string;
  mode?: 'overview' | 'detail';
  interactive?: boolean;
  onItemChange?: (itemId: string) => void;
}

export function InteractiveViewer({ itemId, mode = 'overview', interactive = true, onItemChange }: InteractiveViewerProps) {
  return (
    <section aria-label={`Interactive view for ${itemId}`} style={{ minHeight: 220, border: '1px solid currentColor', borderRadius: 8, padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>{itemId}</strong>
        <span>{mode === 'overview' ? 'Overview' : 'Detail'}</span>
      </header>
      <svg viewBox="0 0 400 150" role="img" aria-label="Illustrative interactive preview" style={{ width: '100%', height: 150 }}>
        <rect x="55" y="30" width="290" height="90" rx="12" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="130" cy="75" r="22" fill="currentColor" opacity="0.18" />
        <path d="M175 95 C220 20, 260 130, 320 55" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      {interactive ? <button type="button" onClick={() => onItemChange?.(itemId)}>Focus item</button> : null}
    </section>
  );
}
