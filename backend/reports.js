import PDFDocument from 'pdfkit'
import { fileURLToPath } from 'node:url'
import { formatEther } from 'viem'
import { services } from '../services.js'
import { processingTime, reportTimezone } from '../report-dates.js'

export async function loadReport(pool, range) {
  const { from, to, bucket } = range
  const { rows: [row] } = await pool.query(`
    WITH bounds AS (
      SELECT $1::date::timestamp AT TIME ZONE 'Asia/Manila' AS starts_at,
             ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Manila' AS ends_at
    ), submissions AS (
      SELECT service, created_at AT TIME ZONE 'Asia/Manila' AS local_time
      FROM applications, bounds
      WHERE created_at >= starts_at AND created_at < ends_at
    ), trend AS (
      SELECT date_trunc($3, local_time) AS period, count(*) AS count
      FROM submissions GROUP BY 1
    ), service_counts AS (
      SELECT service, count(*) AS count FROM submissions GROUP BY service
    ), first_decisions AS (
      SELECT application_id, min(decided_at) AS first_at FROM decisions GROUP BY application_id
    ), processing AS (
      SELECT count(*) AS count,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_at - created_at)) AS median
      FROM first_decisions JOIN applications ON applications.id = application_id CROSS JOIN bounds
      WHERE first_at >= starts_at AND first_at < ends_at
    ), confirmed AS (
      SELECT count(*) AS count, coalesce(sum(amount), 0)::text AS wei
      FROM payments, bounds
      WHERE tx_hash IS NOT NULL AND confirmed_at >= starts_at AND confirmed_at < ends_at
    )
    SELECT (SELECT count(*) FROM submissions)::text AS submitted,
           coalesce((SELECT json_agg(json_build_object(
             'period', to_char(b.period, CASE WHEN $3 = 'day' THEN 'YYYY-MM-DD' ELSE 'YYYY-MM' END),
             'count', coalesce(t.count, 0)) ORDER BY b.period)
             FROM generate_series(date_trunc($3, $1::date::timestamp), date_trunc($3, $2::date::timestamp),
                  CASE WHEN $3 = 'day' THEN interval '1 day' ELSE interval '1 month' END) AS b(period)
             LEFT JOIN trend t USING (period)), '[]') AS trend,
           coalesce((SELECT json_object_agg(service, count) FROM service_counts), '{}') AS services,
           processing.count::text AS decisions, processing.median,
           confirmed.count::text AS payments, confirmed.wei
    FROM processing CROSS JOIN confirmed
  `, [from, to, bucket])

  return {
    ...range,
    timezone: reportTimezone,
    submitted: Number(row.submitted),
    trend: row.trend,
    services: Object.entries(services).map(([id, { label }]) => ({ label, count: row.services[id] ?? 0 })),
    firstDecisions: Number(row.decisions),
    medianSeconds: row.median,
    confirmedPayments: Number(row.payments),
    totalBnb: formatEther(BigInt(row.wei)),
  }
}

const reportFont = fileURLToPath(import.meta.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'))

export function reportPdf(report) {
  const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'BayanFlow Staff Report' } })
  const chunks = []
  const result = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
  })
  pdf.font(reportFont).fillColor('#182639').fontSize(24).text('BayanFlow Staff Report')
  pdf.moveDown(0.5).fontSize(10).text(`${report.from} to ${report.to} · ${report.timezone}`)
  const timestamp = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'long', timeZone: report.timezone })
  pdf.text(`Generated ${timestamp.format(new Date())}`)

  const section = title => pdf.moveDown().fontSize(14).fillColor('#00614e').text(title).moveDown(0.4).fontSize(10).fillColor('#182639')
  section('Summary')
  pdf.text(`Applications submitted: ${report.submitted}`)
  pdf.text(`First decisions: ${report.firstDecisions}`)
  pdf.text(`Median time to first decision: ${processingTime(report.medianSeconds)}`)
  pdf.text(`Confirmed payments: ${report.confirmedPayments}`)
  pdf.text(`Total received: ${report.totalBnb} BSC Testnet BNB`)

  section('Submissions by service')
  for (const { label, count } of report.services) pdf.text(`${label}: ${count}`)

  const trendTitle = report.bucket === 'day' ? 'Daily submissions' : 'Monthly submissions'
  const trendHeader = () => {
    section(trendTitle)
    pdf.text('Period                     Applications')
  }
  trendHeader()
  for (const { period, count } of report.trend) {
    if (pdf.y + 16 > pdf.page.height - pdf.page.margins.bottom) {
      pdf.addPage()
      trendHeader()
    }
    const y = pdf.y
    pdf.text(period, 48, y, { width: 110 })
    pdf.text(String(count), 158, y, { width: 100 })
    pdf.x = 48
  }
  pdf.end()
  return result
}
