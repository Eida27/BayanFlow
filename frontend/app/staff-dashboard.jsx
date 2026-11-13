import { BUSINESS_PERMIT, services } from '../../services.js'
import { dashboardStatuses, summarizeApplications } from './staff-analytics.js'

export const applicationAnchor = id => `application-${id}`

export function openLinkedApplication() {
  const card = document.getElementById(window.location.hash.slice(1))
  if (!(card instanceof HTMLDetailsElement)) return

  card.open = true
  card.querySelector('summary').focus({ preventScroll: true })
  card.scrollIntoView({ block: 'start' })
}

function PriorityGroup({ title, applications, emptyMessage }) {
  return <section className="priority-group">
    <h3>{title} <span className="priority-count">{applications.length}</span></h3>
    {applications.length ? <ul className="priority-list">
      {applications.map(application =>
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

export default function StaffDashboard({ applications, loading, busy, refresh }) {
  const summary = applications && summarizeApplications(applications)

  return <>
    <section className="panel dashboard-panel" aria-labelledby="application-status-title">
      <div className="section-title">
        <h2 id="application-status-title">Applications by status</h2>
        <button className="button secondary" disabled={busy} onClick={refresh}>Refresh</button>
      </div>
      {summary ? <dl className="status-totals">
        {Object.entries(dashboardStatuses).map(([status, label]) => <div className="status-total" key={status}>
          <dt>{label}</dt><dd>{summary.counts[status]}</dd>
        </div>)}
      </dl> : <p role={loading ? 'status' : undefined}>{loading ? 'Loading application data…' : 'Application data is unavailable.'}</p>}
    </section>
    <section className="panel dashboard-panel" aria-labelledby="priorities-title">
      <div className="section-title"><h2 id="priorities-title">Today’s Priorities</h2></div>
      {summary ? <div className="priority-groups">
        <PriorityGroup title="Needs manual document review" applications={summary.manualReview} emptyMessage="No applications need manual document review." />
        <PriorityGroup title="Awaiting approval" applications={summary.awaitingApproval} emptyMessage="No applications are awaiting approval." />
      </div> : <p>{loading ? 'Loading priorities…' : 'Priorities are unavailable.'}</p>}
    </section>
  </>
}
