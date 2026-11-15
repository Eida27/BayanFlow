import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { createApp } from '../backend/app.js'
import { hashPassword } from '../backend/auth.js'

test('Next.js forwards API requests to the configured host with a local default', async () => {
  const script = "import config from './frontend/next.config.mjs'; console.log((await config.rewrites())[0].destination)"
  for (const [origin, expected] of [['', 'http://127.0.0.1:4000'], ['https://api.example.test/', 'https://api.example.test']]) {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, API_ORIGIN: origin },
    })
    assert.equal(result.trim(), expected + '/api/:path*')
  }
})

test('remote database setup requires hosted passwords before connecting', () => {
  const result = () => execFileSync(process.execPath, ['backend/setup.js'], {
    env: { ...process.env, DATABASE_URL: 'postgres://user:password@127.0.0.2:1/demo',
      NODE_ENV: 'development', DEMO_RESIDENT_PASSWORD: 'a-generated-password', DEMO_STAFF_PASSWORD: '' },
    stdio: 'pipe',
  })
  assert.throws(result, /DEMO_STAFF_PASSWORD/)
})

test('process health and secure session cookies work behind hosted HTTPS', async t => {
  const account = { id: 1, email: 'resident@bayanflow.test', role: 'resident', password_hash: hashPassword('demo') }
  const db = { query: async () => ({ rows: [account] }), release() {} }
  const pool = { ...db, connect: async () => db }
  const env = { WEB_ORIGIN: 'https://demo.example.test' }
  const server = await new Promise(resolve => {
    const listening = createApp({ pool, env }).listen(0, '127.0.0.1', () => resolve(listening))
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  for (const [route, body] of [['login', { email: account.email, password: 'demo' }], ['logout', {}]]) {
    const response = await fetch(`${base}/api/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.WEB_ORIGIN }, body: JSON.stringify(body),
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('set-cookie'), /; Secure(?:;|$)/)
  }
  assert.equal((await fetch(base + '/healthz')).status, 200)
})
