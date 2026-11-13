import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { createApp } from '../backend/app.js'
import { createPool } from '../backend/database.js'

test('fictional permit from submission through retried receipt confirmation', async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a disposable PostgreSQL database')
  const pool = createPool({ DATABASE_URL: process.env.TEST_DATABASE_URL })
  const schema = `test_${randomBytes(8).toString('hex')}`
  await pool.query(`CREATE SCHEMA ${schema}`)
  await pool.end()
  const url = new URL(process.env.TEST_DATABASE_URL)
  url.searchParams.set('options', `-c search_path=${schema}`)
  const db = createPool({ DATABASE_URL: url.href })
  t.after(async () => {
    await db.query(`DROP SCHEMA ${schema} CASCADE`)
    await db.end()
  })
  await db.query(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'))
  const { hashPassword } = await import('../backend/auth.js')
  for (const [name, role] of [['resident', 'resident'], ['other', 'resident'], ['staff', 'staff']]) {
    await db.query('INSERT INTO accounts (email,password_hash,role) VALUES ($1,$2,$3)', [name, hashPassword('demo'), role])
  }
  const hash = `0x${'33'.repeat(32)}`
  const payer = `0x${'11'.repeat(20)}`
  const contract = `0x${'22'.repeat(20)}`
  let verifications = 0
  const app = createApp({ pool: db, env: {}, gateway: {
    contract,
    currentBlock: async () => 1n,
    authorize: async payment => ({ referenceId: payment.reference_id }),
    verify: async (_payment, candidate) => { verifications++; return !candidate || candidate === hash ? hash : null }
  } })
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const request = (path, { cookie, body, origin } = {}) => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {})
    },
    body: body instanceof FormData || body === undefined ? body : JSON.stringify(body)
  })
  const login = async email => {
    const response = await request('/login', { body: { email, password: 'demo' } })
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie').split(';')[0]
  }
  const form = async complete => {
    const body = new FormData()
    body.append('title', 'Paper Lantern Stationery')
    for (const [key, file] of Object.entries({
      profile: 'business-profile',
      premises: complete ? 'premises-declaration' : 'incomplete-premises-declaration',
      authorization: 'owner-authorization'
    })) {
      body.append(key, new Blob([await readFile(new URL(`../frontend/public/samples/${file}.pdf`, import.meta.url))]), `${file}.pdf`)
    }
    return body
  }

  const [resident, staff, other] = await Promise.all(['resident', 'staff', 'other'].map(login))
  assert.equal((await request('/applications')).status, 401)
  assert.equal((await request('/applications', { cookie: staff, body: await form(false) })).status, 403)
  assert.equal((await request('/logout', { cookie: resident, body: {}, origin: 'https://untrusted.example' })).status, 403)
  const submission = await request('/applications', { cookie: resident, body: await form(false) })
  assert.equal(submission.status, 201)
  const { id } = await submission.json()
  const path = `/applications/${id}`
  const { applications } = await (await request('/applications', { cookie: resident })).json()
  assert.match(applications[0].ai_error, /Staff can review/)
  assert.equal((await request(path + '/documents/premises', { cookie: other })).status, 404)
  assert.equal((await request(path + '/documents/premises', { cookie: staff })).status, 200)
  const decision = (cookie, status, revision = 1) => request(path + '/decision', {
    cookie, body: { status, revision, note: 'Fictional staff review' }
  })
  assert.equal((await decision(resident, 'approved')).status, 403)
  assert.equal((await decision(staff, 'needs_correction')).status, 200)
  assert.equal((await request(path + '/revision', { cookie: resident, body: await form(true) })).status, 200)
  const original = await request(path + '/documents/premises?revision=1', { cookie: staff })
  assert.equal(original.status, 200)
  assert.doesNotMatch(await original.text(), /Intended use:/)
  assert.equal((await decision(staff, 'approved')).status, 409)
  assert.equal((await decision(staff, 'approved', 2)).status, 200)
  assert.equal((await decision(staff, 'rejected', 2)).status, 409)
  const authorization = await request(path + '/authorize', { cookie: resident, body: { payer } })
  assert.equal(authorization.status, 200)
  const { referenceId } = await authorization.json()
  assert.equal((await request(path + '/authorize', { cookie: resident, body: { payer: contract } })).status, 409)
  assert.equal((await request('/receipts/' + referenceId)).status, 404)
  assert.equal((await request(path + '/confirm', { cookie: resident, body: { hash: `0x${'44'.repeat(32)}` } })).status, 409)
  assert.equal((await request(path + '/confirm', { cookie: resident, body: {} })).status, 200)
  assert.equal((await request(path + '/confirm', { cookie: resident, body: { hash } })).status, 200)
  assert.equal(verifications, 2)
  const receipt = await (await request('/receipts/' + referenceId)).json()
  assert.deepEqual(receipt, { referenceId, hash, amount: '1000000000000000', chainId: 97, contract })
})
