import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '@/lib/types';
import Link from 'next/link';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import HideButton from '@/components/dashboard/HideButton';
import { isOverdue, daysSinceAnalysis } from '@/lib/contacts/followUp';
import { getAuth } from '@/lib/firebase/config';

const PAGE_SIZE = 50;

// Shared card renderer used by both the "Needs follow-up" section and the
// main grid below it. Overdue cards get a subtle amber left-border and an
// inline "Mark as followed up" button; non-overdue cards render exactly as
// before so the list looks unchanged for contacts the user is staying on
// top of.
function renderContactCard(
  contact: Contact,
  opts: {
    overdue: boolean;
    onSelectContact?: (c: Contact) => void;
    onHideContact?: (contactId: string) => void;
    onMarkFollowedUp: (contactId: string) => void;
  },
) {
  const { overdue, onSelectContact, onHideContact, onMarkFollowedUp } = opts;
  const overdueDays = overdue ? daysSinceAnalysis(contact) : null;
  return (
    <div
      key={contact.contactId}
      className="c-card card"
      onClick={() => onSelectContact && onSelectContact(contact)}
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        cursor: 'pointer',
        borderLeft: overdue ? '2px solid var(--orange)' : undefined,
      }}
    >
      <div className="c-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="c-name" style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
            {contact.fullName}
          </div>
          <div className="c-title" style={{ fontSize: '12px', color: 'var(--text2)' }}>
            {contact.position || 'No Title'}
          </div>
        </div>
        {onHideContact && (
          <HideButton contactName={contact.fullName} onHide={() => onHideContact(contact.contactId)} />
        )}
      </div>

      <div className="c-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="c-company" style={{ fontSize: '12px', color: 'var(--orange)', fontWeight: 500 }}>
          {contact.company || 'Unknown Company'}
        </div>
        {contact.email && (
          <div className="c-email" style={{ fontSize: '11px', color: 'var(--blue)' }}>
            {contact.email}
          </div>
        )}
      </div>

      {overdue && overdueDays !== null && (
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
          Analyzed {overdueDays} days ago, no follow-up logged
        </div>
      )}

      <div className="c-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 'auto', paddingTop: '8px' }}>
        {contact.categories?.map((tag, i) => (
          <span key={`${tag}-${i}`} className="c-tag" style={{
            fontSize: '10px',
            padding: '4px 8px',
            background: 'var(--orange-dim)',
            color: 'var(--orange)',
            borderRadius: '12px',
            fontWeight: 500
          }}>
            {tag}
          </span>
        ))}
      </div>

      <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', gap: '8px' }}>
        <Link
          href={`/deepdive/new?contactId=${contact.contactId}`}
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: 'var(--orange)', fontWeight: 600, textDecoration: 'none', letterSpacing: '0.5px', textTransform: 'uppercase' }}
        >
          Deep Dive<span className="hide-mobile"> Analysis</span> ⚡
        </Link>
        {overdue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkFollowedUp(contact.contactId);
            }}
            style={{
              flex: 1, textAlign: 'center', fontSize: '11px', color: 'var(--text2)',
              fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
            }}
          >
            Mark followed up
          </button>
        )}
      </div>
    </div>
  );
}

interface SearchTabProps {
  contacts: Contact[];
  /** True when `contacts` is a partial list (the 50 most-recent, not the full network). */
  isPartial?: boolean;
  /** True when the parent is currently fetching the full contact set. */
  isLoadingFull?: boolean;
  /** Asks the parent to upgrade to a full contact load. Idempotent — fire freely. */
  onRequestFullLoad?: () => void;
  onSelectContact?: (c: Contact) => void;
  onHideContact?: (contactId: string) => void;
}

