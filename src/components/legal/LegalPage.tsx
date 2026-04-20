import Link from 'next/link';
import { BRAND } from '@/lib/brand.config';

interface LegalPageProps {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, effectiveDate, children }: LegalPageProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--darker)', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          <span
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, var(--orange), #c47010)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#0E1B24" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </span>
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '-0.3px' }}>
            Daymaker <span style={{ color: 'var(--text)', fontWeight: 400 }}>Connect</span>
          </span>
        </Link>
        <Link
          href="/dashboard"
          style={{ fontSize: '13px', color: 'var(--text2)', textDecoration: 'none' }}
        >
          Back to app →
        </Link>
      </header>

      <main
        style={{
          maxWidth: '760px',
          width: '100%',
          margin: '0 auto',
          padding: '48px 24px 80px',
          flex: 1,
        }}
      >
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '40px',
            fontWeight: 400,
            color: 'var(--text)',
            margin: '0 0 8px 0',
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: '12px',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            margin: '0 0 32px 0',
          }}
        >
          Effective {effectiveDate}
        </p>

        <div className="legal-content">{children}</div>
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '20px 24px',
          textAlign: 'center',
          color: 'var(--muted)',
          fontSize: '12px',
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <span>© 2026 {BRAND.company} · {BRAND.name}</span>
        <Link href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Privacy Policy</Link>
        <Link href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Terms</Link>
      </footer>
    </div>
  );
}
