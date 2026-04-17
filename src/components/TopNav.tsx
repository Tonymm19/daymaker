'use client';

/**
 * DAYMAKER CONNECT — TopNav Component
 *
 * Sticky top navigation matching the prototype aesthetic exactly.
 * Desktop: logo, nav tabs, RM Connect button, user avatar with dropdown.
 * Mobile (<768px): logo, hamburger menu, avatar. All nav + RM + Settings + Sign Out live in the slide-in panel.
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import { signOut } from '@/lib/firebase/auth';

const NAV_TABS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Monthly Briefing', href: '/briefing' },
  { label: 'Event Pre-Brief', href: '/events' },
  { label: 'Deep Dive', href: '/deepdive' },
];

function getInitials(name: string | null): string {
  if (!name) return '??';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function isTabActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
}

export default function TopNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lock background scroll while the mobile menu is open so touch gestures don't
  // scroll the dashboard behind the panel.
  useEffect(() => {
    if (mobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileMenuOpen]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const displayName = user?.displayName || user?.email || 'User';
  const initials = getInitials(user?.displayName ?? user?.email ?? null);

  return (
    <div className="topnav">
      <div className="topnav-inner">
        {/* Logo */}
        <Link href="/dashboard" className="logo-area">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0E1B24" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <div className="logo-text">
            Daymaker <span>Connect</span>
          </div>
        </Link>

        {/* Nav Tabs (desktop only) */}
        <div className="nav-tabs">
          {NAV_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`nav-tab ${isTabActive(pathname, tab.href) ? 'active' : ''}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* RM Connect Button (desktop only) */}
        <a
          href="https://reflectionsmatch.com/profile"
          target="_blank"
          rel="noopener noreferrer"
          className="rm-btn"
        >
          <span style={{ textAlign: 'center', lineHeight: '1.3' }}>
            Connect To
            <br />
            <strong style={{ color: '#C4BCF0', fontSize: '12px' }}>
              Reflections Match
            </strong>
          </span>
          <span className="rm-status" />
        </a>

        {/* User Area (desktop only) */}
        <div className="nav-user" ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="nav-user-name"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {displayName}
            <div className="nav-user-avatar">{initials}</div>
          </button>

          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              minWidth: '150px',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <Link
                href="/settings"
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  color: 'var(--text)',
                  textDecoration: 'none',
                  fontSize: '14px',
                  borderRadius: '4px',
                  transition: 'background 0.2s'
                }}
                className="dropdown-item"
              >
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  color: 'var(--red)',
                  background: 'none',
                  border: 'none',
                  fontSize: '14px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  transition: 'background 0.2s'
                }}
                className="dropdown-item"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>

        {/* Mobile-only cluster: avatar + hamburger */}
        <div className="mobile-nav-cluster">
          <div className="nav-user-avatar" aria-hidden="true">{initials}</div>
          <button
            type="button"
            className="hamburger-btn"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile slide-in menu */}
      {mobileMenuOpen && (
        <>
          <div
            className="mobile-menu-overlay"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="mobile-menu-panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <div className="mobile-menu-header">
              <div className="mobile-menu-user">
                <div className="nav-user-avatar">{initials}</div>
                <div className="mobile-menu-user-text">
                  <div className="mobile-menu-user-name">{user?.displayName || 'User'}</div>
                  {user?.email && <div className="mobile-menu-user-email">{user.email}</div>}
                </div>
              </div>
              <button
                type="button"
                className="mobile-menu-close"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="mobile-menu-links">
              {NAV_TABS.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`mobile-menu-link ${isTabActive(pathname, tab.href) ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>

            <div className="mobile-menu-divider" />

            <nav className="mobile-menu-links">
              <Link
                href="/settings"
                className={`mobile-menu-link ${pathname.startsWith('/settings') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Settings
              </Link>
              <a
                href="https://reflectionsmatch.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="mobile-menu-link mobile-menu-link-rm"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="rm-status" aria-hidden="true" />
                Connect to Reflections Match
              </a>
              <button
                type="button"
                className="mobile-menu-link mobile-menu-signout"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
