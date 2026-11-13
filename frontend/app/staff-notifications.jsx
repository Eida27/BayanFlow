import { useEffect, useRef, useState } from 'react'
import { services } from '../../services.js'
import { api } from './shared'
import { applicationAnchor } from './staff-dashboard'

const categories = {
  submission: { label: 'New submissions', event: 'New submission' },
  resubmission: { label: 'Resident resubmissions', event: 'Resident resubmission' },
  payment: { label: 'Confirmed payments', event: 'BSC Testnet payment confirmed' },
}
const dateTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
})

export function useNotificationRefresh(refresh) {
  useEffect(() => {
    if (!refresh) return
    const whenVisible = () => { if (document.visibilityState === 'visible') refresh() }
    whenVisible()
    window.addEventListener('focus', whenVisible)
    document.addEventListener('visibilitychange', whenVisible)
    const timer = window.setInterval(whenVisible, 60_000)
    return () => {
      window.removeEventListener('focus', whenVisible)
      document.removeEventListener('visibilitychange', whenVisible)
      window.clearInterval(timer)
    }
  }, [refresh])
}

const feedPath = '/staff/notifications'

export function StaffNotifications({ setUnreadCount }) {
  const [feed, setFeed] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestVersion = useRef(0)
  const pageCount = useRef(1)
  const writing = useRef(false)

  async function refresh() {
    if (writing.current) return
    const version = ++requestVersion.current
    try {
      let page = await api(feedPath)
      const items = [...page.items]
      for (let index = 1; index < pageCount.current && page.nextCursor; index++) {
        page = await api(feedPath + '?before=' + page.nextCursor)
        items.push(...page.items)
      }
      if (version !== requestVersion.current) return
      setFeed({ ...page, items })
      setUnreadCount(page.unreadCount)
      setError('')
    } catch (error) {
      if (version === requestVersion.current) setError(error.message)
    }
  }

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useNotificationRefresh(useRef(() => refreshRef.current()).current)

  async function update(action) {
    if (writing.current) return
    writing.current = true
    requestVersion.current++
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (error) {
      setError(error.message)
    } finally {
      writing.current = false
      setBusy(false)
    }
  }

  async function markRead(path, body, matches, href) {
    await update(async () => {
      const { unreadCount } = await api(feedPath + path, body)
      setUnreadCount(unreadCount)
      setFeed(current => ({
        ...current, unreadCount,
        items: current.items.map(item => matches(item) ? { ...item, read: true } : item),
      }))
      if (href) window.location.assign(href)
    })
  }

  const through = feed?.items[0]?.id
  return <section className="panel stack" aria-label="Notification feed">
    <div className="section-title">
      <h2>Recent alerts</h2>
      <button className="button secondary" disabled={busy || !through || !feed.unreadCount}
        onClick={() => markRead('/read-all', { through }, item => BigInt(item.id) <= BigInt(through))}>Mark all as read</button>
    </div>
    {error && <div className="report-error"><p role="alert">{error}</p>
      <button className="button secondary" disabled={busy} onClick={refresh}>Retry</button>
    </div>}
    {!feed && !error && <p role="status">Loading notifications…</p>}
    {feed && !feed.items.length && <p className="empty">No notifications to show.</p>}
    {feed?.items.length > 0 && <ul className="notification-list">
      {feed.items.map(item => {
        const href = '/staff/applications#' + applicationAnchor(item.application_id)
        return <li key={item.id} className={item.read ? undefined : 'notification-unread'}>
          <div className="notification-content">
            <div className="notification-meta">
              <strong>{categories[item.kind].event}</strong>
              {!item.read && <span className="status">Unread</span>}
            </div>
            <a href={href} onClick={event => {
              if (item.read || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              markRead('/' + item.id + '/read', {}, candidate => candidate.id === item.id, href)
            }}>{item.title}</a>
            <p>{services[item.service]?.label} · <time dateTime={item.created_at}>{dateTime.format(new Date(item.created_at))} PHT</time></p>
            {item.manual_review && <p className="notification-review">Manual review needed at submission</p>}
          </div>
          {!item.read && <button className="button secondary" disabled={busy}
            aria-label={`Mark as read: ${item.title}`}
            onClick={() => markRead('/' + item.id + '/read', {}, candidate => candidate.id === item.id)}>Mark as read</button>}
        </li>
      })}
    </ul>}
    {feed?.nextCursor && <div>
      <button className="button secondary" disabled={busy} onClick={() => update(async () => {
        const next = await api(feedPath + '?before=' + feed.nextCursor)
        pageCount.current++
        setFeed({ ...next, items: [...feed.items, ...next.items] })
        setUnreadCount(next.unreadCount)
      })}>Load more</button>
    </div>}
  </section>
}

export function StaffSettings({ setUnreadCount }) {
  const [preferences, setPreferences] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    setError('')
    try {
      setPreferences((await api('/staff/preferences')).preferences)
    } catch (error) {
      setError(error.message)
    }
  }

  useEffect(() => { load() }, [])

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setSaved(false)
    setError('')
    try {
      const result = await api('/staff/preferences', { preferences })
      setPreferences(result.preferences)
      setUnreadCount(result.unreadCount)
      setSaved(true)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel stack" aria-labelledby="notification-settings">
    <h2 id="notification-settings">Notification preferences</h2>
    <p>Choose which alerts appear in your Staff Portal.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!preferences && (error ? <div><button className="button secondary" onClick={load}>Retry</button></div>
      : <p role="status">Loading preferences…</p>)}
    {preferences && <form className="stack" onSubmit={save}>
      <fieldset className="notification-options" disabled={busy}>
        <legend>Alert categories</legend>
        {Object.entries(categories).map(([kind, { label }]) => <label key={kind}>
          <input type="checkbox" checked={preferences[kind]} onChange={event => {
            setSaved(false)
            setPreferences({ ...preferences, [kind]: event.target.checked })
          }} />{label}
        </label>)}
      </fieldset>
      <div><button className="button primary" disabled={busy}>Save preferences</button></div>
    </form>}
    {saved && <p className="notice" role="status">Preferences saved.</p>}
  </section>
}
