'use client';

import Link from 'next/link';

export interface LimitReachedPayload {
  error: 'limit_reached';
  message: string;
  upgradeUrl?: string;
}

/**
 * Renders when an AI endpoint returns `{ error: 'limit_reached' }`. The orange
 * accent matches our "upsell" visual language — raw red error cards would read
 * as a broken product rather than an intentional tier boundary.
 */
export default function UpgradeCard({
  message,
  upgradeUrl = '/settings',
  onDismiss,
}: {
  message: string;
  upgradeUrl?: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      style={{
        padding: '20px 24px',
        background: 'var(--orange-dim)',
        border: '1px solid var(--orange)',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <div style={{ fontSize: '22px', lineHeight: 1 }}>🚀</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Monthly limit reached
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.55 }}>
            {message}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link
          href={upgradeUrl}
          className="btn primary"
          style={{ padding: '8px 18px', fontSize: '13px', textDecoration: 'none' }}
        >
          Upgrade to Pro
        </Link>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="btn"
            style={{ padding: '8px 16px', fontSize: '13px', background: 'var(--dark)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
