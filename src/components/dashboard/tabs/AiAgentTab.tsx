import { useState, useMemo, useEffect, type ReactNode, type CSSProperties } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import Link from 'next/link';
import { getAuth } from '@/lib/firebase/config';
import UpgradeCard from '@/components/ui/UpgradeCard';

// Shape of the matched-contacts list returned by /api/ai/query. Used to map
// names in the markdown response back to real contactIds so a click on the
// person's heading opens ContactDetailModal.
type MatchedContact = { contactId: string; fullName: string; linkedInUrl: string };

// Shared style for the person-block heading, referenced by both the default
// markdown renderer and the clickable variant.
const PERSON_HEADING_STYLE: CSSProperties = {
  fontSize: '15px', fontWeight: 600, color: 'var(--text)',
  margin: '0 0 10px 0',
  padding: '2px 0 2px 12px',
  borderLeft: '3px solid var(--orange)',
};

// Clickable variant of the person heading — used when the name text matches a
// known contactId. Hover adds an orange underline so the affordance reads.
function ClickableName({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <h4
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...PERSON_HEADING_STYLE,
        cursor: 'pointer',
        textDecoration: hover ? 'underline' : 'none',
        textDecorationColor: 'var(--orange)',
        textUnderlineOffset: '3px',
      }}
    >
      {children}
    </h4>
  );
}

// Action pills shown at the bottom of each person card. Renders up to three:
//   - View on LinkedIn (external link, blue pill)
//   - 📋 Contact Card  (opens ContactDetailModal via onSelectContact)
//   - Deep Dive ⚡    (routes to /deepdive/new?contactId=...)
// The modal + deep-dive pills only render when the name matched a known
// contact. LinkedIn renders whenever a URL is available (from the matched
// contact record or from the markdown Claude produced).
const PILL_BASE: CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  textDecoration: 'none',
  letterSpacing: '0.3px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1.6,
};

function PersonActionBar({
  linkedInUrl,
  contactId,
  onSelectContact,
}: {
  linkedInUrl: string | null;
  contactId: string | null;
  onSelectContact?: (contactId: string) => void;
}) {
  const hasAny = Boolean(linkedInUrl || (contactId && onSelectContact) || contactId);
  if (!hasAny) return null;

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
      {linkedInUrl && (
        <a href={linkedInUrl} target="_blank" rel="noreferrer"
          style={{ ...PILL_BASE, background: 'var(--blue-dim)', color: 'var(--blue)' }}>
          View on LinkedIn
        </a>
      )}
      {contactId && onSelectContact && (
        <button
          type="button"
          onClick={() => onSelectContact(contactId)}
          style={{
            ...PILL_BASE,
            background: 'var(--surface2)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          }}
        >
          📋 Contact Card
        </button>
      )}
      {contactId && (
        <Link
          href={`/deepdive/new?contactId=${contactId}`}
          style={{ ...PILL_BASE, background: 'var(--orange-dim)', color: 'var(--orange)' }}
        >
          Deep Dive ⚡
        </Link>
      )}
    </div>
  );
}

// Matches a markdown "[View on LinkedIn](https://...)" link and captures the URL.
const LINKEDIN_LINK_RE = /\[View on LinkedIn\]\((https?:\/\/[^\s)]+)\)/i;
// Same link pattern, anchored so we can strip the entire line from the markdown.
const LINKEDIN_LINK_LINE_RE = /^\s*\[View on LinkedIn\]\([^)]+\)\s*$/gim;

// Flatten React nodes to plain text for content-based styling decisions
// (e.g. detecting "Next Actions" headings, LinkedIn links).
const nodeText = (node: ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
};

// Card wrapper applied to each person's recommendation block.
const personCardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '16px 18px',
  marginBottom: '12px',
};

// Split agent markdown into alternating "person" (### ...) and "other" segments.
// Person segments get wrapped in a card; other segments (section headings,
// intros, Next Actions) render as plain markdown between cards.
type Segment = { type: 'person' | 'other'; content: string };

