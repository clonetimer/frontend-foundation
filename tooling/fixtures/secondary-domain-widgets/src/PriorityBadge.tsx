export interface PriorityBadgeProps {
  label: string;
  level?: 'low' | 'medium' | 'high';
  count?: number;
  muted?: boolean;
  onAcknowledge?: () => void;
}

export function PriorityBadge({
  label,
  level = 'medium',
  count = 0,
  muted = false,
  onAcknowledge
}: PriorityBadgeProps) {
  return (
    <button
      type="button"
      data-priority={level}
      aria-pressed={muted}
      onClick={() => onAcknowledge?.()}
    >
      {label} · {count}
    </button>
  );
}
