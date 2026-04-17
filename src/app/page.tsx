import { BRAND } from '@/lib/brand.config';

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center animate-fade-in">
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

        <p className="text-sm mb-8" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
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
            Get Started — ${BRAND.proPriceMonthly}/month
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

        <p className="mt-12 text-xs" style={{ color: 'var(--muted)' }}>
          Built by{' '}
          <span style={{ color: 'var(--orange)' }}>{BRAND.company}</span>
        </p>
      </div>
    </main>
  );
}
