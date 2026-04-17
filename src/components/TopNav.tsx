'use client';

/**
 * DAYMAKER CONNECT — TopNav Component
 *
 * Sticky top navigation matching the prototype aesthetic exactly.
 * Includes: logo, nav tabs, RM Connect button, user avatar.
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

export default function TopNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
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

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

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

        {/* Nav Tabs */}
        <div className="nav-tabs">
          {NAV_TABS.map((tab) => {
            const isActive =
              tab.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`nav-tab ${isActive ? 'active' : ''}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* RM Connect Button */}
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

        {/* User Area */}
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
            {user?.displayName || user?.email || 'User'}
            <div className="nav-user-avatar">
              {getInitials(user?.displayName ?? user?.email ?? null)}
            </div>
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
      </div>
    </div>
  );
}
