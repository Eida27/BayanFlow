import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { BUSINESS_PERMIT, services } from '../../services.js'
import { applicationFilterQuery, applicationStatuses } from '../../application-filters.js'
import { api } from './shared'
import { useVisibleRefresh } from './use-visible-refresh'

export const applicationAnchor = id => `application-${id}`

export function openApplicationCard(anchor) {
  const card = document.getElementById(anchor)
  if (!(card instanceof HTMLDetailsElement)) return

  card.open = true
  card.querySelector('summary').focus({ preventScroll: true })
  card.scrollIntoView({ block: 'start' })
}

export function openLinkedApplication() {
  openApplicationCard(window.location.hash.slice(1))
}

function MetricCard({ filter, date, count, label }) {
  return <Link className="status-total dashboard-link dashboard-metric"
    href={'/staff/applications' + applicationFilterQuery(filter, date)}
    aria-label={`${count} ${label}`}>
    <span className="metric-label">{label}</span>
    <span className="metric-value">{count}</span>
    <span className="dashboard-arrow" aria-hidden="true">→</span>
  </Link>
}

function PriorityGroup({ filter, title, group: { count, items }, emptyMessage }) {
  return <section className="priority-group">
    <h3><Link className="dashboard-link priority-heading"
      href={'/staff/applications' + applicationFilterQuery(filter)}
      aria-label={`${title}, ${count} applications`}>
      <span>{title}</span>
      <span className="priority-count">{count}</span>
      <span aria-hidden="true">→</span>
    </Link></h3>
    {items.length ? <ul className="priority-list">
      {items.map(application =>
        <li key={application.id}>
          <Link href={`/staff/applications#${applicationAnchor(application.id)}`}>
            <strong>{application.title}</strong>
            <small>{services[application.service ?? BUSINESS_PERMIT].label}</small>
          </Link>
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
    <section className="panel dashboard-panel staff-activity" aria-labelledby="activity-title">
      <div className="section-title">
        <h2 id="activity-title">Today’s Activity</h2>
        <button className="button secondary" disabled={busy} onClick={refresh}>Refresh</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!summary && busy && <p role="status">Loading dashboard…</p>}
      {summary && <>
        <p className="dashboard-date"><time dateTime={summary.date}>{summary.date}</time> · Manila time</p>
        <div className="status-totals">
          <MetricCard filter="new-today" date={summary.date} count={summary.activity.submitted} label="New applications" />
          <MetricCard filter="resubmissions" date={summary.date} count={summary.activity.resubmitted} label="Resubmissions" />
        </div>
      </>}
    </section>
    {summary && <section className="panel dashboard-panel stack" aria-labelledby="workload-title">
      <div className="section-title">
        <h2 id="workload-title">Pending Workload</h2>
        <Link className="button secondary" href="/staff/applications">View application queue</Link>
      </div>
      <div className="priority-groups">
        <PriorityGroup filter="manual-review" title="Needs manual document review" group={summary.manualReview} emptyMessage="No applications need manual document review." />
        <PriorityGroup filter="awaiting-approval" title="Awaiting approval" group={summary.awaitingApproval} emptyMessage="No applications are awaiting approval." />
      </div>
      <h3>Current application statuses</h3>
      <div className="status-totals">
        {Object.entries(applicationStatuses).map(([status, label]) =>
          <MetricCard key={status} filter={status} count={summary.counts[status]} label={label} />)}
      </div>
    </section>}
  </>
}
