import assert from 'node:assert/strict'
import test from 'node:test'
import { reportRange } from '../report-dates.js'

test('defaults to 30 Manila calendar days across the UTC day boundary', () => {
  assert.deepEqual(reportRange({}, new Date('2026-11-12T16:00:00Z')), {
    from: '2026-10-15', to: '2026-11-13', bucket: 'day',
  })
})

test('validates inclusive dates and changes buckets after 90 days', () => {
  assert.equal(reportRange({ from: '2026-01-01', to: '2026-03-31' }).bucket, 'day')
  assert.equal(reportRange({ from: '2026-01-01', to: '2026-04-01' }).bucket, 'month')
  for (const range of [
    { from: '2026-02-29', to: '2026-03-01' },
    { from: '2026-04-01', to: '2026-03-01' },
    { from: ['2026-01-01'], to: '2026-01-01' },
    { from: '2026-01-01' },
  ]) assert.throws(() => reportRange(range))
})
