import pg from 'pg'

export const databaseUrl = env => env.DATABASE_URL || 'postgres://bayanflow:bayanflow@127.0.0.1:55432/bayanflow'
export const createPool = (env = process.env) => new pg.Pool({ connectionString: databaseUrl(env) })

export async function transaction(pool, work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
