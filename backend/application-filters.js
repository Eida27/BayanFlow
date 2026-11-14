import { applicationFilters, applicationStatuses } from '../application-filters.js'
import { reportRange, reportTimezone } from '../report-dates.js'

export const overdueReviewSql = `(a.status = 'submitted' AND a.review_due_at IS NOT NULL AND a.review_due_at <= statement_timestamp())`

// Keep this predicate shared between dashboard counts and queue drill-downs.
export const manualReviewSql = `(
  (a.ai_error IS NOT NULL AND a.ai_error <> '') OR CASE
    WHEN jsonb_typeof(a.findings) = 'array' THEN jsonb_array_length(a.findings) = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.findings) finding
      WHERE finding->>'status' IS DISTINCT FROM 'present'
    )
    ELSE true
  END
)`

export function applicationListFilter({ filter, date }, values, fail, staffId) {
  if (typeof filter !== 'string' || !Object.hasOwn(applicationFilters, filter)) {
    fail(400, 'Choose a supported application filter.')
  }
  const dated = filter === 'new-today' || filter === 'resubmissions'
  if (dated) {
    try {
      if (date === undefined) throw new Error()
      reportRange({ from: date, to: date })
    } catch {
      fail(400, 'Enter a valid application activity date.')
    }
    values.push(date, reportTimezone)
    const timestamp = filter === 'resubmissions' ? 'n.created_at' : 'a.created_at'
    const inDay = `${timestamp} >= ($2::date::timestamp AT TIME ZONE $3)
      AND ${timestamp} < (($2::date + 1)::timestamp AT TIME ZONE $3)`
    if (filter === 'new-today') return { predicate: inDay }
    return {
      join: `CROSS JOIN LATERAL (
        SELECT count(*)::int AS event_count FROM staff_notifications n
        WHERE n.application_id = a.id AND n.kind = 'resubmission' AND ${inDay}
      ) activity`,
      select: ', activity.event_count',
      predicate: 'activity.event_count > 0',
    }
  }
  if (date !== undefined) fail(400, 'This application filter does not accept a date.')
  if (filter === 'overdue') return { predicate: overdueReviewSql, order: 'a.review_due_at ASC, a.id ASC' }
  if (filter === 'unassigned') return { predicate: "a.status = 'submitted' AND a.assigned_staff_id IS NULL" }
  if (filter === 'assigned-to-me') {
    values.push(staffId)
    return { predicate: "a.status = 'submitted' AND a.assigned_staff_id = $2" }
  }
  if (Object.hasOwn(applicationStatuses, filter)) {
    values.push(filter)
    return { predicate: 'a.status = $2' }
  }
  return { predicate: `a.status = 'submitted' AND ${filter === 'manual-review' ? '' : 'NOT '}${manualReviewSql}` }
}
