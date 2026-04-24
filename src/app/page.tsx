import Link from 'next/link';
import { BRAND } from '@/lib/brand.config';
import SegmentTabs from '@/components/landing/SegmentTabs';

// Warm dusk editorial palette, scoped to this page via inline styles so
// the logged-in product's navy theme is unaffected.
const C = {
  bg: '#1a1310',
  surface: '#2d1f1b',
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
  title: 'Daymaker Connect: Make your network work for you',
  description:
    "Daymaker reads your entire LinkedIn network and helps you find the right people in seconds, for events, outreach, fundraising, intros, or anything else worth asking.",
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
      {/* Scoped responsive rules, kept minimal; targets only descendants of .landing-v2 */}
      <style>{`
        .landing-v2 a { color: inherit; text-decoration: none; }
        .landing-v2 .lv2-inline-link { color: #E88A3C; text-decoration: none; }
        .landing-v2 .lv2-inline-link:hover { text-decoration: underline; }
        .landing-v2 .lv2-hero-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 64px; align-items: center; }
        .landing-v2 .lv2-hero-h1 { font-size: 52px; line-height: 1.08; letter-spacing: -1.2px; }
        .landing-v2 .lv2-nav-links { display: flex; align-items: center; gap: 28px; }
        .landing-v2 .lv2-nav-textlinks { display: flex; align-items: center; gap: 24px; }
        .landing-v2 .lv2-shell { padding-left: 48px; padding-right: 48px; }
        .landing-v2 .lv2-sec-pad { padding-top: 80px; padding-bottom: 80px; }
        .landing-v2 .lv2-cta-pad { padding-top: 96px; padding-bottom: 96px; }
        .landing-v2 .lv2-sec2-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .landing-v2 .lv2-sec2-h2 { font-size: 36px; line-height: 1.15; letter-spacing: -0.8px; }
        .landing-v2 .lv2-sec3-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .landing-v2 .lv2-sec4-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        .landing-v2 .lv2-sec5-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
        .landing-v2 .lv2-sec6-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .landing-v2 .lv2-h2-large { font-size: 36px; line-height: 1.15; letter-spacing: -0.8px; }
        .landing-v2 .lv2-final-h2 { font-size: 42px; line-height: 1.15; letter-spacing: -0.8px; }
        @media (max-width: 768px) {
          .landing-v2 .lv2-hero-grid { grid-template-columns: 1fr; gap: 40px; }
          .landing-v2 .lv2-hero-h1 { font-size: 36px; letter-spacing: -0.6px; }
          .landing-v2 .lv2-nav-textlinks { display: none; }
          .landing-v2 .lv2-shell { padding-left: 20px; padding-right: 20px; }
          .landing-v2 .lv2-sec-pad { padding-top: 64px; padding-bottom: 64px; }
          .landing-v2 .lv2-cta-pad { padding-top: 64px; padding-bottom: 64px; }
          .landing-v2 .lv2-sec2-grid { grid-template-columns: 1fr; gap: 24px; }
          .landing-v2 .lv2-sec2-h2 { font-size: 28px; letter-spacing: -0.5px; }
          .landing-v2 .lv2-sec3-grid { grid-template-columns: 1fr; }
          .landing-v2 .lv2-sec4-grid { grid-template-columns: 1fr; gap: 40px; }
          .landing-v2 .lv2-sec5-grid { grid-template-columns: 1fr; gap: 32px; }
          .landing-v2 .lv2-sec6-grid { grid-template-columns: 1fr; }
          .landing-v2 .lv2-h2-large { font-size: 28px; letter-spacing: -0.5px; }
          .landing-v2 .lv2-final-h2 { font-size: 30px; letter-spacing: -0.5px; }
          .landing-v2 .lv2-footer-row { flex-direction: column; align-items: center; text-align: center; gap: 12px; }
          .landing-v2 .lv2-footer-links { gap: 16px; }
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
            <div className="lv2-nav-textlinks">
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
          {/* Left column: copy */}
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

            <SegmentTabs accent={C.accent} text={C.text} text2={C.text2} muted={C.muted} />

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
                Try it Free
              </Link>
            </div>

            <div
              style={{
                marginTop: '18px',
                fontSize: '13px',
                color: C.text3,
              }}
            >
              No credit card required · Import your LinkedIn in 2 minutes
            </div>
          </div>

          {/* Right column: product preview card */}
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
                  note="You collaborated on a fintech report in 2023. She just posted about launching a new payments initiative. Worth a note."
                />
                <SuggestionCard
                  initials="MC"
                  name="Marcus Chen"
                  meta="Founder · Resolute Robotics"
                  note="You met at Collision 2024. His startup just raised Series A. Good moment to congratulate and catch up."
                />
                <SuggestionCard
                  initials="PS"
                  name="Priya Shah"
                  meta="Director of BD · Fieldnote Labs"
                  pill="Last: 8 mo"
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

      {/* ── Section 2: Two trigger moments ─────────────────── */}
      <section
        className="lv2-shell lv2-sec-pad"
        style={{
          background: C.surfaceAlt,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          {/* Centered headline block */}
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: C.accent,
                marginBottom: '16px',
              }}
            >
              Two moments worth catching
            </div>
            <h2
              className="lv2-sec2-h2"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: C.text,
                margin: '0 auto',
                maxWidth: '720px',
              }}
            >
              Whether a question just came up{' '}
              <span style={{ fontStyle: 'italic', color: C.accent }}>
                or an event is coming up
              </span>
              , your network already has the answer.
            </h2>
          </div>

          {/* Two-column grid */}
          <div className="lv2-sec2-grid">
            {/* Left: A question just came up */}
            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: C.text3,
                  marginBottom: '10px',
                }}
              >
                A question just came up
              </div>
              <h3
                style={{
                  fontFamily: SERIF,
                  fontSize: '26px',
                  fontWeight: 400,
                  lineHeight: 1.25,
                  color: C.text,
                  margin: '0 0 10px 0',
                }}
              >
                Ask anything. Get people, not articles.
              </h3>
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: 1.6,
                  color: C.text2,
                  margin: '0 0 20px 0',
                }}
              >
                Who might advise your board, who worked at a specific company, who moved to
                your city. Daymaker knows your network deeply enough to answer with names,
                context, and a reason.
              </p>

              {/* Product card */}
              <div
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                {/* Query bar */}
                <div
                  style={{
                    background: C.bg,
                    borderRadius: '6px',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ color: C.accent, fontSize: '13px' }}>→</span>
                  <span
                    style={{
                      fontFamily: SERIF,
                      fontStyle: 'italic',
                      fontSize: '13px',
                      color: C.text,
                    }}
                  >
                    Who in my network might want to join an advisory board?
                  </span>
                </div>

                <QueryResultCard
                  initials="SP"
                  name="Sarah Patel"
                  role="Former CRO · Kestrel Analytics"
                  subtext="Between roles after 7 years scaling SaaS revenue teams. Actively looking for 1-2 advisor seats."
                />
                <QueryResultCard
                  initials="EM"
                  name="Evan Marsh"
                  role="Partner · Hillfield Ventures"
                  subtext="Writes regularly on marketplace go-to-market. Formally advises 2 of your portfolio companies."
                />
                <QueryResultCard
                  initials="LO"
                  name="Linda Ojo"
                  role="Former VP Product · Clearspring"
                  subtext="Recently exited (acquisition by Optiv). Has advised 4 early-stage founders you know."
                  last
                />
              </div>
            </div>

            {/* Right: An event is coming up */}
            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: C.text3,
                  marginBottom: '10px',
                }}
              >
                An event is coming up
              </div>
              <h3
                style={{
                  fontFamily: SERIF,
                  fontSize: '26px',
                  fontWeight: 400,
                  lineHeight: 1.25,
                  color: C.text,
                  margin: '0 0 10px 0',
                }}
              >
                Read the room before you walk in.
              </h3>
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: 1.6,
                  color: C.text2,
                  margin: '0 0 20px 0',
                }}
              >
                Upload the attendee list. Get a scored briefing on every person: who you
                already know, who to seek out, and exactly what to say.
              </p>

              {/* Event product card */}
              <div
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: '13px',
                    color: C.text,
                    margin: 0,
                  }}
                >
                  Private VC Mixer · Menlo Park
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: C.muted,
                    marginTop: '2px',
                    marginBottom: '12px',
                  }}
                >
                  Thu, May 8 · 89 confirmed
                </div>

                <EventAttendeeCard
                  score="95"
                  scoreBg={C.accent}
                  scoreColor={C.bg}
                  name="Paulina Xu"
                  role="CEO @ Agentic Fabriq"
                  roleColor={C.accent}
                  rightText="MUST MEET"
                />
                <div style={{ height: '6px' }} />
                <EventAttendeeCard
                  score="70"
                  scoreBg="#2a1f1a"
                  scoreColor={C.text}
                  name="Sameer Nadkarni"
                  role="Atlas Technology Group"
                  roleColor={C.text2}
                  rightPill="In network"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Use Cases Grid ─────────────────────── */}
      <section
        className="lv2-shell lv2-sec-pad"
        style={{
          background: C.bg,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: C.accent,
                marginBottom: '16px',
              }}
            >
              Things people ask us
            </div>
            <h2
              className="lv2-h2-large"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: C.text,
                margin: '0 auto',
                maxWidth: '720px',
              }}
            >
              Your network already knows.{' '}
              <span style={{ fontStyle: 'italic', color: C.accent }}>
                Now you can too.
              </span>
            </h2>
          </div>

          <div className="lv2-sec3-grid">
            <UseCaseCard
              question="Who in my network works at Northwind Pay?"
              explanation="For targeted outreach, warm intros, or figuring out who could refer you in."
            />
            <UseCaseCard
              question="Who should I invite to Thursday's dinner?"
              explanation="Curate guest lists from the people in your network who actually fit the room."
            />
            <UseCaseCard
              question="Who has experience launching a healthtech SaaS?"
              explanation="Find expertise for specific problems, without posting on LinkedIn and waiting."
            />
            <UseCaseCard
              question="Who could introduce me to Sarah Lin at Helix?"
              explanation="Trace the shortest warm path from your network to any target."
            />
            <UseCaseCard
              question="Who should I target for my new consulting service?"
              explanation="Marketing outreach that starts with people who already trust you."
            />
            <UseCaseCard
              question="Which VCs in my network fund companies at my stage?"
              explanation="Narrow a fundraising list to the contacts with real relevance and familiarity."
            />
          </div>
        </div>
      </section>

      {/* ── Section 4: How It Works ───────────────────────── */}
      <section
        className="lv2-shell lv2-sec-pad"
        style={{
          background: C.surfaceAlt,
          borderTop: '1px solid #2a1f1a',
          borderBottom: '1px solid #2a1f1a',
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: C.accent,
                marginBottom: '16px',
              }}
            >
              How it works
            </div>
            <h2
              className="lv2-h2-large"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: C.text,
                margin: '0 auto',
                maxWidth: '720px',
              }}
            >
              Two minutes to set up.{' '}
              <span style={{ fontStyle: 'italic', color: C.accent }}>
                Everything after that is just asking.
              </span>
            </h2>
          </div>

          <div className="lv2-sec4-grid">
            <HowItWorksStep
              numeral="01"
              title="Connect"
              description="Download your LinkedIn connections export (LinkedIn's official tool, no scraping) and upload it. Takes about two minutes, total."
            />
            <HowItWorksStep
              numeral="02"
              title="Categorize"
              description="Daymaker reads every profile, understands roles and industries, and quietly builds an index so you can ask questions in plain English."
            />
            <HowItWorksStep
              numeral="03"
              title="Ask anything"
              description="Type a question the way you'd say it out loud. Get specific people with context on why they matter and how you know them."
            />
          </div>
        </div>
      </section>

      {/* ── Section 5: Deep Dive Callout ──────────────────── */}
      <section
        className="lv2-shell lv2-sec-pad"
        style={{
          background: C.bg,
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div className="lv2-sec5-grid">
            {/* Left */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: C.accent,
                  marginBottom: '16px',
                }}
              >
                Deep dive
              </div>
              <h2
                className="lv2-h2-large"
                style={{
                  fontFamily: SERIF,
                  fontWeight: 400,
                  lineHeight: 1.12,
                  color: C.text,
                  margin: '0 0 20px 0',
                }}
              >
                Before the meeting,{' '}
                <span style={{ fontStyle: 'italic', color: C.accent }}>
                  understand the person.
                </span>
              </h2>
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: 1.65,
                  color: C.text2,
                  margin: '0 0 24px 0',
                }}
              >
                Pick any contact. Get a synergy analysis tied to your{' '}
                <Link href="/settings#north-star" className="lv2-inline-link">
                  North Star
                </Link>{' '}
                goals: where your work overlaps, where your networks connect, and three
                concrete opportunities to collaborate. Drafted in the voice of someone who
                knows you both.
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  fontSize: '14px',
                  lineHeight: 1.7,
                  color: C.text3,
                }}
              >
                <li>• Mutual connection mapping</li>
                <li>• Collaboration opportunities with context</li>
                <li>• Drafted outreach you can actually send</li>
              </ul>
            </div>

            {/* Right: Deep Dive product card */}
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: '10px',
                padding: '22px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '14px',
                }}
              >
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: '19px', color: C.text }}>
                    Marcus Chen
                  </div>
                  <div style={{ fontSize: '13px', color: C.accent, marginTop: '2px' }}>
                    Founder · Resolute Robotics
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: '24px',
                      fontWeight: 500,
                      color: C.accent,
                      lineHeight: 1,
                    }}
                  >
                    87
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      letterSpacing: '0.5px',
                      color: C.muted,
                      marginTop: '4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Synergy
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.5px',
                  color: C.muted,
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                }}
              >
                Three opportunities
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <OpportunityCard text="Your AI governance consulting maps directly to the compliance gap Marcus mentioned in his Series A pitch." />
                <OpportunityCard text="You share 7 mutual connections in robotics. 3 could make a warm intro if useful." />
                <OpportunityCard text="He's speaking at IMG Builders in June. Consider being in the audience." />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: Trust ──────────────────────────────── */}
      <section
        className="lv2-shell lv2-sec-pad"
        style={{
          background: C.surfaceAlt,
          borderTop: '1px solid #2a1f1a',
          borderBottom: '1px solid #2a1f1a',
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: C.accent,
                marginBottom: '16px',
              }}
            >
              Built on trust
            </div>
            <h2
              className="lv2-h2-large"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: C.text,
                margin: '0 auto',
                maxWidth: '720px',
              }}
            >
              Your network is yours.{' '}
              <span style={{ fontStyle: 'italic', color: C.accent }}>Period.</span>
            </h2>
          </div>

          <div className="lv2-sec6-grid">
            <TrustCard
              title="Your data stays yours"
              body="Your contacts never enter a shared pool. We don't sell your data, don't share it with other users, don't sell to third parties. One user, one private index."
            />
            <TrustCard
              title="LinkedIn-compliant"
              body="Daymaker works with LinkedIn's official data export tool. No scraping, no policy violations, no workarounds. What you download is what we use."
            />
            <TrustCard
              title="Built by Ignitia-AI"
              body="A real company with a legal, governance, and engineering team. You can talk to the people who built it. We answer our emails."
            />
          </div>
        </div>
      </section>

      {/* ── Section 7: FAQ ────────────────────────────────── */}
      <section
        className="lv2-shell lv2-sec-pad"
        style={{ background: C.bg }}
      >
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: C.accent,
                marginBottom: '16px',
              }}
            >
              Questions, answered
            </div>
            <h2
              className="lv2-h2-large"
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                color: C.text,
                margin: 0,
              }}
            >
              The things{' '}
              <span style={{ fontStyle: 'italic', color: C.accent }}>
                everyone asks first.
              </span>
            </h2>
          </div>

          <div>
            <FaqItem
              first
              q="Do I need LinkedIn Premium?"
              a="No. Daymaker works with the free LinkedIn account and the standard data export every LinkedIn user has access to."
            />
            <FaqItem
              q="Does Daymaker scrape LinkedIn?"
              a="No. You export your connections using LinkedIn's official tool, and we build your index from that. We never touch LinkedIn directly."
            />
            <FaqItem
              q="How does my data stay private?"
              a="Your network lives in a per-user encrypted index in our database. Other Daymaker users can't see your contacts. We don't sell your data, share it, or use it to train AI models."
            />
            <FaqItem
              q="What happens if I delete my account?"
              a="Your entire index, including contacts, queries, and briefings, is permanently deleted. We keep no copies and can't recover anything after."
            />
            <FaqItem
              q="Isn't this just ChatGPT for LinkedIn?"
              a="ChatGPT has no idea who's in your network. Daymaker is purpose-built to read, understand, and query your specific LinkedIn contacts, with memory, context, and event-aware workflows ChatGPT doesn't have."
            />
            <FaqItem
              last
              q="Can I cancel anytime?"
              a={'Yes. Monthly plan, no commitment. Cancel anytime from your settings and your plan continues through the end of your current billing period. No retention emails, no "are you sure" loops.'}
            />
          </div>
        </div>
      </section>

      {/* ── Section 8: Final CTA ──────────────────────────── */}
      <section
        className="lv2-shell lv2-cta-pad"
        style={{
          background: C.surfaceAlt,
          borderTop: '1px solid #2a1f1a',
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
          <h2
            className="lv2-final-h2"
            style={{
              fontFamily: SERIF,
              fontWeight: 400,
              color: C.text,
              margin: '0 0 18px 0',
            }}
          >
            Your network is already strong.{' '}
            <span style={{ fontStyle: 'italic', color: C.accent }}>
              Let&rsquo;s put it to use.
            </span>
          </h2>
          <p
            style={{
              fontSize: '17px',
              lineHeight: 1.6,
              color: C.text2,
              margin: '0 0 32px 0',
            }}
          >
            Two minutes to set up. No credit card. You&rsquo;ll know if it&rsquo;s for
            you within a single query.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <Link
              href="/signup"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '14px 32px',
                borderRadius: '6px',
                background: C.accent,
                color: C.bg,
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '-0.1px',
              }}
            >
              Try it Free
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer
        className="lv2-shell lv2-footer"
        style={{
          paddingTop: '40px',
          paddingBottom: '40px',
          background: C.surfaceAlt,
          borderTop: `1px solid ${C.borderNav}`,
        }}
      >
        <div
          className="lv2-footer-row"
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
              Daymaker Connect · © 2026 {BRAND.company}
            </span>
          </div>
          <div
            className="lv2-footer-links"
            style={{ display: 'flex', alignItems: 'center', gap: '22px', fontSize: '12px', color: C.text3 }}
          >
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:hello@daymakerconnect.com">Contact</a>
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

function QueryResultCard({
  initials,
  name,
  role,
  subtext,
  last,
}: {
  initials: string;
  name: string;
  role: string;
  subtext: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        background: C.bg,
        borderRadius: '6px',
        padding: '10px',
        marginBottom: last ? 0 : '6px',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          flex: '0 0 28px',
          width: 28,
          height: 28,
          borderRadius: '4px',
          background: C.accent,
          color: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 700,
        }}
      >
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: '12px', color: C.text }}>{name}</div>
        <div style={{ fontSize: '12px', color: C.accent }}>{role}</div>
        <div style={{ fontSize: '12px', color: C.text2, lineHeight: 1.5, marginTop: '4px' }}>
          {subtext}
        </div>
      </div>
    </div>
  );
}

function EventAttendeeCard({
  score,
  scoreBg,
  scoreColor,
  name,
  role,
  roleColor,
  rightText,
  rightPill,
}: {
  score: string;
  scoreBg: string;
  scoreColor: string;
  name: string;
  role: string;
  roleColor: string;
  rightText?: string;
  rightPill?: string;
}) {
  return (
    <div
      style={{
        background: C.bg,
        borderRadius: '6px',
        padding: '10px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          flex: '0 0 28px',
          width: 28,
          height: 28,
          borderRadius: '4px',
          background: scoreBg,
          color: scoreColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 700,
        }}
      >
        {score}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: '12px', color: C.text }}>{name}</div>
        <div style={{ fontSize: '12px', color: roleColor }}>{role}</div>
      </div>
      {rightText && (
        <span style={{ fontSize: '9px', color: C.text3, whiteSpace: 'nowrap' }}>
          {rightText}
        </span>
      )}
      {rightPill && (
        <span
          style={{
            padding: '2px 6px',
            borderRadius: '9px',
            background: C.accentDim,
            color: C.accent,
            border: `1px solid ${C.accent}`,
            fontSize: '9px',
            whiteSpace: 'nowrap',
          }}
        >
          {rightPill}
        </span>
      )}
    </div>
  );
}

function UseCaseCard({
  question,
  explanation,
}: {
  question: string;
  explanation: string;
}) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '10px',
        padding: '22px',
      }}
    >
      <div
        style={{
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: '18px',
          lineHeight: 1.35,
          color: C.text,
          marginBottom: '10px',
        }}
      >
        {question}
      </div>
      <div style={{ fontSize: '13px', lineHeight: 1.55, color: C.text2 }}>
        {explanation}
      </div>
    </div>
  );
}

function HowItWorksStep({
  numeral,
  title,
  description,
}: {
  numeral: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: '48px',
          fontWeight: 400,
          lineHeight: 1,
          color: C.accent,
          marginBottom: '16px',
        }}
      >
        {numeral}
      </div>
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: '20px',
          fontWeight: 400,
          color: C.text,
          margin: '0 0 10px 0',
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: '15px', lineHeight: 1.6, color: C.text2, margin: 0 }}>
        {description}
      </p>
    </div>
  );
}

function OpportunityCard({ text }: { text: string }) {
  return (
    <div
      style={{
        background: C.bg,
        borderLeft: `2px solid ${C.accent}`,
        borderRadius: 0,
        padding: '10px 12px',
        fontFamily: SERIF,
        fontSize: '14px',
        lineHeight: 1.5,
        color: C.text,
      }}
    >
      {text}
    </div>
  );
}

function TrustCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '10px',
        padding: '26px',
      }}
    >
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: '20px',
          fontWeight: 400,
          color: C.text,
          margin: '0 0 10px 0',
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: '14px', lineHeight: 1.65, color: C.text2, margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

function FaqItem({
  q,
  a,
  first,
  last,
}: {
  q: string;
  a: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        paddingTop: first ? 0 : '20px',
        paddingBottom: '20px',
        borderBottom: last ? 'none' : '1px solid #4a362f',
      }}
    >
      <div
        style={{
          fontFamily: SERIF,
          fontSize: '19px',
          color: C.text,
          margin: '0 0 8px 0',
        }}
      >
        {q}
      </div>
      <div style={{ fontSize: '15px', lineHeight: 1.6, color: C.text2 }}>{a}</div>
    </div>
  );
}
