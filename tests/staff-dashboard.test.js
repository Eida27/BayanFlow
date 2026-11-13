import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeApplications } from '../frontend/app/staff-analytics.js'

test('counts every status and puts each submitted application in one priority group', () => {
  const submission = (id, day, status = 'present', ai_error = null) => ({
    id,
    status: 'submitted',
    created_at: `2026-11-${day}T00:00:00.000Z`,
    findings: [{ status }],
    ai_error,
  })
  const awaiting = [12, 11, 10, '09', '08'].map(day => submission(`ready-${day}`, day))
  const applications = [
    ...awaiting,
    submission('missing', 13, 'missing'),
    submission('unclear', '07', 'unclear'),
    submission('failed', '06', 'present', 'Review unavailable'),
    ...['needs_correction', 'rejected', 'approved', 'paid'].map(status => ({ status })),
  ]

  const { counts, manualReview, awaitingApproval } = summarizeApplications(applications)
  assert.deepEqual(counts, { submitted: 8, needs_correction: 1, rejected: 1, approved: 1, paid: 1 })
  assert.deepEqual(manualReview.map(({ id }) => id), ['failed', 'unclear', 'missing'])
  assert.deepEqual(awaitingApproval.map(({ id }) => id), ['ready-08', 'ready-09', 'ready-10', 'ready-11', 'ready-12'])
})

test('routes unavailable findings to manual review and removes decided applications from priorities', () => {
  const legacy = { id: 'legacy', status: 'submitted', created_at: '2026-11-12T00:00:00Z' }
  const empty = { ...legacy, id: 'empty', findings: [] }
  assert.deepEqual(summarizeApplications([legacy, empty]).manualReview, [empty, legacy])

  const summary = summarizeApplications([{ ...legacy, status: 'approved' }])
  assert.equal(summary.counts.approved, 1)
  assert.equal(summary.counts.submitted, 0)
  assert.deepEqual(summary.manualReview, [])
  assert.deepEqual(summary.awaitingApproval, [])
})
