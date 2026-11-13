import { useEffect, useState } from 'react'
import { processingTime, reportRange } from '../../report-dates.js'
import { api } from './shared'

function ReportTable({ caption, label, rows }) {
  return <table className="report-table">
    <caption>{caption}</caption>
    <thead><tr><th scope="col">{label}</th><th scope="col">Applications</th></tr></thead>
    <tbody>{rows.map(([name, count]) => <tr key={name}><th scope="row">{name}</th><td>{count}</td></tr>)}</tbody>
  </table>
}

function SubmissionTrend({ trend, bucket }) {
  const peak = trend.reduce((maximum, { count }) => Math.max(maximum, count), 1)
  const step = 100 / trend.length
  return <section className="panel stack" aria-labelledby="trend-title">
    <h2 id="trend-title">{bucket === 'day' ? 'Daily' : 'Monthly'} submissions</h2>
    <div className="trend-chart">
      <div aria-hidden="true" className="trend-scale"><span>{peak}</span><span>0</span></div>
      <svg role="img" aria-label="Application submissions by period. Exact values are in the table below."
        viewBox="0 0 100 100" preserveAspectRatio="none">
        {trend.map(({ period, count }, index) => {
          const height = count / peak * 100
          return <rect key={period} x={step * (index + 0.15)} y={100 - height} width={step * 0.7} height={height}>
            <title>{period}: {count}</title>
          </rect>
        })}
      </svg>
      <div className="trend-dates"><span>{trend[0].period}</span>{trend.length > 1 && <span>{trend.at(-1).period}</span>}</div>
    </div>
    <details className="trend-data">
      <summary>View trend data</summary>
      <ReportTable caption="Submissions by period" label="Period" rows={trend.map(({ period, count }) => [period, count])} />
    </details>
  </section>
}

export default function StaffReports() {
  const [filters, setFilters] = useState(null)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const query = new URLSearchParams(window.location.search)
    const dates = { from: query.get('from') ?? undefined, to: query.get('to') ?? undefined }
    try {
      const range = reportRange(dates)
      const applied = new URLSearchParams({ from: range.from, to: range.to })
      if (!query.has('from') && !query.has('to')) window.history.replaceState(null, '', '?' + applied)
      setFilters(range)
      api('/staff/reports?' + applied)
        .then(result => { if (active) setReport(result) })
        .catch(error => { if (active) setError(error.message) })
        .finally(() => { if (active) setLoading(false) })
    } catch (error) {
      const defaults = reportRange({})
      setFilters({ from: dates.from ?? defaults.from, to: dates.to ?? defaults.to })
      setError(error.message)
      setLoading(false)
    }
    return () => { active = false }
  }, [attempt])

  return <div className="report-layout">
    <section className="panel stack" aria-labelledby="report-dates">
      <h2 id="report-dates">Date range</h2>
      <p>Dates are inclusive in Asia/Manila. Submissions, first decisions, and payments each use their own event date.</p>
      {filters && <form action="/staff/reports" className="report-filters" onSubmit={event => {
        const dates = Object.fromEntries(new FormData(event.currentTarget))
        try {
          reportRange(dates)
        } catch (error) {
          event.preventDefault()
          setError(error.message)
        }
      }}>
        <label>From<input type="date" name="from" required defaultValue={filters.from} /></label>
        <label>To<input type="date" name="to" required defaultValue={filters.to} /></label>
        <button className="button primary">Apply</button>
        {report && <a className="button secondary report-export" href={`/api/staff/reports/pdf?${new URLSearchParams({ from: report.from, to: report.to })}`}>Download PDF</a>}
      </form>}
      {error && <div className="report-error">
        <p role="alert">{error}</p>
        {filters?.bucket && !report && <button className="button secondary" onClick={() => {
          setError('')
          setLoading(true)
          setAttempt(attempt + 1)
        }}>Retry</button>}
      </div>}
    </section>
    {loading && <p role="status">Loading report…</p>}
    {report && <>
      {!report.submitted && !report.firstDecisions && !report.confirmedPayments && <p className="empty">No activity in this date range.</p>}
      <section className="panel stack" aria-labelledby="report-summary">
        <h2 id="report-summary">Report summary</h2>
        <dl className="report-totals">
          <div className="status-total"><dt>Applications submitted</dt><dd>{report.submitted}</dd></div>
          <div className="status-total"><dt>First decisions</dt><dd>{report.firstDecisions}</dd></div>
          <div className="status-total"><dt>Median time to first decision</dt><dd>{processingTime(report.medianSeconds)}</dd></div>
          <div className="status-total"><dt>Confirmed payments</dt><dd>{report.confirmedPayments}</dd></div>
          <div className="status-total"><dt>Total received · BSC Testnet BNB</dt><dd>{report.totalBnb}</dd></div>
        </dl>
      </section>
      <SubmissionTrend trend={report.trend} bucket={report.bucket} />
      <section className="panel">
        <ReportTable caption="Submissions by service" label="Municipal service" rows={report.services.map(({ label, count }) => [label, count])} />
      </section>
    </>}
  </div>
}
