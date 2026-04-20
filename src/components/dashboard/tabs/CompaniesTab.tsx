import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '@/lib/types';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import HideButton from '@/components/dashboard/HideButton';

const PAGE_SIZE = 50;

// Non-company entries users type into the LinkedIn "company" field. Always
// pinned to the top of the list under an "Other" heading so real companies
// aren't buried by them when sorting by contact count.
const THEMATIC_NAMES = new Set(
  [
    'Self-Employed',
    'Self Employed',
    'Self-employed',
    'Freelance',
    'Freelancer',
    'Unemployed',
    'Unknown Company',
    'Stealth',
    'Stealth Startup',
    'Stealth Mode',
    'Independent',
    'Independent Contractor',
    'Independent Consultant',
    'Consultant',
    'Retired',
    'Looking for Work',
    'Open to Work',
    'Student',
    'N/A',
    'None',
  ].map((s) => s.toLowerCase()),
);

function isThematic(name: string): boolean {
  return THEMATIC_NAMES.has(name.trim().toLowerCase());
}

type SortKey = 'name' | 'count';

export default function CompaniesTab({ contacts, onSelectContact, onHideContact }: { contacts: Contact[], onSelectContact?: (c: Contact) => void, onHideContact?: (contactId: string) => void }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortKey, setSortKey] = useState<SortKey>('name');

  // Group contacts strictly by their CURRENT company field. previousCompany is
  // stored for history but never used here — a contact whose company changed
  // between imports only shows under the new company.
  const { thematic, regular, totalCompanies } = useMemo(() => {
    const grouped = new Map<string, Contact[]>();

    contacts.forEach((contact) => {
      const comp = contact.company?.trim() || 'Unknown Company';
      if (!grouped.has(comp)) grouped.set(comp, []);
      grouped.get(comp)!.push(contact);
    });

    let rows = Array.from(grouped.entries()).map(([name, employees]) => ({
      name,
      employees,
      count: employees.length,
    }));

    if (debouncedQuery) {
      const lowerQ = debouncedQuery.toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(lowerQ));
    }

    const thematicRows = rows.filter((r) => isThematic(r.name));
    const regularRows = rows.filter((r) => !isThematic(r.name));

    // Thematic section is always alphabetical — sort order doesn't really
    // apply to these catch-all buckets.
    thematicRows.sort((a, b) => a.name.localeCompare(b.name));

    regularRows.sort((a, b) => {
      if (sortKey === 'count') {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    return {
      thematic: thematicRows,
      regular: regularRows,
      totalCompanies: thematicRows.length + regularRows.length,
    };
  }, [contacts, debouncedQuery, sortKey]);

  // Reset pagination when the active filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpandedCompany(null);
  }, [debouncedQuery, sortKey]);

  // Thematic rows always render in full; pagination applies to regular rows
  // only so "Other" is never split across a Load More boundary.
  const visibleRegular = useMemo(
    () => regular.slice(0, Math.max(0, visibleCount - thematic.length)),
    [regular, visibleCount, thematic.length],
  );
  const visibleShown = thematic.length + visibleRegular.length;

  const renderCompanyRow = (comp: { name: string; employees: Contact[]; count: number }) => {
    const isExpanded = expandedCompany === comp.name;
    return (
      <div
        key={comp.name}
        className="comp-item card"
        style={{
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          border: isExpanded ? '1px solid var(--orange-dim)' : '1px solid transparent',
        }}
      >
        <div
          className="comp-hdr"
          onClick={() => setExpandedCompany(isExpanded ? null : comp.name)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            cursor: 'pointer',
            background: isExpanded ? 'var(--darker)' : 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
                color: 'var(--muted)',
              }}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <div className="comp-name" style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)' }}>
              {comp.name}
            </div>
          </div>
          <div className="comp-count" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{comp.count}</span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {comp.count === 1 ? 'Employee' : 'Employees'}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="comp-body" style={{ padding: '16px 24px 24px 24px', background: 'var(--dark)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
              {comp.employees.map((contact) => (
                <div
                  key={contact.contactId}
                  className="c-card"
                  onClick={() => onSelectContact && onSelectContact(contact)}
                  style={{
                    padding: '12px',
                    background: 'var(--surface)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  {onHideContact && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                      <HideButton
                        contactName={contact.fullName}
                        onHide={() => onHideContact(contact.contactId)}
                        size={24}
                      />
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', marginBottom: '4px', paddingRight: '28px' }}>
                    {contact.fullName}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' }}>
                    {contact.position || 'No Title'}
                  </div>
                  {contact.email && (
                    <div style={{ fontSize: '11px', color: 'var(--blue)' }}>{contact.email}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const sortBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--orange-dim)' : 'transparent',
    color: active ? 'var(--orange)' : 'var(--text2)',
    border: '1px solid var(--border)',
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  return (
    <div id="dsub-companies">
      {/* Search Input */}
      <div className="search-box card" style={{ position: 'relative', marginBottom: '16px', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <svg style={{ position: 'absolute', left: '16px' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search companies..."
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: '16px 16px 16px 36px',
            color: 'var(--text)',
            fontSize: '15px',
            outline: 'none',
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

      {/* Sort toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
          Sort by
        </span>
        <button type="button" onClick={() => setSortKey('name')} style={sortBtnStyle(sortKey === 'name')}>
          Name
        </button>
        <button type="button" onClick={() => setSortKey('count')} style={sortBtnStyle(sortKey === 'count')}>
          Contact Count
        </button>
      </div>

      <div className="results-meta" style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--muted)' }}>
        Showing {visibleShown} of {totalCompanies} {totalCompanies === 1 ? 'company' : 'companies'}
      </div>

      <div className="comp-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {thematic.length > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 0',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '2px',
              }}
            >
              Other
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            {thematic.map(renderCompanyRow)}
            <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
          </>
        )}

        {visibleRegular.map(renderCompanyRow)}

        {totalCompanies === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
            No companies found matching &quot;{debouncedQuery}&quot;
          </div>
        )}
      </div>

      {visibleRegular.length < regular.length && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
          <button
            className="btn"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            style={{ padding: '10px 20px', fontSize: '14px' }}
          >
            Load More ({regular.length - visibleRegular.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
