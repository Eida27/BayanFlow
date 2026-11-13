export const reportTimezone = 'Asia/Manila'
const day = 86_400_000

function parseDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
  const timestamp = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : NaN
}

export function reportRange({ from, to }, now = new Date()) {
  if (from === undefined && to === undefined) {
    to = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: reportTimezone }).format(now)
    from = new Date(parseDate(to) - 29 * day).toISOString().slice(0, 10)
  }
  const start = parseDate(from)
  const end = parseDate(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error('Enter valid From and To dates, with From on or before To.')
  }
  return { from, to, bucket: end - start < 90 * day ? 'day' : 'month' }
}

export function processingTime(seconds) {
  if (seconds === null) return 'Unavailable'
  if (seconds < 60) return 'Less than 1 minute'
  const minutes = Math.round(seconds / 60)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes / 60) % 24
  return [days && `${days} d`, hours && `${hours} h`, minutes % 60 && `${minutes % 60} min`].filter(Boolean).join(' ')
}
