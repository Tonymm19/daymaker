import { useState, useMemo } from 'react';
import type { Contact } from '@/lib/types';
import Link from 'next/link';

// Brand canonical categories from config
const CATEGORIES = [
  'Executive', 'Startup Founder', 'Engineering', 'Sales/BD',
  'Consulting', 'Marketing', 'AI/ML', 'Education', 'VC/Investment',
  'Healthcare', 'Manufacturing', 'Robotics', 'Other'
] as const;

type Category = typeof CATEGORIES[number];

export default function CategoriesTab({ contacts, onSelectContact }: { contacts: Contact[], onSelectContact?: (c: Contact) => void }) {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Group contacts by category
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    
    // Initialize all canonical to 0
    CATEGORIES.forEach(c => counts.set(c, 0));
    
    contacts.forEach(contact => {
      contact.categories?.forEach(cat => {
        if (counts.has(cat)) {
          counts.set(cat, counts.get(cat)! + 1);
        }
      });
    });

    return counts;
  }, [contacts]);

  // Get contacts for selected category
  const selectedContacts = useMemo(() => {
    if (!selectedCategory) return [];
    return contacts.filter(c => c.categories?.includes(selectedCategory));
  }, [contacts, selectedCategory]);

  return (
    <div id="dsub-categories">
      {!selectedCategory ? (
        // Grid View
        <div className="d-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {CATEGORIES.map(cat => {
            const count = categoryCounts.get(cat) || 0;
            return (
              <div 
                key={cat} 
                className="card"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  transition: 'all 0.2s ease',
                  backgroundColor: count > 0 ? 'var(--surface)' : 'var(--darker)',
                  opacity: count === 0 ? 0.6 : 1
                }}
              >
                {/* Generic Icon - you can add specifics later */}
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: count > 0 ? 'var(--orange-dim)' : 'var(--darker)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--orange)'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <div>
                  <div className="cat-name" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                    {cat}
                  </div>
                  <div className="cat-count" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                    {count} {count === 1 ? 'Contact' : 'Contacts'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // List View showing matching contacts
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <button 
              className="btn"
              onClick={() => setSelectedCategory(null)}
              style={{
                background: 'var(--dark)',
                color: 'var(--text)',
                padding: '8px 16px',
                border: '1px solid var(--border)'
              }}
            >
              ← Back to Categories
            </button>
            <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--orange)' }}>{selectedCategory}</span>
              <span style={{ color: 'var(--muted)', fontSize: '14px', fontWeight: 400 }}>
                ({selectedContacts.length})
              </span>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {selectedContacts.map(contact => (
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
                </div>
                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <Link href={`/deepdive/new?contactId=${contact.contactId}`} style={{ display: 'block', textAlign: 'center', fontSize: '12px', color: 'var(--orange)', fontWeight: 600, textDecoration: 'none', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    Deep Dive Analysis ⚡
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