function splitAgentResponse(src: string): Segment[] {
  const segments: Segment[] = [];
  let currentType: Segment['type'] = 'other';
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join('\n').replace(/^\s+|\s+$/g, '');
    if (content) segments.push({ type: currentType, content });
    buffer = [];
  };

  for (const line of src.split('\n')) {
    if (line.startsWith('### ')) {
      flush();
      currentType = 'person';
      buffer = [line];
    } else if (line.startsWith('## ') || line.startsWith('# ')) {
      flush();
      currentType = 'other';
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return segments;
}

// Styled markdown renderers. Shared module-scope so they are not re-created
// on every component render.
const mdComponents: Components = {
  h1: ({ children }) => (
    <h2 style={{
      fontSize: '20px', fontWeight: 700, color: 'var(--text)',
      margin: '24px 0 12px 0',
      paddingBottom: '8px',
      borderBottom: '1px solid var(--border)',
    }}>{children}</h2>
  ),
  h2: ({ children }) => {
    const text = nodeText(children).toLowerCase();
    const isAction = /next action|next step|\bsummary\b|recommended action|key takeaway/.test(text);
    if (isAction) {
      return (
        <h3 style={{
          fontSize: '13px', fontWeight: 700, color: 'var(--orange)',
          margin: '32px 0 12px 0',
          padding: '12px 16px',
          background: 'var(--orange-dim)',
          borderLeft: '3px solid var(--orange)',
          borderRadius: '4px',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>{children}</h3>
      );
    }
    return (
      <h3 style={{
        fontSize: '16px', fontWeight: 700, color: 'var(--text)',
        margin: '40px 0 16px 0',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--border)',
      }}>{children}</h3>
    );
  },
  h3: ({ children }) => (
    // Person-block heading. Lives inside a .personCardStyle wrapper, so the
    // top margin is 0 — the card's padding provides the breathing room.
    <h4 style={PERSON_HEADING_STYLE}>{children}</h4>
  ),
  h4: ({ children }) => (
    <h5 style={{
      fontSize: '13px', fontWeight: 700, color: 'var(--text)',
      margin: '16px 0 6px 0',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}>{children}</h5>
  ),
  p: ({ children }) => (
    <p style={{ margin: '0 0 14px 0', lineHeight: 1.65, color: 'var(--text2)' }}>
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ fontStyle: 'italic' }}>{children}</em>
  ),
  a: ({ href, children }) => {
    // Detect the "View on LinkedIn" link at the end of a person block and
    // render it as a pill rather than an inline text link.
    const text = nodeText(children);
    const isLinkedIn =
      /linkedin/i.test(text) || (typeof href === 'string' && /linkedin\.com/i.test(href));
    if (isLinkedIn) {
      return (
        <a href={href} target="_blank" rel="noreferrer" style={{
          display: 'inline-block',
          background: 'var(--blue-dim)',
          color: 'var(--blue)',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          textDecoration: 'none',
          letterSpacing: '0.3px',
        }}>
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer"
         style={{ color: 'var(--blue)', textDecoration: 'underline' }}>
        {children}
      </a>
    );
  },
  ul: ({ children }) => (
    <ul style={{ margin: '0 0 14px 0', paddingLeft: '22px', lineHeight: 1.65, color: 'var(--text2)' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: '0 0 14px 0', paddingLeft: '22px', lineHeight: 1.65, color: 'var(--text2)' }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ margin: '4px 0' }}>{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      margin: '10px 0 24px 0',
      padding: '10px 14px 0 14px',
      borderLeft: '3px solid var(--orange)',
      background: 'var(--orange-dim)',
      borderRadius: '0 4px 4px 0',
      fontStyle: 'italic',
      color: 'var(--text)',
      lineHeight: 1.6,
    }}>
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '28px 0' }} />
  ),
  code: ({ children }) => (
    <code style={{
      background: 'var(--dark)', padding: '2px 6px', borderRadius: '3px',
      fontSize: '13px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)',
    }}>{children}</code>
  ),
};