export default function SearchTab({
  contacts,
  isPartial = false,
  isLoadingFull = false,
  onRequestFullLoad,
  onSelectContact,
  onHideContact,
}: SearchTabProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Client-side optimistic "just marked followed up" set. Prevents the card
  // from jumping back into the overdue section until the parent refreshes
  // contacts from Firestore on its next poll. Keyed by contactId.
  const [justFollowedUp, setJustFollowedUp] = useState<Set<string>>(() => new Set());

  const handleMarkFollowedUp = async (contactId: string) => {
    setJustFollowedUp((prev) => {
      const next = new Set(prev);
      next.add(contactId);
      return next;
    });
    try {
      const token = await getAuth()?.currentUser?.getIdToken();
      if (!token) return;
      await fetch(`/api/contacts/${contactId}/follow-up`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ via: 'manual' }),
      });
    } catch (err) {
      console.warn('Follow-up mark failed', err);
    }
  };

  // Searching a 50-contact slice would silently miss matches in the other
  // 8,900+ records. Kick off the full load the moment the user starts typing.
  useEffect(() => {
    if (query && isPartial && onRequestFullLoad) onRequestFullLoad();
  }, [query, isPartial, onRequestFullLoad]);

  const filteredContacts = useMemo(() => {
    if (!debouncedQuery) {
      // Default view: most recently connected first. Alphabetical sort surfaced
      // names starting with underscores, dashes, or periods at the top.
      const connectedMs = (c: Contact): number => {
        const co = c.connectedOn as any;
        if (!co) return 0;
        if (typeof co.toDate === 'function') return co.toDate().getTime();
        if (typeof co.seconds === 'number') return co.seconds * 1000;
        const d = new Date(co);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };
      return [...contacts].sort((a, b) => connectedMs(b) - connectedMs(a));
    }
    const lowerQuery = debouncedQuery.toLowerCase();

    return contacts.filter(c =>
      c.searchText?.includes(lowerQuery) || // Handles name, company, position, categories from backend
      c.fullName.toLowerCase().includes(lowerQuery) ||
      c.company.toLowerCase().includes(lowerQuery) ||
      c.position.toLowerCase().includes(lowerQuery)
    );
  }, [contacts, debouncedQuery]);

  // Reset pagination whenever the active filter changes so the user isn't stuck
  // deep in a paginated list that no longer reflects their query.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQuery]);

  const visibleContacts = useMemo(
    () => filteredContacts.slice(0, visibleCount),
    [filteredContacts, visibleCount]
  );

  // Split visibleContacts into "needs follow-up" and everyone else. The
  // optimistic justFollowedUp set bypasses the overdue check client-side so
  // clicking "Mark as followed up" immediately moves the card down instead
  // of waiting for the next parent re-fetch.
  const { overdueContacts, regularContacts } = useMemo(() => {
    const now = Date.now();
    const overdue: Contact[] = [];
    const regular: Contact[] = [];
    for (const c of visibleContacts) {
      if (!justFollowedUp.has(c.contactId) && isOverdue(c, now)) {
        overdue.push(c);
      } else {
        regular.push(c);
      }
    }
    // Oldest-overdue first so the most ignored contacts surface on top.
    overdue.sort((a, b) => (daysSinceAnalysis(b, now) ?? 0) - (daysSinceAnalysis(a, now) ?? 0));
    return { overdueContacts: overdue, regularContacts: regular };
  }, [visibleContacts, justFollowedUp]);

  return (
    <div id="dsub-search">
      {/* Search Input */}
      <div className="search-box card" style={{ position: 'relative', marginBottom: '24px', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <svg style={{ position: 'absolute', left: '16px' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, company, role, or category..."
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: '16px 16px 16px 36px',
            color: 'var(--text)',
            fontSize: '15px',
            outline: 'none'
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '8px' }}
          >
            ✕
          </button>
        )}
      </div>

      <div className="results-meta" style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div>
          {debouncedQuery ? (
            <>
              Showing {visibleContacts.length.toLocaleString()} {visibleContacts.length === 1 ? 'result' : 'results'} for &ldquo;{debouncedQuery}&rdquo;
            </>
          ) : (
            <>Showing {visibleContacts.length.toLocaleString()} most recent connections</>
          )}
        </div>
        {isPartial && !debouncedQuery && (
          <button
            type="button"
            onClick={() => onRequestFullLoad?.()}
            disabled={isLoadingFull}
            style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600, alignSelf: 'flex-start' }}
          >
            {isLoadingFull ? 'Loading full network...' : 'Load full network →'}
          </button>
        )}
      </div>

      {/* Overdue section — shown only when there are overdue contacts and
          the user isn't actively searching for something specific. */}
      {!debouncedQuery && overdueContacts.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--orange)',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
            }}
          >
            Needs follow-up
            <span style={{ color: 'var(--muted)', fontWeight: 600, letterSpacing: 0 }}>
              {overdueContacts.length}
            </span>
            <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
          <div
            className="d-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {overdueContacts.map((contact) =>
              renderContactCard(contact, {
                overdue: true,
                onSelectContact,
                onHideContact,
                onMarkFollowedUp: handleMarkFollowedUp,
              }),
            )}
          </div>
          <div style={{ height: '1px', background: 'var(--border)', margin: '0 0 16px 0' }} />
        </>
      )}

      {/* Grid */}
      <div className="d-grid" id="contacts-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '16px'
      }}>
        {(debouncedQuery ? visibleContacts : regularContacts).map((contact) =>
          renderContactCard(contact, {
            overdue: false,
            onSelectContact,
            onHideContact,
            onMarkFollowedUp: handleMarkFollowedUp,
          }),
        )}

        {filteredContacts.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', gridColumn: '1 / -1', color: 'var(--muted)' }}>
            No contacts found matching &quot;{debouncedQuery}&quot;
          </div>
        )}
      </div>

      {visibleCount < filteredContacts.length && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
          <button
            className="btn"
            onClick={() => {
              setVisibleCount(c => c + PAGE_SIZE);
              if (isPartial && onRequestFullLoad) onRequestFullLoad();
            }}
            style={{ padding: '10px 20px', fontSize: '14px' }}
          >
            Load More ({filteredContacts.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
