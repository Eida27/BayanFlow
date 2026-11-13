import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { processingTime, reportRange } from '../../report-dates.js'
import { api } from './shared'

function ReportTable({ caption, label, rows }) {
  return <table className="report-table">
    <caption>{caption}</caption>
    <thead><tr><th scope="col">{label}</th><th scope="col">New applications</th><th scope="col">Resubmissions</th></tr></thead>
    <tbody>{rows.map(([name, count, resubmitted]) => <tr key={name}><th scope="row">{name}</th><td>{count}</td><td>{resubmitted}</td></tr>)}</tbody>
  </table>
}

function SubmissionTrend({ trend, bucket }) {
  const peak = trend.reduce((maximum, { count, resubmitted }) => Math.max(maximum, count, resubmitted), 1)
  const step = 100 / trend.length
  return <section className="panel stack" aria-labelledby="trend-title">
    <h2 id="trend-title">{bucket === 'day' ? 'Daily' : 'Monthly'} submissions</h2>
    <ul className="report-legend"><li>New applications</li><li className="resubmissions">Resubmissions</li></ul>
    <div className="trend-chart">
      <div aria-hidden="true" className="trend-scale"><span>{peak}</span><span>0</span></div>
      <svg role="img" aria-label="New applications and resubmissions by period. Exact values are in the table below."
        viewBox="0 0 100 100" preserveAspectRatio="none">
        {trend.map(({ period, count, resubmitted }, index) => <g key={period}>
          <title>{period}: {count} new, {resubmitted} resubmitted</title>
          <rect x={step * (index + 0.1)} y={100 - count / peak * 100} width={step * 0.38} height={count / peak * 100} />
          <rect className="resubmissions" x={step * (index + 0.52)} y={100 - resubmitted / peak * 100}
            width={step * 0.38} height={resubmitted / peak * 100} />
        </g>)}
      </svg>
      <div className="trend-dates"><span>{trend[0].period}</span>{trend.length > 1 && <span>{trend.at(-1).period}</span>}</div>
    </div>
    <details className="trend-data">
      <summary>View trend data</summary>
      <ReportTable caption="Submissions by period" label="Period" rows={trend.map(({ period, count, resubmitted }) => [period, count, resubmitted])} />
    </details>
  </section>
}

export default function StaffReports() {
  const params = useSearchParams()
  const from = params.get('from')
  const to = params.get('to')
  return <ReportContent key={JSON.stringify([from, to])} from={from} to={to} />
}

function ReportContent({ from, to }) {
  const router = useRouter()
  const [filters, setFilters] = useState(null)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const dates = { from: from ?? undefined, to: to ?? undefined }
    try {
      const range = reportRange(dates)
      const applied = new URLSearchParams({ from: range.from, to: range.to })
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
  }, [attempt, from, to])

  return <div className="report-layout">
    <section className="panel stack" aria-labelledby="report-dates">
      <h2 id="report-dates">Date range</h2>
      <p>Dates are inclusive in Asia/Manila. New applications, resubmissions, first decisions, and payments each use their own event date. Resubmission history begins when event recording was enabled.</p>
      {filters && <form action="/staff/reports" className="report-filters" onSubmit={event => {
        event.preventDefault()
        const dates = Object.fromEntries(new FormData(event.currentTarget))
        try {
          reportRange(dates)
          setError('')
          router.push('/staff/reports?' + new URLSearchParams(dates))
        } catch (error) {
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
      {!report.submitted && !report.resubmitted && !report.firstDecisions && !report.confirmedPayments && <p className="empty">No activity in this date range.</p>}
      <section className="panel stack" aria-labelledby="report-summary">
        <h2 id="report-summary">Report summary</h2>
        <dl className="report-totals">
          <div className="status-total"><dt>New applications</dt><dd>{report.submitted}</dd></div>
          <div className="status-total"><dt>Resubmissions</dt><dd>{report.resubmitted}</dd></div>
          <div className="status-total"><dt>First decisions</dt><dd>{report.firstDecisions}</dd></div>
          <div className="status-total"><dt>Median time to first decision</dt><dd>{processingTime(report.medianSeconds)}</dd></div>
        </dl>
      </section>
      <SubmissionTrend trend={report.trend} bucket={report.bucket} />
      <section className="panel">
        <ReportTable caption="Submissions by service" label="Municipal service" rows={report.services.map(({ label, count, resubmitted }) => [label, count, resubmitted])} />
      </section>
      <section className="panel stack staff-testnet" aria-labelledby="testnet-activity">
        <h2 id="testnet-activity">BSC Testnet activity</h2>
        <dl className="report-totals">
          <div className="status-total"><dt>Confirmed testnet payments</dt><dd>{report.confirmedPayments}</dd></div>
          <div className="status-total"><dt>Confirmed amount · Testnet BNB</dt><dd>{report.totalBnb}</dd></div>
        </dl>
      </section>
    </>}
  </div>
}
