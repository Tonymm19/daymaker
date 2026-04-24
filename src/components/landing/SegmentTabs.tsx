'use client';

import { useEffect, useState } from 'react';

type Segment = 'sales' | 'fundraising' | 'cofounding';

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'sales', label: 'Sales' },
  { id: 'fundraising', label: 'Fundraising' },
  { id: 'cofounding', label: 'Co-Founding' },
];

// Copy per segment; drops into the description slot directly below the hero
// headline. Shares tone with the default hero copy but reframes the use case.
const SEGMENT_COPY: Record<Segment, string> = {
  sales:
    "Your network has the warm paths to every deal you're chasing. We find them for you, brief you on the people, and draft the outreach so you can focus on closing.",
  fundraising:
    "Every founder's network holds the investors and intros they need. We map your connections to your raise, surface the paths that matter, and prepare you for each conversation.",
  cofounding:
    "The right co-founder is already somewhere in your network. We help you find who's building in your space, what they care about, and why they'd want to build with you.",
};

const STORAGE_KEY = 'dm_landing_segment';

type Props = {
  accent: string;
  text: string;
  text2: string;
  muted: string;
};

export default function SegmentTabs({ accent, text, text2, muted }: Props) {
  const [segment, setSegment] = useState<Segment>('sales');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'sales' || saved === 'fundraising' || saved === 'cofounding') {
        setSegment(saved);
      }
    } catch {
      // localStorage unavailable (private mode, SSR) — keep default.
    }
  }, []);

  const handleClick = (s: Segment) => {
    setSegment(s);
    try {
      localStorage.setItem(STORAGE_KEY, s);
    } catch {
      // ignore
    }
    // Fire analytics if gtag is loaded. Currently gtag is NOT wired up on the
    // site; this is a forward-compatible no-op until the Google Analytics tag
    // is added. Once gtag is installed, segment selections start reporting
    // without any further changes here.
    const w = window as unknown as {
      gtag?: (cmd: string, event: string, params: Record<string, unknown>) => void;
      dataLayer?: unknown[];
    };
    if (typeof w.gtag === 'function') {
      w.gtag('event', 'landing_segment_select', { segment: s });
    } else if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event: 'landing_segment_select', segment: s });
    }
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Use case"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '24px',
          margin: '0 0 20px 0',
        }}
      >
        {SEGMENTS.map((s) => {
          const active = s.id === segment;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleClick(s.id)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 0',
                fontSize: '13px',
                fontWeight: active ? 600 : 500,
                letterSpacing: '-0.1px',
                cursor: 'pointer',
                color: active ? accent : text2,
                borderBottom: active ? `1px solid ${accent}` : `1px solid transparent`,
                fontFamily: 'inherit',
                transition: 'color 0.15s ease',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <p
        style={{
          fontSize: '18px',
          lineHeight: 1.55,
          color: text2,
          maxWidth: '540px',
          margin: '0 0 32px 0',
        }}
      >
        {SEGMENT_COPY[segment]}
      </p>
    </>
  );
}
