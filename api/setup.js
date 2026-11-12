import { readFile } from 'node:fs/promises'
import { createPool, transaction } from './database.js'
import { hashPassword } from './auth.js'

const pool = createPool()
try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  await transaction(pool, async db => {
    await db.query(schema)
    for (const [role, password] of [['resident', 'resident-demo'], ['staff', 'staff-demo']]) {
      await db.query('INSERT INTO accounts (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
        [`${role}@bayanflow.test`, hashPassword(password), role])
    }
  })
  console.log('BayanFlow database and demo accounts are ready.')
} finally {
  await pool.end()
}
