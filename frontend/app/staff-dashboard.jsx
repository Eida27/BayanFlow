import { useCallback, useRef, useState } from 'react'
import { BUSINESS_PERMIT, services } from '../../services.js'
import { dashboardStatuses } from './staff-analytics.js'
import { api } from './shared'
import { useVisibleRefresh } from './use-visible-refresh'

export const applicationAnchor = id => `application-${id}`

export function openLinkedApplication() {
  const card = document.getElementById(window.location.hash.slice(1))
  if (!(card instanceof HTMLDetailsElement)) return

  card.open = true
  card.querySelector('summary').focus({ preventScroll: true })
  card.scrollIntoView({ block: 'start' })
}

function PriorityGroup({ title, group: { count, items }, emptyMessage }) {
  return <section className="priority-group">
    <h3>{title} <span className="priority-count">{count}</span></h3>
    {items.length ? <ul className="priority-list">
      {items.map(application =>
        <li key={application.id}>
          <a href={`/staff/applications#${applicationAnchor(application.id)}`}>
            <strong>{application.title}</strong>
            <small>{services[application.service ?? BUSINESS_PERMIT].label}</small>
          </a>
        </li>
      )}
    </ul> : <p>{emptyMessage}</p>}
  </section>
}

export default function StaffDashboard() {
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const refresh = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      setSummary(await api('/staff/dashboard'))
    } catch (error) {
      setError(error.message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }, [])
  useVisibleRefresh(refresh)

  return <>
    <section className="panel dashboard-panel" aria-labelledby="activity-title">
      <div className="section-title">
        <h2 id="activity-title">Today’s Activity</h2>
        <button className="button secondary" disabled={busy} onClick={refresh}>Refresh</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!summary && busy && <p role="status">Loading dashboard…</p>}
      {summary && <>
        <p className="dashboard-date"><time dateTime={summary.date}>{summary.date}</time> · Manila time</p>
        <dl className="status-totals">
          <div className="status-total"><dt>New applications</dt><dd>{summary.activity.submitted}</dd></div>
          <div className="status-total"><dt>Resubmissions</dt><dd>{summary.activity.resubmitted}</dd></div>
        </dl>
      </>}
    </section>
    {summary && <section className="panel dashboard-panel stack" aria-labelledby="workload-title">
      <div className="section-title">
        <h2 id="workload-title">Pending Workload</h2>
        <a href="/staff/applications">View application queue</a>
      </div>
      <div className="priority-groups">
        <PriorityGroup title="Needs manual document review" group={summary.manualReview} emptyMessage="No applications need manual document review." />
        <PriorityGroup title="Awaiting approval" group={summary.awaitingApproval} emptyMessage="No applications are awaiting approval." />
      </div>
      <h3>Current application statuses</h3>
      <dl className="status-totals">
        {Object.entries(dashboardStatuses).map(([status, label]) => <div className="status-total" key={status}>
          <dt>{label}</dt><dd>{summary.counts[status]}</dd>
        </div>)}
      </dl>
    </section>}
  </>
}
