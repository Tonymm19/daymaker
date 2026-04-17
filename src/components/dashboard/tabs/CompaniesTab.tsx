import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '@/lib/types';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

const PAGE_SIZE = 50;

export default function CompaniesTab({ contacts, onSelectContact }: { contacts: Contact[], onSelectContact?: (c: Contact) => void }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Group and sort companies
  const companiesData = useMemo(() => {
    const grouped = new Map<string, Contact[]>();

    contacts.forEach(contact => {
      const comp = contact.company?.trim() || 'Unknown Company';
      if (!grouped.has(comp)) {
        grouped.set(comp, []);
      }
      grouped.get(comp)!.push(contact);
    });

    // Convert to array and filter by query
    let result = Array.from(grouped.entries()).map(([name, employees]) => ({
      name,
      employees,
      count: employees.length
    }));

    if (debouncedQuery) {
      const lowerQ = debouncedQuery.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(lowerQ));
    }

    // Sort by count descending, then alphabetical
    return result.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
  }, [contacts, debouncedQuery]);

  // Reset pagination when the active filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpandedCompany(null);
  }, [debouncedQuery]);

  const visibleCompanies = useMemo(
    () => companiesData.slice(0, visibleCount),
    [companiesData, visibleCount]
  );

  return (
    <div id="dsub-companies">
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
          placeholder="Search companies..."
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
        Showing {visibleCompanies.length} of {companiesData.length} {companiesData.length === 1 ? 'company' : 'companies'}
      </div>

      <div className="comp-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visibleCompanies.map(comp => {
          const isExpanded = expandedCompany === comp.name;

          return (
            <div key={comp.name} className="comp-item card" style={{
              overflow: 'hidden',
              transition: 'all 0.2s ease',
              border: isExpanded ? '1px solid var(--orange-dim)' : '1px solid transparent'
            }}>
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
                      color: 'var(--muted)'
                    }}
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                  <div className="comp-name" style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)' }}>
                    {comp.name}
                  </div>
                </div>
                <div className="comp-count" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
                    {comp.count}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    {comp.count === 1 ? 'Employee' : 'Employees'}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className="comp-body" style={{ padding: '16px 24px 24px 24px', background: 'var(--dark)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                    {comp.employees.map(contact => (
                      <div key={contact.contactId} className="c-card" onClick={() => onSelectContact && onSelectContact(contact)} style={{
                        padding: '12px',
                        background: 'var(--surface)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        cursor: 'pointer'
                      }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                          {contact.fullName}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' }}>
                          {contact.position || 'No Title'}
                        </div>
                        {contact.email && (
                          <div style={{ fontSize: '11px', color: 'var(--blue)' }}>
                            {contact.email}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {companiesData.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
            No companies found matching &quot;{debouncedQuery}&quot;
          </div>
        )}
      </div>

      {visibleCount < companiesData.length && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
          <button
            className="btn"
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            style={{ padding: '10px 20px', fontSize: '14px' }}
          >
            Load More ({companiesData.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
