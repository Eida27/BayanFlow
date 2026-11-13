export function decisionAllowed(current, next) {
  return current === 'submitted' && ['needs_correction', 'approved', 'rejected'].includes(next)
}
