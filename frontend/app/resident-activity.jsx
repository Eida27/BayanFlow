'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { reportTimezone } from '../../report-dates.js'
import { services } from '../../services.js'
import { api } from './shared'
import { useVisibleRefresh } from './use-visible-refresh'

const labels = {
  submitted: 'Application submitted',
  resubmitted: 'Corrections resubmitted',
  ai_review: 'Advisory document review',
  needs_correction: 'Corrections requested',
  approved: 'Approved for payment',
  rejected: 'Application rejected',
  payment_confirmed: 'Testnet payment confirmed',
  document_issued: 'Demo document available',
}
const date = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: reportTimezone,
})

function ActivityTime({ value }) {
  return <time dateTime={value}>{date.format(new Date(value))} Manila time</time>
}

export function ApplicationTimeline({ application, refreshVersion }) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    api('/applications/' + application.id + '/timeline')
      .then(({ events }) => { if (active) setEvents(events) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [application.id, refreshVersion, attempt])

  const documents = services[application.service].documents
  return <section className="resident-timeline stack">
    <h4>Application timeline</h4>
    {error && <div><p className="error" role="alert">{error}</p>
      <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Retry timeline</button>
    </div>}
    {!error && events === null && <p role="status">Loading timeline…</p>}
    {events?.length === 0 && <p>No activity has been recorded since the timeline was introduced.</p>}
    {!!events?.length && <ol>
      {events.map(({ id, kind, revision, created_at, details }) => <li key={id}>
        <strong>{labels[kind]}</strong>
        <small>Revision {revision} · <ActivityTime value={created_at} /></small>
        {details.note && <p>{details.note}</p>}
        {kind === 'ai_review' && <>
          {details.error && <p>{details.error}</p>}
          {details.findings?.length > 0 && <details>
            <summary>View advisory findings</summary>
            {details.findings.map(finding => <div className="finding" key={finding.requirement}>
              <strong>{documents.find(([name]) => name === finding.requirement)?.[1] ?? finding.requirement}</strong>
              <span className="finding-status">{finding.status.replaceAll('_', ' ')}</span>
              <p>{finding.explanation}</p>
              {finding.excerpt && <blockquote>{finding.excerpt}</blockquote>}
            </div>)}
          </details>}
        </>}
      </li>)}
    </ol>}
  </section>
}

export function ResidentInbox({ openApplication, renderHeader }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(null)
  const [items, setItems] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const button = useRef(null)
  const heading = useRef(null)
  const version = useRef(0)
  const writing = useRef(false)

  const load = useCallback(async (before = null) => {
    if (writing.current) return
    const request = ++version.current
    if (open) setError('')
    try {
      const path = open
        ? '/resident/notifications' + (before ? '?before=' + encodeURIComponent(before) : '')
        : '/resident/notifications/unread'
      const result = await api(path)
      if (request !== version.current) return
      setCount(result.unreadCount)
      if (open) {
        setItems(previous => before ? [...previous, ...result.items] : result.items)
        setCursor(result.nextCursor)
      }
    } catch (error) {
      if (open && request === version.current) setError(error.message)
    }
  }, [open])
  useVisibleRefresh(open ? null : load)
  useEffect(() => {
    if (open) {
      heading.current?.focus()
      load()
    }
    return () => { version.current++ }
  }, [open, load])

  async function select(item, navigate) {
    if (writing.current) return
    writing.current = true
    version.current++
    setBusy(true)
    setError('')
    try {
      if (!item.read) {
        const { unreadCount } = await api('/resident/notifications/' + item.id + '/read', {})
        setCount(unreadCount)
        setItems(previous => previous.map(entry => entry.id === item.id ? { ...entry, read: true } : entry))
      }
      if (navigate) {
        setOpen(false)
        button.current?.focus()
        openApplication(item.application_id)
      }
    } catch (error) {
      setError(error.message)
    } finally {
      writing.current = false
      setBusy(false)
    }
  }

  return <>
    {renderHeader(<button ref={button} className="button secondary" aria-expanded={open} aria-controls="resident-inbox"
      disabled={busy} onClick={() => {
        if (!open) setItems(null)
        setOpen(!open)
      }}>Notifications{count > 0 && <> <span className="resident-unread" aria-label={count + ' unread'}>{count}</span></>}</button>)}
    <div id="resident-inbox" className="resident-inbox" hidden={!open}>
      {open && <div className="stack">
        <div className="section-title"><h3 ref={heading} tabIndex={-1}>Notifications</h3>
          <button className="button secondary" disabled={busy} onClick={() => load()}>Refresh notifications</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {!error && items === null && <p role="status">Loading notifications…</p>}
        {items?.length === 0 && <p>No notifications yet.</p>}
        {!!items?.length && <ul>
          {items.map(item => <li key={item.id}>
            <div><strong>{labels[item.kind]}</strong>{!item.read && <span className="resident-unread">Unread</span>}
              <p>{item.title}</p><small><ActivityTime value={item.created_at} /></small>
            </div>
            <div className="document-links">
              <button className="button secondary" aria-disabled={busy} onClick={() => select(item, true)}>Open application</button>
              {!item.read && <button className="button quiet" disabled={busy} onClick={event => {
                event.currentTarget.previousElementSibling?.focus()
                select(item, false)
              }}>Mark as read</button>}
            </div>
          </li>)}
        </ul>}
        {cursor && <div><button className="button secondary" disabled={busy} onClick={() => load(cursor)}>Load older notifications</button></div>}
      </div>}
    </div>
  </>
}
