'use client'

import { useEffect, useState } from 'react'
import { reportTimezone } from '../../report-dates.js'
import { api } from './shared'

const deadlineFormat = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: reportTimezone,
})

export function ReviewDeadline({ dueAt }) {
  return dueAt && <time dateTime={dueAt}>{deadlineFormat.format(new Date(dueAt))} Manila time</time>
}

export default function StaffAssignment({ application, refreshQueue, busy }) {
  const [reviewers, setReviewers] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [directoryError, setDirectoryError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [selection, setSelection] = useState(String(application.assigned_staff_id ?? ''))

  useEffect(() => {
    let active = true
    api('/staff/reviewers')
      .then(({ reviewers }) => { if (active) setReviewers(reviewers) })
      .catch(error => { if (active) setDirectoryError(error.message) })
    return () => { active = false }
  }, [attempt])

  async function save(event) {
    event.preventDefault()
    if (busy || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await api('/applications/' + application.id + '/assignment', { assigneeId: selection ? Number(selection) : null })
      refreshQueue(application.id)
    } catch (error) {
      setSaveError(error.message)
    } finally {
      setSaving(false)
    }
  }

  return <form className="stack" onSubmit={save}>
    <h4>Staff assignment</h4>
    {directoryError ? <div className="stack">
      <p className="error" role="alert">{directoryError}</p>
      <div><button type="button" className="button secondary" onClick={() => {
        setDirectoryError('')
        setAttempt(value => value + 1)
      }}>Retry loading reviewers</button></div>
    </div> : !reviewers ? <p role="status">Loading reviewers…</p> : <>
      <label>Assigned reviewer
        <select value={selection} disabled={busy || saving} onChange={event => setSelection(event.target.value)}>
          <option value="">Unassigned</option>
          {reviewers.map(reviewer => <option value={reviewer.id} key={reviewer.id}>{reviewer.email}</option>)}
        </select>
      </label>
      {saveError && <p className="error" role="alert">{saveError}</p>}
      <div><button className="button secondary" disabled={busy || saving || selection === String(application.assigned_staff_id ?? '')}>
        {saving ? 'Saving assignment…' : 'Save assignment'}
      </button></div>
    </>}
  </form>
}
