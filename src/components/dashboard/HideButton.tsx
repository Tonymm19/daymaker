'use client';

interface HideButtonProps {
  contactName: string;
  onHide: () => void;
  size?: number;
  /** Optional styling override for the wrapping button. */
  style?: React.CSSProperties;
}

/**
 * Small "eye-with-slash" icon button. Confirms before firing onHide so
 * accidental clicks don't silently hide a contact across every view.
 * Parent owns the actual Firestore write via onHide.
 */
export default function HideButton({ contactName, onHide, size = 28, style }: HideButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = window.confirm(
      `Hide ${contactName} from all results? You can undo this in your Profile.`,
    );
    if (ok) onHide();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Hide ${contactName}`}
      title="Hide from all results"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        color: 'var(--muted)',
        cursor: 'pointer',
        padding: 0,
        transition: 'color 0.15s, border-color 0.15s',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--orange)';
        e.currentTarget.style.borderColor = 'var(--orange)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--muted)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A10.93 10.93 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    </button>
  );
}
