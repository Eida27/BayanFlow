import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const sections = [
  ['dashboard', '/', 'Dashboard', 'See today’s activity and prioritize applications for review.'],
  ['applications', '/staff/applications', 'Applications', 'Review documents and record decisions on municipal requests.'],
  ['reports', '/staff/reports', 'Reports', 'Review application activity and export reports by date range.'],
  ['notifications', '/staff/notifications', 'Notifications', 'Follow new submissions, resubmissions, and confirmed payments.'],
  ['settings', '/staff/settings', 'Settings', 'Manage the alerts you receive in the Staff Portal.'],
]

const iconPaths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  applications: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7',
  reports: 'M4 4v16h16 M9 15v-4 M14 15V7 M19 15v-7',
  notifications: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  settings: 'M4 7h5m4 0h7 M4 17h9m4 0h3 M9 4v6 M13 14v6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  signout: 'M10 4H4v16h6 M8 12h12 M16 8l4 4-4 4',
  search: 'M16 16l4 4 M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
}

export function StaffIcon({ name }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"
    fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <path d={iconPaths[name]} />
  </svg>
}

export default function StaffShell({ section, unreadCount, busy, signOut, children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef(null)
  const heading = useRef(null)
  const previousSection = useRef(section)
  const [, , title, description] = sections.find(([id]) => id === section)

  useEffect(() => {
    if (previousSection.current === section) return
    previousSection.current = section
    setMenuOpen(false)
    heading.current?.focus({ preventScroll: true })
  }, [section])

  return <div className="staff-workspace">
    <a className="staff-skip" href="#staff-main">Skip to main content</a>
    <header className="staff-rail" onKeyDown={event => {
      if (event.key !== 'Escape' || !menuOpen || !menuButton.current?.getClientRects().length) return
      setMenuOpen(false)
      menuButton.current.focus()
    }}>
      <Link className="staff-brand" href="/" onNavigate={() => setMenuOpen(false)}>
        <span className="staff-brand-mark" aria-hidden="true">B</span>
        <span>BayanFlow<small>Staff Portal</small></span>
      </Link>
      <button type="button" className="staff-menu button" ref={menuButton} aria-expanded={menuOpen}
        aria-controls="staff-navigation" onClick={() => setMenuOpen(!menuOpen)}>
        <StaffIcon name="menu" /> Menu
        {!menuOpen && unreadCount > 0 && <span className="staff-unread-count">
          {unreadCount}<span className="staff-visually-hidden"> unread notifications</span>
        </span>}
      </button>
      <div id="staff-navigation" className="staff-rail-content" data-open={menuOpen}>
        <nav className="staff-nav" aria-label="Staff portal">
          {sections.map(([id, href, label]) => <Link key={id} href={href} onNavigate={() => {
            setMenuOpen(false)
            if (section === id) heading.current?.focus({ preventScroll: true })
          }}
            aria-current={id === section ? 'page' : undefined}>
            <StaffIcon name={id} /> {label}
            {id === 'notifications' && unreadCount > 0 && <span className="staff-unread-count">
              {unreadCount}<span className="staff-visually-hidden"> unread</span>
            </span>}
          </Link>)}
        </nav>
        <div className="staff-rail-footer">
          <span>Hackathon demo</span>
          <button className="button staff-signout" disabled={busy || !signOut} onClick={signOut}>
            <StaffIcon name="signout" /> Sign out
          </button>
        </div>
      </div>
    </header>
    <main className="staff-main" id="staff-main" tabIndex={-1}>
      <header className="staff-page-heading">
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  </div>
}
