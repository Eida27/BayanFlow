const kinds = ['submission', 'resubmission', 'payment']
const defaults = { submission: true, resubmission: true, payment: true }
const pageSize = 25

// Apply the account's preferences in the same statement as the read or write.
const visibleNotifications = `
  FROM staff_notifications n
  LEFT JOIN staff_notification_preferences p ON p.account_id = $1
  WHERE CASE n.kind
    WHEN 'submission' THEN coalesce(p.submission, true)
    WHEN 'resubmission' THEN coalesce(p.resubmission, true)
    WHEN 'payment' THEN coalesce(p.payment, true)
  END
`
const unread = `NOT EXISTS (
  SELECT 1 FROM staff_notification_reads r WHERE r.account_id = $1 AND r.notification_id = n.id
)`

export async function recordStaffNotification(db, { id, kind, revision, title, service, manualReview = false }) {
  // Serialize ID allocation through commit so a later arrival cannot fall behind a mark-all cutoff.
  await db.query("SELECT pg_advisory_xact_lock(hashtext('bayanflow.staff_notifications'))")
  await db.query(`
    INSERT INTO staff_notifications (application_id, kind, revision, title, service, manual_review)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (application_id, kind, revision) DO NOTHING
  `, [id, kind, revision, title, service, manualReview])
}

export function registerStaffNotifications(api, pool, role, fail) {
  function notificationId(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
      fail(400, 'Invalid notification ID.')
    }
    return value
  }

  async function countUnread(accountId) {
    const { rows: [row] } = await pool.query(`SELECT count(*)::int AS count ${visibleNotifications} AND ${unread}`, [accountId])
    return row.count
  }

  api.get('/staff/notifications/unread', async (req, res) => {
    role(req, 'staff')
    res.json({ unreadCount: await countUnread(req.user.id) })
  })

  api.get('/staff/notifications', async (req, res) => {
    role(req, 'staff')
    const cursor = req.query.before === undefined ? null : notificationId(req.query.before)
    const { rows } = await pool.query(`
      SELECT n.id::text, n.application_id, n.kind, n.title, n.service, n.manual_review, n.created_at,
             NOT (${unread}) AS read
      ${visibleNotifications}
      AND ($2::bigint IS NULL OR n.id < $2)
      ORDER BY n.id DESC LIMIT $3
    `, [req.user.id, cursor, pageSize + 1])
    const items = rows.slice(0, pageSize)
    res.json({ items, nextCursor: rows.length > pageSize ? items.at(-1).id : null, unreadCount: await countUnread(req.user.id) })
  })

  for (const [path, comparison, key] of [
    ['/staff/notifications/read-all', '<=', 'through'],
    ['/staff/notifications/:id/read', '=', 'id'],
  ]) {
    api.post(path, async (req, res) => {
      role(req, 'staff')
      const id = notificationId(key === 'through' ? req.body?.through : req.params.id)
      await pool.query(`
        INSERT INTO staff_notification_reads (account_id, notification_id)
        SELECT $1, n.id ${visibleNotifications} AND n.id ${comparison} $2
        ON CONFLICT DO NOTHING
      `, [req.user.id, id])
      res.json({ unreadCount: await countUnread(req.user.id) })
    })
  }

  api.get('/staff/preferences', async (req, res) => {
    role(req, 'staff')
    const { rows: [preferences] } = await pool.query(
      'SELECT submission, resubmission, payment FROM staff_notification_preferences WHERE account_id = $1', [req.user.id])
    res.json({ preferences: preferences ?? defaults })
  })

  api.post('/staff/preferences', async (req, res) => {
    role(req, 'staff')
    const preferences = req.body?.preferences
    if (!preferences || kinds.some(kind => typeof preferences[kind] !== 'boolean')) {
      fail(400, 'Choose a preference for each notification category.')
    }
    const { rows: [saved] } = await pool.query(`
      INSERT INTO staff_notification_preferences (account_id, submission, resubmission, payment)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (account_id) DO UPDATE SET submission = excluded.submission,
        resubmission = excluded.resubmission, payment = excluded.payment
      RETURNING submission, resubmission, payment
    `, [req.user.id, ...kinds.map(kind => preferences[kind])])
    res.json({ preferences: saved, unreadCount: await countUnread(req.user.id) })
  })
}
