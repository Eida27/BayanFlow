const notificationKinds = ['needs_correction', 'approved', 'rejected', 'document_issued']
const pageSize = 25
const residentEvents = `
  FROM application_events e JOIN applications a ON a.id = e.application_id
  WHERE a.resident_id = $1 AND e.kind = ANY($2::text[])
`

export async function recordApplicationEvent(db, id, revision, kind, details = {}) {
  await db.query(`
    INSERT INTO application_events (application_id, revision, kind, details)
    VALUES ($1, $2, $3, $4)
  `, [id, revision, kind, details])
}

export function registerResidentNotifications(api, pool, role, fail) {
  function eventId(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
      fail(400, 'Invalid notification ID.')
    }
    return value
  }

  async function countUnread(residentId) {
    const { rows: [row] } = await pool.query(
      `SELECT count(*)::int AS count ${residentEvents} AND e.read_at IS NULL`, [residentId, notificationKinds])
    return row.count
  }

  api.get('/resident/notifications/unread', async (req, res) => {
    role(req, 'resident')
    res.json({ unreadCount: await countUnread(req.user.id) })
  })

  api.get('/resident/notifications', async (req, res) => {
    role(req, 'resident')
    const cursor = req.query.before === undefined ? null : eventId(req.query.before)
    const { rows } = await pool.query(`
      SELECT e.id::text, e.application_id, e.kind, e.created_at, e.read_at IS NOT NULL AS read, a.title
      ${residentEvents}
      AND ($3::bigint IS NULL OR e.id < $3)
      ORDER BY e.id DESC LIMIT $4
    `, [req.user.id, notificationKinds, cursor, pageSize + 1])
    const items = rows.slice(0, pageSize)
    res.json({ items, nextCursor: rows.length > pageSize ? items.at(-1).id : null, unreadCount: await countUnread(req.user.id) })
  })

  api.post('/resident/notifications/:id/read', async (req, res) => {
    role(req, 'resident')
    const { rowCount } = await pool.query(`
      UPDATE application_events SET read_at = COALESCE(read_at, clock_timestamp())
      WHERE id = (SELECT e.id ${residentEvents} AND e.id = $3)
    `, [req.user.id, notificationKinds, eventId(req.params.id)])
    if (!rowCount) fail(404, 'Notification not found.')
    res.json({ unreadCount: await countUnread(req.user.id) })
  })
}
