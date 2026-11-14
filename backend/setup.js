import { createPool, databaseUrl, transaction } from './database.js'
import { initializeDatabase, resetDatabase } from './initialize-database.js'

const reset = process.argv.includes('--reset')
if (reset) {
  const target = new URL(databaseUrl(process.env))
  if (process.env.NODE_ENV === 'production' ||
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
      target.port !== '55432' || target.pathname !== '/bayanflow' ||
      target.username !== 'bayanflow_owner' || target.search) {
    throw new Error('Reset requires the local BayanFlow development database on port 55432.')
  }
}
const pool = createPool()
try {
  await transaction(pool, async db => {
    if (!reset) return initializeDatabase(db)
    await db.query('SET LOCAL search_path TO public')
    await resetDatabase(db)
  })
  console.log(reset ? 'BayanFlow was reset and the demo accounts were restored.' : 'BayanFlow database and demo accounts are ready.')
} finally {
  await pool.end()
}
