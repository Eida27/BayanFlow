export function needsManualReview({ findings, ai_error }) {
  return Boolean(ai_error || !Array.isArray(findings) || !findings.length || findings.some(finding => finding?.status !== 'present'))
}
