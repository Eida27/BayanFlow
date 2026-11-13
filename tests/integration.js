import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { createApp } from '../backend/app.js'
import { createPool } from '../backend/database.js'
import { extractText } from '../backend/review.js'

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
  const setup = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
  await db.query(setup.split('\nALTER TABLE applications')[0])
  const { hashPassword } = await import('../backend/auth.js')
  for (const [name, role] of [['resident', 'resident'], ['other', 'resident'], ['staff', 'staff']]) {
    await db.query('INSERT INTO accounts (email,password_hash,role) VALUES ($1,$2,$3)', [name, hashPassword('demo'), role])
  }
  const legacyId = randomUUID()
  const legacyReference = `0x${'66'.repeat(32)}`
  const legacyHash = `0x${'77'.repeat(32)}`
  await db.query("INSERT INTO applications (id, resident_id, title, status) SELECT $1, id, 'Legacy permit', 'paid' FROM accounts WHERE email='resident'", [legacyId])
  const legacyPdf = await readFile(new URL('../frontend/public/samples/business-profile.pdf', import.meta.url))
  await db.query("INSERT INTO documents VALUES ($1, 1, 'profile', $2)", [legacyId, legacyPdf])
  await db.query('INSERT INTO payments (application_id, reference_id, amount, tx_hash, contract, confirmed_at) VALUES ($1, $2, 1, $3, $4, now())',
    [legacyId, legacyReference, legacyHash, `0x${'22'.repeat(20)}`])
  await db.query(setup.slice(0, setup.lastIndexOf('\nDO $$')))
  await db.query("ALTER TABLE applications ADD CONSTRAINT applications_service_check CHECK (service IN ('business_permit', 'mayors_clearance'))")
  const legacyClearanceId = randomUUID()
  await db.query("INSERT INTO applications (id, resident_id, title, status, service) SELECT $1, id, 'Legacy clearance', 'submitted', 'mayors_clearance' FROM accounts WHERE email='other'", [legacyClearanceId])
  await db.query("INSERT INTO documents VALUES ($1, 1, 'supporting', $2)", [legacyClearanceId, legacyPdf])
  await db.query(setup)
  await db.query(setup)
  const hash = `0x${'33'.repeat(32)}`
  const clearanceHash = `0x${'55'.repeat(32)}`
  const zoningHash = `0x${'88'.repeat(32)}`
  const payer = `0x${'11'.repeat(20)}`
  const contract = `0x${'22'.repeat(20)}`
  let verifications = 0
  const app = createApp({ pool: db, env: {}, gateway: {
    contract,
    currentBlock: async () => 1n,
    authorize: async payment => ({ referenceId: payment.reference_id }),
    verify: async (_payment, candidate) => {
      verifications++
      return [clearanceHash, zoningHash, hash].includes(candidate) ? candidate : !candidate ? hash : null
    }
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
  assert.equal((await request(`/applications/${legacyId}/documents/profile`, { cookie: resident })).status, 200)
  assert.equal((await request(`/applications/${legacyClearanceId}/documents/supporting`, { cookie: other })).status, 200)
  assert.equal((await (await request('/receipts/' + legacyReference)).json()).hash, legacyHash)
  assert.equal((await request('/applications')).status, 401)
  assert.equal((await request('/applications', { cookie: staff, body: await form(false) })).status, 403)
  assert.equal((await request('/logout', { cookie: resident, body: {}, origin: 'https://untrusted.example' })).status, 403)
  const submission = await request('/applications', { cookie: resident, body: await form(false) })
  assert.equal(submission.status, 201)
  const { id } = await submission.json()
  const path = `/applications/${id}`
  const { applications } = await (await request('/applications', { cookie: resident })).json()
  assert.equal(applications.find(application => application.id === legacyId).service, 'business_permit')
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
  assert.equal((await request(path + '/certificate', { cookie: resident })).status, 404)

  const supporting = await readFile(new URL('../frontend/public/samples/clearance-supporting.pdf', import.meta.url))
  const clearanceForm = (overrides = {}, pdf = supporting) => {
    const body = new FormData()
    const fields = {
      service: 'mayors_clearance', title: '  Alex Muñoz (Sample)  ',
      address: '10 Example Lane, Demo Town', purpose: 'Volunteer application for the Demo Town Reading Program',
      ...overrides
    }
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) body.set(key, value)
    body.set('supporting', new Blob([pdf]), 'supporting.pdf')
    return body
  }
  const submitClearance = body => request('/applications', { cookie: resident, body })
  assert.equal((await submitClearance(clearanceForm({ purpose: undefined }))).status, 400)
  assert.equal((await submitClearance(clearanceForm({ address: 'a'.repeat(241) }))).status, 400)
  assert.equal((await submitClearance(clearanceForm({}, 'not a PDF'))).status, 400)
  assert.equal((await submitClearance(clearanceForm({}, Buffer.alloc(5 * 1024 * 1024 + 1)))).status, 400)
  const submitted = await submitClearance(clearanceForm())
  assert.equal(submitted.status, 201)
  const clearancePath = '/applications/' + (await submitted.json()).id
  const certificate = cookie => request(clearancePath + '/certificate', { cookie })
  const review = (target, status, revision) => request(target + '/decision', {
    cookie: staff, body: { status, revision, note: 'Fictional staff review' }
  })
  assert.equal((await certificate(resident)).status, 404)
  assert.equal((await review(clearancePath, 'needs_correction', 1)).status, 200)
  assert.equal((await request(clearancePath + '/revision', { cookie: resident, body: clearanceForm({ service: 'business_permit' }) })).status, 400)
  const longPurpose = 'Volunteer work in the municipal reading program. '.repeat(10).trim()
  const corrected = clearanceForm({ service: undefined, purpose: longPurpose })
  assert.equal((await request(clearancePath + '/revision', { cookie: resident, body: corrected })).status, 200)
  assert.equal((await request(clearancePath + '/documents/supporting?revision=1', { cookie: staff })).status, 200)
  assert.equal((await review(clearancePath, 'approved', 2)).status, 200)
  assert.equal((await certificate(resident)).status, 404)
  assert.equal((await request(clearancePath + '/authorize', { cookie: resident, body: { payer } })).status, 200)
  const confirm = () => request(clearancePath + '/confirm', { cookie: resident, body: { hash: clearanceHash } })
  const firstConfirmation = await confirm()
  assert.equal(firstConfirmation.status, 200)
  const payment = await firstConfirmation.json()
  assert.deepEqual(await (await confirm()).json(), payment)
  const downloaded = await certificate(resident)
  assert.equal(downloaded.status, 200)
  assert.match(downloaded.headers.get('content-type'), /^application\/pdf/)
  const pdf = Buffer.from(await downloaded.arrayBuffer())
  const certificateText = await extractText(pdf)
  assert.match(certificateText, /DEMO ONLY — NOT AN OFFICIAL MUNICIPAL DOCUMENT/)
  assert.match(certificateText, /Alex Muñoz \(Sample\)/)
  assert.ok(certificateText.includes(longPurpose))
  assert.equal((await certificate(other)).status, 404)
  assert.equal((await certificate(staff)).status, 403)
  assert.deepEqual(await (await request('/receipts/' + payment.referenceId)).json(),
    { referenceId: payment.referenceId, hash: clearanceHash, amount: '1000000000000000', chainId: 97, contract })
  const rejected = await submitClearance(clearanceForm())
  const rejectedPath = '/applications/' + (await rejected.json()).id
  assert.equal((await review(rejectedPath, 'rejected', 1)).status, 200)
  assert.equal((await request(rejectedPath + '/authorize', { cookie: resident, body: { payer } })).status, 409)

  const zoningForm = async (attachments = {}) => {
    const body = new FormData()
    body.set('service', 'zoning_clearance')
    body.set('title', 'Paper Lantern Reading Room')
    body.set('address', '25 Example Avenue, Demo Town')
    body.set('purpose', 'Operate a community reading room.')
    for (const [name, sample] of Object.entries(attachments)) {
      body.set(name, new Blob([await readFile(new URL(`../frontend/public/samples/${sample}.pdf`, import.meta.url))]), sample + '.pdf')
    }
    return body
  }
  const applicationsPath = '/applications'
  const submitZoning = body => request(applicationsPath, { cookie: resident, body })
  const current = async (id, cookie = resident) => (await (await request(applicationsPath, { cookie })).json())
    .applications.find(application => application.id === id)
  assert.equal((await submitZoning(await zoningForm({ supporting: 'clearance-supporting' }))).status, 400)
  const empty = await submitZoning(await zoningForm())
  assert.equal(empty.status, 201)
  const emptyId = (await empty.json()).id
  assert.equal((await current(emptyId)).findings.length, 3)
  const partial = await submitZoning(await zoningForm({ zoning_site: 'zoning-site-incomplete', zoning_use: 'zoning-use-incomplete' }))
  assert.equal(partial.status, 201)
  const { id: zoningId } = await partial.json()
  const zoningPath = applicationsPath + '/' + zoningId
  const staffView = await current(zoningId, staff)
  assert.deepEqual(staffView.uploaded_documents.sort(), ['zoning_site', 'zoning_use'])
  assert.deepEqual(staffView.findings.map(({ requirement, status }) => [requirement, status]), [['zoning_ownership', 'missing']])
  assert.match(staffView.ai_error, /manually/)
  assert.equal((await review(zoningPath, 'approved', 1)).status, 409)
  assert.equal((await review(zoningPath, 'needs_correction', 1)).status, 200)
  const complete = await zoningForm({ zoning_site: 'zoning-site', zoning_use: 'zoning-use', zoning_ownership: 'zoning-ownership' })
  assert.equal((await request(zoningPath + '/revision', { cookie: resident, body: complete })).status, 200)
  const oldSheet = await request(zoningPath + '/documents/zoning_site?revision=1', { cookie: staff })
  assert.equal(oldSheet.status, 200)
  assert.doesNotMatch(await oldSheet.text(), /Lot area/)
  assert.equal((await request(zoningPath + '/documents/zoning_ownership?revision=1', { cookie: staff })).status, 404)
  assert.equal((await review(zoningPath, 'approved', 2)).status, 200)
  const zoningCertificate = cookie => request(zoningPath + '/certificate', { cookie })
  assert.equal((await zoningCertificate(resident)).status, 404)
  assert.equal((await request(zoningPath + '/authorize', { cookie: resident, body: { payer } })).status, 200)
  const confirmZoning = () => request(zoningPath + '/confirm', { cookie: resident, body: { hash: zoningHash } })
  const confirmed = await confirmZoning()
  assert.equal(confirmed.status, 200)
  const zoningPayment = await confirmed.json()
  assert.deepEqual(await (await confirmZoning()).json(), zoningPayment)
  const zoningDownload = await zoningCertificate(resident)
  assert.equal(zoningDownload.status, 200)
  const zoningText = await extractText(Buffer.from(await zoningDownload.arrayBuffer()))
  assert.match(zoningText, /Zoning \/ Locational Clearance/)
  assert.match(zoningText, /DEMO ONLY — NOT AN OFFICIAL MUNICIPAL DOCUMENT/)
  assert.match(zoningText, /Paper Lantern Reading Room/)
  assert.match(zoningText, /25 Example Avenue/)
  assert.match(zoningText, /Operate a community reading room/)
  assert.equal((await zoningCertificate(other)).status, 404)
  assert.equal((await zoningCertificate(staff)).status, 403)
  assert.deepEqual(await (await request('/receipts/' + zoningPayment.referenceId)).json(),
    { referenceId: zoningPayment.referenceId, hash: zoningHash, amount: '1000000000000000', chainId: 97, contract })
})
