export const applicationStatuses = {
  submitted: 'Pending review',
  needs_correction: 'Needs Correction',
  rejected: 'Rejected',
  approved: 'Approved',
  paid: 'Paid',
}

export const applicationFilters = {
  ...applicationStatuses,
  'manual-review': 'Needs manual document review',
  'awaiting-approval': 'Awaiting approval',
  'new-today': 'New applications',
  resubmissions: 'Resubmissions',
}

export function applicationFilterQuery(filter, date) {
  const params = new URLSearchParams({ filter })
  if (date) params.set('date', date)
  return '?' + params
}
