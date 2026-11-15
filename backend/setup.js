import { createPool, databaseUrl, transaction } from './database.js'
import { initializeDatabase, resetDatabase } from './initialize-database.js'

const reset = process.argv.includes('--reset')
const target = new URL(databaseUrl(process.env))
const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
if (reset) {
  if (process.env.NODE_ENV === 'production' ||
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      !localHost ||
      target.port !== '55432' || target.pathname !== '/bayanflow' ||
      target.username !== 'bayanflow_owner' || target.search) {
    throw new Error('Reset requires the local BayanFlow development database on port 55432.')
  }
}
let demoPasswords
if (process.env.NODE_ENV === 'production' || !localHost) {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL explicitly for hosted setup.')
  demoPasswords = {}
  for (const role of ['resident', 'staff']) {
    const name = `DEMO_${role.toUpperCase()}_PASSWORD`
    const password = process.env[name]
    if (!password?.trim() || password.length > 128 || ['resident-demo', 'staff-demo'].includes(password)) {
      throw new Error(`Set ${name} to a non-default password of 1–128 characters for hosted setup.`)
    }
    demoPasswords[role] = password
  }
  if (demoPasswords.resident === demoPasswords.staff) throw new Error('Use different hosted demo passwords for resident and staff.')
}
const pool = createPool()
try {
  await transaction(pool, async db => {
    if (!reset) return initializeDatabase(db, demoPasswords)
    await db.query('SET LOCAL search_path TO public')
    await resetDatabase(db)
  })
  console.log(reset ? 'BayanFlow was reset and the demo accounts were restored.' : 'BayanFlow database and demo accounts are ready.')
} finally {
  await pool.end()
}
