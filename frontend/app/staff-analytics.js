export const dashboardStatuses = {
  submitted: 'Submitted',
  needs_correction: 'Needs Correction',
  rejected: 'Rejected',
  approved: 'Approved',
  paid: 'Paid',
}

export function summarizeApplications(applications) {
  const counts = Object.fromEntries(Object.keys(dashboardStatuses).map(status => [status, 0]))
  const manualReview = []
  const awaitingApproval = []

  for (const application of applications) {
    counts[application.status] += 1
    if (application.status !== 'submitted') continue

    const { findings, ai_error } = application
    if (ai_error || !Array.isArray(findings) || !findings.length || findings.some(finding => finding?.status !== 'present')) {
      manualReview.push(application)
    } else {
      awaitingApproval.push(application)
    }
  }

  const oldestFirst = (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)
  manualReview.sort(oldestFirst)
  awaitingApproval.sort(oldestFirst)
  return { counts, manualReview, awaitingApproval }
}
