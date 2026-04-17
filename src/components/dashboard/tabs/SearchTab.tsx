import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '@/lib/types';
import Link from 'next/link';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

const PAGE_SIZE = 50;

export default function SearchTab({ contacts, onSelectContact }: { contacts: Contact[], onSelectContact?: (c: Contact) => void }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredContacts = useMemo(() => {
    if (!debouncedQuery) return contacts;
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

  return (
    <div id="dsub-search">
      {/* Search Input */}
      <div className="search-box card" style={{ position: 'relative', marginBottom: '24px', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <svg style={{ position: 'absolute', left: '16px' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
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

      <div className="results-meta" style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--muted)' }}>
        Showing {visibleContacts.length} of {filteredContacts.length} {filteredContacts.length === 1 ? 'result' : 'results'}
      </div>

      {/* Grid */}
      <div className="d-grid" id="contacts-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '16px'
      }}>
        {visibleContacts.map(contact => (
          <div key={contact.contactId} className="c-card card" onClick={() => onSelectContact && onSelectContact(contact)} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer' }}>
            <div className="c-hdr">
              <div className="c-name" style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
                {contact.fullName}
              </div>
              <div className="c-title" style={{ fontSize: '12px', color: 'var(--text2)' }}>
                {contact.position || 'No Title'}
              </div>
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

            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <Link href={`/deepdive/new?contactId=${contact.contactId}`} style={{ display: 'block', textAlign: 'center', fontSize: '12px', color: 'var(--orange)', fontWeight: 600, textDecoration: 'none', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Deep Dive Analysis ⚡
              </Link>
            </div>
          </div>
        ))}

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
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            style={{ padding: '10px 20px', fontSize: '14px' }}
          >
            Load More ({filteredContacts.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
