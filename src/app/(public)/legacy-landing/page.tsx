import Link from 'next/link';
import { BRAND } from '@/lib/brand.config';

const FEATURES = [
  {
    icon: '🔍',
    title: 'Network Intelligence',
    body:
      "Search and query your entire LinkedIn network with AI. Ask questions like 'Who do I know in robotics?' and get actionable answers with conversation starters.",
  },
  {
    icon: '📋',
    title: 'Event Briefings',
    body:
      'Prepare for any event in minutes. Get scored attendee rankings, conversation starters, and strategic recommendations for who to meet.',
  },
  {
    icon: '⚡',
    title: 'Deep Dive Synergy',
    body:
      'Strategic synergy analysis between you and any contact. Discover mutual connections, collaboration opportunities, and next steps.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-5xl w-full text-center animate-fade-in">
        {/* Sun icon */}
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-gradient-to-br from-orange to-amber flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0E1B24" strokeWidth="2" className="w-8 h-8">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>

        <h1 className="font-serif text-4xl md:text-5xl mb-4" style={{ color: 'var(--text)' }}>
          <span style={{ color: 'var(--orange)' }}>{BRAND.nameShort}</span>{' '}
          Connect
        </h1>

        <p className="text-lg mb-2" style={{ color: 'var(--text2)', fontWeight: 500 }}>
          {BRAND.tagline}
        </p>

        <p className="text-sm mb-8 max-w-2xl mx-auto" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
          {BRAND.description}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/signup"
            className="px-8 py-3 rounded-btn font-semibold text-sm transition-all"
            style={{
              backgroundColor: 'var(--orange)',
              color: 'var(--dark)',
              border: '1px solid var(--orange)',
            }}
          >
            Get Started Free
          </a>
          <a
            href="/login"
            className="px-8 py-3 rounded-btn font-semibold text-sm transition-all"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >
            Sign In
          </a>
        </div>

        <p
          className="mt-8 text-sm max-w-2xl mx-auto"
          style={{ color: 'var(--text2)', lineHeight: 1.6 }}
        >
          Built for professionals with LinkedIn and events connections who want to turn their
          network into their competitive advantage.
        </p>

        <div
          className="mt-10 grid gap-4 text-left"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '24px',
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>{f.icon}</div>
              <div
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '20px',
                  color: 'var(--text)',
                  marginBottom: '8px',
                }}
              >
                {f.title}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
                {f.body}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs" style={{ color: 'var(--muted)' }}>
          Built by{' '}
          <span style={{ color: 'var(--orange)' }}>{BRAND.company}</span>
        </p>

        <div
          className="mt-6 flex flex-wrap justify-center gap-4 text-xs"
          style={{ color: 'var(--muted)' }}
        >
          <Link href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            Privacy Policy
          </Link>
          <Link href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            Terms
          </Link>
        </div>
      </div>
    </main>
  );
}
