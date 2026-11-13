import { reportTimezone } from '../report-dates.js'
import { manualReviewSql } from './application-filters.js'

export async function loadStaffDashboard(pool) {
  const { rows: [row] } = await pool.query(`
    WITH local_date AS (
      SELECT (statement_timestamp() AT TIME ZONE $1)::date AS day
    ), bounds AS (
      SELECT day, day::timestamp AT TIME ZONE $1 AS starts_at,
             (day + 1)::timestamp AT TIME ZONE $1 AS ends_at
      FROM local_date
    ), statuses AS (
      SELECT status, count(*) AS count FROM applications GROUP BY status
    ), pending AS (
      SELECT id, title, service, created_at,
             ${manualReviewSql} AS manual
      FROM applications a WHERE status = 'submitted'
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY manual ORDER BY created_at, id) AS position
      FROM pending
    ), groups AS (
      SELECT manual, json_build_object('count', count(*), 'items',
        json_agg(json_build_object('id', id, 'title', title, 'service', service)
                 ORDER BY position) FILTER (WHERE position <= 5)) AS summary
      FROM ranked GROUP BY manual
    )
    SELECT to_char(day, 'YYYY-MM-DD') AS date,
           (SELECT count(*) FROM applications WHERE created_at >= starts_at AND created_at < ends_at) AS submitted,
           (SELECT count(*) FROM staff_notifications WHERE kind = 'resubmission'
              AND created_at >= starts_at AND created_at < ends_at) AS resubmitted,
           (SELECT json_object_agg(status, count) FROM statuses) AS statuses,
           (SELECT summary FROM groups WHERE manual) AS manual_review,
           (SELECT summary FROM groups WHERE NOT manual) AS awaiting_approval
    FROM bounds
  `, [reportTimezone])

  return {
    date: row.date,
    timezone: reportTimezone,
    activity: { submitted: Number(row.submitted), resubmitted: Number(row.resubmitted) },
    counts: { submitted: 0, needs_correction: 0, rejected: 0, approved: 0, paid: 0, ...row.statuses },
    manualReview: row.manual_review ?? { count: 0, items: [] },
    awaitingApproval: row.awaiting_approval ?? { count: 0, items: [] },
  }
}