interface AiAgentTabProps {
  /** Called when a person name in the response matches a contact and is clicked. */
  onSelectContact?: (contactId: string) => void;
}

// Phase labels shown below the spinner while /api/ai/query is running. Phases
// advance on a timer, not real progress signals — the backend is a single
// request — so the copy just matches user expectations for each stage.
const PHASE_LABELS = [
  'Searching your network...',
  'Analyzing relevant contacts...',
  'Generating recommendations...',
];

// Extract the final question the agent ended on, if any. We look at the last
// paragraph of the markdown response, strip heading/list markers, and return
// the trailing question sentence so the UI can offer a one-click "Yes, do this".
function extractTrailingQuestion(src: string): string | null {
  if (!src) return null;
  // Drop trailing whitespace and split into paragraphs.
  const paragraphs = src.trim().split(/\n\s*\n/);
  // Walk backwards through paragraphs skipping empty / non-prose blocks.
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    let p = paragraphs[i].trim();
    // Skip LinkedIn pill / blockquote / hr remnants.
    if (!p || p.startsWith('---') || p.startsWith('>')) continue;
    // Strip leading markdown markers: #, -, *, digits.
    p = p.replace(/^[#>\-*\d.)\s]+/, '').trim();
    if (!p) continue;
    // The last sentence that ends in a '?' is the question we want.
    const sentences = p.match(/[^.!?]*\?/g);
    if (sentences && sentences.length > 0) {
      return sentences[sentences.length - 1].trim();
    }
    // First non-empty paragraph didn't contain a question; stop searching.
    return null;
  }
  return null;
}

export default function AiAgentTab({ onSelectContact }: AiAgentTabProps = {}) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState<{ message: string; upgradeUrl: string } | null>(null);
  const [metrics, setMetrics] = useState<{ tokensUsed: number; durationMs: number; ragUsed: boolean; contactsReferenced: number } | null>(null);
  const [matchedContacts, setMatchedContacts] = useState<MatchedContact[]>([]);
  const [phaseIndex, setPhaseIndex] = useState(0);
  // Follow-up round state. `lastAskedQuery` is the original query string so the
  // "Give me more results" click re-runs the same prompt. `followUpResponses`
  // holds subsequent rounds' markdown, rendered as stacked cards under the
  // primary response. `shownContactIds` accumulates across rounds and is sent
  // as the exclusion list on the next click.
  const [lastAskedQuery, setLastAskedQuery] = useState('');
  const [followUpResponses, setFollowUpResponses] = useState<string[]>([]);
  const [shownContactIds, setShownContactIds] = useState<string[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [moreExhausted, setMoreExhausted] = useState(false);

  // Walk phase labels on a simple schedule: 0 → 1 at 5s, 1 → 2 at 15s.
  useEffect(() => {
    if (!isLoading) {
      setPhaseIndex(0);
      return;
    }
    const t1 = setTimeout(() => setPhaseIndex(1), 5000);
    const t2 = setTimeout(() => setPhaseIndex(2), 15000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLoading]);

  // Matched contacts sorted longest-fullName-first so "John Smith" wins over
  // "John" when both would substring-match inside the same heading text.
  const sortedMatched = useMemo(
    () => [...matchedContacts].sort((a, b) => b.fullName.length - a.fullName.length),
    [matchedContacts],
  );

  // Extend the base markdown renderers with an h3 that turns a matched name
  // into a clickable link to ContactDetailModal.
  const resolvedComponents = useMemo<Components>(() => {
    return {
      ...mdComponents,
      h3: ({ children }) => {
        const text = nodeText(children).toLowerCase();
        const match = sortedMatched.find(
          (c) => c.fullName && text.includes(c.fullName.toLowerCase())
        );
        if (match && onSelectContact) {
          return (
            <ClickableName onClick={() => onSelectContact(match.contactId)}>
              {children}
            </ClickableName>
          );
        }
        return <h4 style={PERSON_HEADING_STYLE}>{children}</h4>;
      },
    };
  }, [sortedMatched, onSelectContact]);

  const suggestions = [
    "Who works in robotics?",
    "Find VC connections in Series A",
    "Show me marketing executives",
    "I need a warm intro to Acme Corp"
  ];

  const handleAsk = async (text: string) => {
    if (!text.trim()) return;

    setQuery(text);
    setIsLoading(true);
    setError('');
    setLimitReached(null);
    setResponse('');
    setMetrics(null);
    setMatchedContacts([]);
    setFollowUpResponses([]);
    setShownContactIds([]);
    setMoreExhausted(false);
    setLastAskedQuery(text);

    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();

      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ query: text })
      });

      // Cloud Run returns a plain-text/HTML page (not JSON) on 503/504 when
      // the container OOMs or exceeds the request timeout. Guard the parse
      // so we surface a friendly message instead of "Unexpected token <".
      let data: { content?: string; response?: string; tokensUsed?: number; durationMs?: number; ragUsed?: boolean; contactsReferenced?: number; matchedContacts?: MatchedContact[]; error?: string; message?: string; upgradeUrl?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        if (data.error === 'limit_reached') {
          setLimitReached({
            message: data.message || "You've used your free AI queries this month. Upgrade to Pro for unlimited queries.",
            upgradeUrl: data.upgradeUrl || '/settings',
          });
          return;
        }
        if (res.status === 501) {
          throw new Error('AI Agent functionality is not yet implemented (Pending Task 6).');
        }
        if (res.status === 503 || res.status === 504) {
          throw new Error('Your network is large and the query timed out. Please try again.');
        }
        throw new Error(data.error || `Failed to query AI agent (HTTP ${res.status})`);
      }

      setResponse(data.content || data.response || 'No response generated.');
      setMetrics({
        tokensUsed: data.tokensUsed || 0,
        durationMs: data.durationMs || 0,
        ragUsed: !!data.ragUsed,
        contactsReferenced: data.contactsReferenced || 0
      });
      const initialMatched = Array.isArray(data.matchedContacts) ? data.matchedContacts : [];
      setMatchedContacts(initialMatched);
      setShownContactIds(initialMatched.map((c: MatchedContact) => c.contactId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetMore = async () => {
    if (!lastAskedQuery || isFetchingMore || moreExhausted) return;

    setIsFetchingMore(true);
    setError('');

    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();

      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: lastAskedQuery,
          excludeContactIds: shownContactIds,
        }),
      });

      let data: { content?: string; matchedContacts?: MatchedContact[]; noMoreMatches?: boolean; error?: string; message?: string; upgradeUrl?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        if (data.error === 'limit_reached') {
          setLimitReached({
            message: data.message || "You've used your free AI queries this month. Upgrade to Pro for unlimited queries.",
            upgradeUrl: data.upgradeUrl || '/settings',
          });
          return;
        }
        throw new Error(data.error || `Failed to fetch more results (HTTP ${res.status})`);
      }

      const newMatched = Array.isArray(data.matchedContacts) ? data.matchedContacts : [];
      const newIds = newMatched.map((c) => c.contactId);
      const content = data.content || '';
      const hasPersonBlocks = /^###\s/m.test(content);

      if (data.noMoreMatches || !hasPersonBlocks || newMatched.length === 0) {
        setMoreExhausted(true);
        // Still append a short note so the user sees Claude's "no more" reply
        // in context rather than just a button state change.
        if (content && hasPersonBlocks) {
          setFollowUpResponses((prev) => [...prev, content]);
          setMatchedContacts((prev) => [...prev, ...newMatched]);
          setShownContactIds((prev) => [...prev, ...newIds]);
        }
        return;
      }

      setFollowUpResponses((prev) => [...prev, content]);
      setMatchedContacts((prev) => [...prev, ...newMatched]);
      setShownContactIds((prev) => [...prev, ...newIds]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch more results');
    } finally {
      setIsFetchingMore(false);
    }
  };

  return (
    <div id="dsub-ai" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text)' }}>Ask Daymaker Agent</h3>
        
        <div className="ai-input-area" style={{ position: 'relative', marginBottom: '16px' }}>
          <textarea 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
            placeholder="E.g., Which of my connections could help me understand market trends in AI healthcare?"
            style={{
              width: '100%',
              minHeight: '100px',
              background: 'var(--darker)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '16px',
              color: 'var(--text)',
              fontSize: '14px',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit'
            }}
          />
          <button 
            className="ai-btn btn"
            onClick={() => handleAsk(query)}
            disabled={isLoading || !query.trim()}
            style={{ 
              position: 'absolute', 
              bottom: '16px', 
              right: '16px',
              padding: '8px 16px',
              fontSize: '13px'
            }}
          >
            {isLoading ? 'Thinking...' : 'Ask Agent'}
          </button>
        </div>

        <div className="ai-suggestions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {suggestions.map(sug => (
            <button 
              key={sug}
              className="ai-sugg"
              onClick={() => handleAsk(sug)}
              disabled={isLoading}
              style={{
                background: 'var(--dark)',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
                padding: '6px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* Output Area */}
      {(isLoading || response || error) && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--orange)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4"></path>
              <path d="M12 18v4"></path>
              <path d="M4.93 4.93l2.83 2.83"></path>
              <path d="M16.24 16.24l2.83 2.83"></path>
              <path d="M2 12h4"></path>
              <path d="M18 12h4"></path>
              <path d="M4.93 19.07l2.83-2.83"></path>
              <path d="M16.24 7.76l2.83-2.83"></path>
            </svg>
            <h3 style={{ margin: 0, fontSize: '15px' }}>Agent Response</h3>
          </div>
          
          <div className="ai-response-content" style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.6 }}>
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="loading-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }} />
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{PHASE_LABELS[phaseIndex]}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '32px' }}>
                  Large networks may take 15-30 seconds
                </div>
              </div>
            )}
            
            {limitReached && (
              <UpgradeCard
                message={limitReached.message}
                upgradeUrl={limitReached.upgradeUrl}
                onDismiss={() => setLimitReached(null)}
              />
            )}

            {error && (
              <div style={{ color: 'var(--red)', padding: '16px', background: 'var(--red-dim)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{error}</span>
                {error.toLowerCase().includes('upgrade') && (
                  <a href="/settings" className="btn" style={{ background: 'var(--red)', color: 'var(--text)', border: 'none', padding: '6px 12px', fontSize: '12px', textDecoration: 'none' }}>
                    Upgrade to Pro
                  </a>
                )}
              </div>
            )}

            {response && !isLoading && (
              <>
                {splitAgentResponse(response).map((seg, i) => {
                  if (seg.type !== 'person') {
                    return <ReactMarkdown key={i} components={resolvedComponents}>{seg.content}</ReactMarkdown>;
                  }
                  // Parse the person block for name + LinkedIn URL, then strip
                  // the LinkedIn line from the markdown so it isn't rendered
                  // twice (we render it as a pill in the action bar instead).
                  const firstLine = seg.content.split('\n', 1)[0] ?? '';
                  const nameHeading = firstLine.replace(/^### /, '').toLowerCase();
                  const match =
                    sortedMatched.find(c => c.fullName && nameHeading.includes(c.fullName.toLowerCase())) ?? null;

                  const inlineLinkedIn = seg.content.match(LINKEDIN_LINK_RE)?.[1] ?? null;
                  const linkedInUrl =
                    (match?.linkedInUrl && match.linkedInUrl.trim()) || inlineLinkedIn || null;

                  const stripped = seg.content.replace(LINKEDIN_LINK_LINE_RE, '').replace(/\n{3,}/g, '\n\n').trim();

                  return (
                    <div key={i} style={personCardStyle}>
                      <ReactMarkdown components={resolvedComponents}>{stripped}</ReactMarkdown>
                      <PersonActionBar
                        linkedInUrl={linkedInUrl}
                        contactId={match?.contactId ?? null}
                        onSelectContact={onSelectContact}
                      />
                    </div>
                  );
                })}
                {followUpResponses.map((extra, idx) => (
                  <div key={`extra-${idx}`} style={{ marginTop: '28px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        margin: '0 0 14px 0',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--orange)',
                        textTransform: 'uppercase',
                        letterSpacing: '1.5px',
                      }}
                    >
                      Additional Results
                      <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                    </div>
                    {splitAgentResponse(extra).map((seg, i) => {
                      if (seg.type !== 'person') {
                        return (
                          <ReactMarkdown key={i} components={resolvedComponents}>
                            {seg.content}
                          </ReactMarkdown>
                        );
                      }
                      const firstLine = seg.content.split('\n', 1)[0] ?? '';
                      const nameHeading = firstLine.replace(/^### /, '').toLowerCase();
                      const match =
                        sortedMatched.find(
                          (c) => c.fullName && nameHeading.includes(c.fullName.toLowerCase()),
                        ) ?? null;
                      const inlineLinkedIn = seg.content.match(LINKEDIN_LINK_RE)?.[1] ?? null;
                      const linkedInUrl =
                        (match?.linkedInUrl && match.linkedInUrl.trim()) ||
                        inlineLinkedIn ||
                        null;
                      const stripped = seg.content
                        .replace(LINKEDIN_LINK_LINE_RE, '')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();
                      return (
                        <div key={i} style={personCardStyle}>
                          <ReactMarkdown components={resolvedComponents}>{stripped}</ReactMarkdown>
                          <PersonActionBar
                            linkedInUrl={linkedInUrl}
                            contactId={match?.contactId ?? null}
                            onSelectContact={onSelectContact}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}

                {!error && !limitReached && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={handleGetMore}
                      disabled={isFetchingMore || moreExhausted}
                      style={{
                        padding: '10px 20px',
                        fontSize: '13px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {isFetchingMore && (
                        <span
                          className="loading-spinner"
                          style={{ width: '14px', height: '14px', borderWidth: '2px' }}
                        />
                      )}
                      {moreExhausted
                        ? 'No more matches for this query'
                        : isFetchingMore
                          ? 'Finding more...'
                          : 'Give me more results'}
                    </button>
                  </div>
                )}

                {(() => {
                  const trailing = extractTrailingQuestion(response);
                  if (!trailing) return null;
                  return (
                    <div
                      style={{
                        marginTop: '20px',
                        padding: '14px 16px',
                        background: 'var(--orange-dim)',
                        border: '1px solid var(--orange)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ fontSize: '13px', color: 'var(--text)', flex: 1, minWidth: 0 }}>
                        <span style={{ color: 'var(--orange)', fontWeight: 700, letterSpacing: '0.5px', fontSize: '11px', textTransform: 'uppercase', marginRight: '8px' }}>
                          Follow up
                        </span>
                        {trailing}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAsk('Yes, please do that.')}
                        disabled={isLoading}
                        className="btn primary"
                        style={{ padding: '8px 14px', fontSize: '13px', whiteSpace: 'nowrap' }}
                      >
                        Yes, do this
                      </button>
                    </div>
                  );
                })()}
                {metrics && process.env.NEXT_PUBLIC_DEBUG === 'true' && (
                  <div style={{
                    marginTop: '24px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    gap: '16px',
                    fontSize: '12px',
                    color: 'var(--muted)',
                    fontFamily: "'JetBrains Mono', monospace"
                  }}>
                    <span>⏱ {(metrics.durationMs / 1000).toFixed(1)}s</span>
                    <span>🪙 {metrics.tokensUsed.toLocaleString()} tokens</span>
                    <span>📑 {metrics.contactsReferenced} contacts {metrics.ragUsed && '(RAG)'}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
