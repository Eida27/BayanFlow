import { readFile } from 'node:fs/promises'
import { hashPassword } from './auth.js'

export async function initializeDatabase(db) {
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
  await db.query(schema)
  for (const [role, password] of [['resident', 'resident-demo'], ['staff', 'staff-demo']]) {
    await db.query('INSERT INTO accounts (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
      [`${role}@bayanflow.test`, hashPassword(password), role])
  }
}

export async function resetDatabase(db) {
  const { rows: [{ schema }] } = await db.query('SELECT quote_ident(current_schema()::text) AS schema')
  await db.query(`DROP SCHEMA ${schema} CASCADE`)
  await db.query(`CREATE SCHEMA ${schema}`)
  await initializeDatabase(db)
}
