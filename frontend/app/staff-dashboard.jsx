import { useCallback, useRef, useState } from 'react'
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

function CountLink({ filter, date, count, label }) {
  return <a href={'/staff/applications' + applicationFilterQuery(filter, date)}
    aria-label={`${count} ${label}`}>{count}</a>
}

function PriorityGroup({ filter, title, group: { count, items }, emptyMessage }) {
  return <section className="priority-group">
    <h3>{title} <span className="priority-count"><CountLink filter={filter} count={count} label={title} /></span></h3>
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
    <section className="panel dashboard-panel staff-activity" aria-labelledby="activity-title">
      <div className="section-title">
        <h2 id="activity-title">Today’s Activity</h2>
        <button className="button secondary" disabled={busy} onClick={refresh}>Refresh</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!summary && busy && <p role="status">Loading dashboard…</p>}
      {summary && <>
        <p className="dashboard-date"><time dateTime={summary.date}>{summary.date}</time> · Manila time</p>
        <dl className="status-totals">
          <div className="status-total"><dt>New applications</dt><dd><CountLink filter="new-today" date={summary.date} count={summary.activity.submitted} label="New applications" /></dd></div>
          <div className="status-total"><dt>Resubmissions</dt><dd><CountLink filter="resubmissions" date={summary.date} count={summary.activity.resubmitted} label="Resubmissions" /></dd></div>
        </dl>
      </>}
    </section>
    {summary && <section className="panel dashboard-panel stack" aria-labelledby="workload-title">
      <div className="section-title">
        <h2 id="workload-title">Pending Workload</h2>
        <a className="button secondary" href="/staff/applications">View application queue</a>
      </div>
      <div className="priority-groups">
        <PriorityGroup filter="manual-review" title="Needs manual document review" group={summary.manualReview} emptyMessage="No applications need manual document review." />
        <PriorityGroup filter="awaiting-approval" title="Awaiting approval" group={summary.awaitingApproval} emptyMessage="No applications are awaiting approval." />
      </div>
      <h3>Current application statuses</h3>
      <dl className="status-totals">
        {Object.entries(applicationStatuses).map(([status, label]) => <div className="status-total" key={status}>
          <dt>{label}</dt><dd><CountLink filter={status} count={summary.counts[status]} label={label} /></dd>
        </div>)}
      </dl>
    </section>}
  </>
}
