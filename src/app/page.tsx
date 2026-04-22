import Link from 'next/link';
import { BRAND } from '@/lib/brand.config';

// Warm dusk editorial palette — scoped to this page via inline styles so
// the logged-in product's navy theme is unaffected.
const C = {
  bg: '#1a1310',
  surface: '#24191A',
  surfaceAlt: '#15100D',
  text: '#F5EDE0',
  text2: '#B5A894',
  text3: '#8A7E6E',
  muted: '#75695a',
  accent: '#E88A3C',
  accentDim: '#2d1f14',
  border: '#3a2a27',
  borderNav: '#3a2f27',
};

const SERIF = "'Instrument Serif', Georgia, serif";

function SunMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" width={size} height={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

export const metadata = {
  title: 'Daymaker Connect — Make your network work for you',
  description:
    "Daymaker reads your entire LinkedIn network and helps you find the right people in seconds — for events, outreach, fundraising, intros, or anything else worth asking.",
};

export default function LandingPage() {
  return (
    <div
      className="landing-v2"
      style={{
        background: C.bg,
        color: C.text,
        minHeight: '100vh',
        fontFamily: 'var(--font-dm-sans), system-ui, -apple-system, Segoe UI, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Scoped responsive rules — kept minimal, targets only descendants of .landing-v2 */}
      <style>{`
        .landing-v2 a { color: inherit; text-decoration: none; }
        .landing-v2 .lv2-hero-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 64px; align-items: center; }
        .landing-v2 .lv2-hero-h1 { font-size: 52px; line-height: 1.08; letter-spacing: -1.2px; }
        .landing-v2 .lv2-nav-links { display: flex; align-items: center; gap: 28px; }
        .landing-v2 .lv2-shell { padding: 0 48px; }
        @media (max-width: 768px) {
          .landing-v2 .lv2-hero-grid { grid-template-columns: 1fr; gap: 40px; }
          .landing-v2 .lv2-hero-h1 { font-size: 36px; letter-spacing: -0.6px; }
          .landing-v2 .lv2-nav-textlinks { display: none; }
          .landing-v2 .lv2-shell { padding: 0 20px; }
        }
      `}</style>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav
        className="lv2-shell"
        style={{
          borderBottom: `1px solid ${C.borderNav}`,
          background: C.bg,
        }}
      >
        <div
          style={{
            maxWidth: '1080px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '68px',
          }}
        >
          <Link
            href="/"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', color: C.text }}
          >
            <SunMark size={20} />
            <span style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.2px' }}>
              Daymaker Connect
            </span>
          </Link>

          <div className="lv2-nav-links">
            <div
              className="lv2-nav-textlinks"
              style={{ display: 'flex', alignItems: 'center', gap: '24px' }}
            >
              <a href="#how-it-works" style={{ fontSize: '13px', color: C.text2 }}>
                How it works
              </a>
              <a href="#pricing" style={{ fontSize: '13px', color: C.text2 }}>
                Pricing
              </a>
            </div>
            <Link
              href="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${C.borderNav}`,
                fontSize: '13px',
                color: C.text,
                background: 'transparent',
              }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="lv2-shell"
        style={{
          paddingTop: '72px',
          paddingBottom: '56px',
        }}
      >
        <div
          className="lv2-hero-grid"
          style={{ maxWidth: '1080px', margin: '0 auto' }}
        >
          {/* Left column — copy */}
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: C.accent,
                marginBottom: '20px',
              }}
            >
              For people who show up
            </div>

            <h1
              className="lv2-hero-h1"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: C.text,
                margin: '0 0 24px 0',
              }}
            >
              You&rsquo;ve spent years building your network.{' '}
              <span style={{ fontStyle: 'italic', color: C.accent }}>
                Let&rsquo;s make it work for you.
              </span>
            </h1>

            <p
              style={{
                fontSize: '17px',
                lineHeight: 1.55,
                color: C.text2,
                maxWidth: '540px',
                margin: '0 0 32px 0',
              }}
            >
              Daymaker reads your entire LinkedIn network and helps you find the right people
              in seconds &mdash; for events, outreach, fundraising, intros, or anything else worth
              asking.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <Link
                href="/signup"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '14px 26px',
                  borderRadius: '10px',
                  background: C.accent,
                  color: '#1a1310',
                  fontSize: '14px',
                  fontWeight: 600,
                  letterSpacing: '-0.1px',
                }}
              >
                Try it free
              </Link>
            </div>

            <div
              style={{
                marginTop: '18px',
                fontSize: '12px',
                color: C.text3,
              }}
            >
              No credit card required · Import your LinkedIn in 2 minutes
            </div>
          </div>

          {/* Right column — product preview card */}
          <div style={{ position: 'relative' }}>
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: '14px',
                padding: '22px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
              }}
            >
              {/* Card top row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3f3430' }} />
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3f3430' }} />
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3f3430' }} />
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '1.8px',
                    textTransform: 'uppercase',
                    color: C.text3,
                  }}
                >
                  AI Agent · 2,405 Contacts
                </div>
              </div>

              {/* Query bar */}
              <div
                style={{
                  background: C.surfaceAlt,
                  border: `1px solid ${C.border}`,
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '18px',
                }}
              >
                <span style={{ color: C.accent, fontSize: '14px' }}>→</span>
                <span
                  style={{
                    fontFamily: SERIF,
                    fontStyle: 'italic',
                    fontSize: '15px',
                    color: C.text,
                  }}
                >
                  Who should I reconnect with this month?
                </span>
              </div>

              {/* Label */}
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '1.8px',
                  textTransform: 'uppercase',
                  color: C.text3,
                  marginBottom: '10px',
                }}
              >
                Three suggestions
              </div>

              {/* Suggestion cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <SuggestionCard
                  initials="JW"
                  name="Jamie Walker"
                  meta="VP Product · Northwind Pay"
                  note="You collaborated on a fintech report in 2023. She just posted about launching a new payments initiative — worth a note."
                />
                <SuggestionCard
                  initials="MC"
                  name="Marcus Chen"
                  meta="Founder · Resolute Robotics"
                  note="You met at Collision 2024. His startup just raised Series A — good moment to congratulate and catch up."
                />
                <SuggestionCard
                  initials="PS"
                  name="Priya Shah"
                  meta="Director of BD · Fieldnote Labs"
                  pill="8 months"
                />
              </div>
            </div>

            {/* Floating pill, bottom-left */}
            <div
              style={{
                position: 'absolute',
                left: '-8px',
                bottom: '-14px',
                padding: '6px 12px',
                borderRadius: '999px',
                background: C.accentDim,
                border: `1px solid ${C.accent}40`,
                color: C.accent,
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.2px',
              }}
            >
              Answered in seconds
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer
        className="lv2-shell"
        style={{
          marginTop: '40px',
          padding: '40px 48px',
          background: C.surfaceAlt,
          borderTop: `1px solid ${C.borderNav}`,
        }}
      >
        <div
          style={{
            maxWidth: '1080px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: C.text3, fontSize: '12px' }}>
            <SunMark size={16} />
            <span>
              Daymaker Connect · Built by {BRAND.company}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px', fontSize: '12px', color: C.text3 }}>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href={`mailto:support@${BRAND.domain}`}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SuggestionCard({
  initials,
  name,
  meta,
  note,
  pill,
}: {
  initials: string;
  name: string;
  meta: string;
  note?: string;
  pill?: string;
}) {
  return (
    <div
      style={{
        background: C.surfaceAlt,
        border: `1px solid ${C.border}`,
        borderRadius: '10px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
      }}
    >
      <div
        style={{
          flex: '0 0 36px',
          width: 36,
          height: 36,
          borderRadius: '8px',
          background: C.accent,
          color: '#1a1310',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.3px',
        }}
      >
        {initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginBottom: '2px',
          }}
        >
          <div style={{ fontSize: '14px', color: C.text, fontWeight: 600 }}>{name}</div>
          {pill && (
            <span
              style={{
                padding: '3px 8px',
                borderRadius: '999px',
                border: `1px solid ${C.accent}`,
                color: C.accent,
                fontSize: '10px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {pill}
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: C.text3, marginBottom: note ? '6px' : 0 }}>
          {meta}
        </div>
        {note && (
          <div
            style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: '13px',
              color: C.text2,
              lineHeight: 1.5,
            }}
          >
            {note}
          </div>
        )}
      </div>
    </div>
  );
}
