import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { createApp } from '../backend/app.js'
import { createPool } from '../backend/database.js'
import { extractText, reviewDocuments } from '../backend/review.js'

test('municipal applications from submission through retried receipt confirmation', async t => {
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
  const preTricycle = setup.split('\nALTER TABLE applications ADD COLUMN IF NOT EXISTS vehicle_identifier')[0]
  await db.query(preTricycle.slice(0, preTricycle.lastIndexOf('\nDO $$')))
  await db.query("ALTER TABLE applications ADD CONSTRAINT applications_service_check CHECK (service IN ('business_permit', 'mayors_clearance'))")
  const legacyClearanceId = randomUUID()
  await db.query("INSERT INTO applications (id, resident_id, title, status, service) SELECT $1, id, 'Legacy clearance', 'submitted', 'mayors_clearance' FROM accounts WHERE email='other'", [legacyClearanceId])
  await db.query("INSERT INTO documents VALUES ($1, 1, 'supporting', $2)", [legacyClearanceId, legacyPdf])
  await db.query(preTricycle)
  await db.query(setup)
  await db.query(setup)
  const hash = `0x${'33'.repeat(32)}`
  const clearanceHash = `0x${'55'.repeat(32)}`
  const zoningHash = `0x${'88'.repeat(32)}`
  const tricycleHash = `0x${'99'.repeat(32)}`
  const payer = `0x${'11'.repeat(20)}`
  const contract = `0x${'22'.repeat(20)}`
  let verifications = 0
  let reviewSucceeds = false
  const app = createApp({ pool: db, env: {}, review: (files, env, options) => reviewSucceeds
    ? { findings: options.requirements.map(({ requirement }) => ({ requirement, status: 'present' })), error: null }
    : reviewDocuments(files, env, options), gateway: {
    contract,
    currentBlock: async () => 1n,
    authorize: async payment => ({ referenceId: payment.reference_id }),
    verify: async (_payment, candidate) => {
      verifications++
      return [clearanceHash, zoningHash, tricycleHash, hash].includes(candidate) ? candidate : !candidate ? hash : null
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
  assert.equal((await request('/staff/notifications')).status, 401)
  assert.equal((await request('/staff/notifications', { cookie: resident })).status, 403)
  assert.deepEqual(await (await request('/staff/notifications', { cookie: staff })).json(),
    { items: [], nextCursor: null, unreadCount: 0 })
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

  const sample = name => readFile(new URL(`../frontend/public/samples/${name}.pdf`, import.meta.url))
  const [operatorPdf, vehiclePdf, mismatchPdf] = await Promise.all(['tricycle-operator', 'tricycle-vehicle', 'tricycle-vehicle-mismatch'].map(sample))
  const tricycleForm = (identifier = 'DEMO-TRI-042', operator = true, vehicle = mismatchPdf) => {
    const body = new FormData()
    body.set('service', 'tricycle_permit')
    body.set('title', ' Alex Sample ')
    body.set('vehicle_identifier', identifier)
    body.set('purpose', 'Market Loop')
    body.set('tricycle_vehicle', new Blob([vehicle]), 'vehicle.pdf')
    if (operator) body.set('tricycle_operator', new Blob([operatorPdf]), 'operator.pdf')
    return body
  }
  assert.equal((await submitZoning(tricycleForm(' '))).status, 400)
  assert.equal((await submitZoning(tricycleForm('x'.repeat(41)))).status, 400)
  assert.equal((await submitZoning(tricycleForm('DEMO-TRI-042', false))).status, 400)
  assert.equal((await submitZoning(tricycleForm('DEMO-TRI-042', true, 'bad file'))).status, 400)
  const tricycle = await submitZoning(tricycleForm(' DEMO-TRI-042 '))
  assert.equal(tricycle.status, 201)
  const { id: tricycleId } = await tricycle.json()
  assert.equal((await current(tricycleId, staff)).vehicle_identifier, 'DEMO-TRI-042')
  assert.match((await current(tricycleId, staff)).ai_error, /manually/)
  const tricyclePath = applicationsPath + '/' + tricycleId
  assert.equal((await review(tricyclePath, 'needs_correction', 1)).status, 200)
  const fixed = tricycleForm('DEMO-TRI-042', true, vehiclePdf)
  reviewSucceeds = true
  assert.equal((await request(tricyclePath + '/revision', { cookie: resident, body: fixed })).status, 200)
  reviewSucceeds = false
  const oldVehicle = await request(tricyclePath + '/documents/tricycle_vehicle?revision=1', { cookie: staff })
  assert.equal(oldVehicle.status, 200)
  assert.match(await oldVehicle.text(), /DEMO-TRI-099/)
  assert.equal((await review(tricyclePath, 'approved', 2)).status, 200)
  const permit = cookie => request(tricyclePath + '/certificate', { cookie })
  assert.equal((await permit(resident)).status, 404)
  assert.equal((await request(tricyclePath + '/authorize', { cookie: resident, body: { payer } })).status, 200)
  const confirmTricycle = () => request(tricyclePath + '/confirm', { cookie: resident, body: { hash: tricycleHash } })
  const paidTricycle = await confirmTricycle()
  assert.equal(paidTricycle.status, 200)
  const tricyclePayment = await paidTricycle.json()
  assert.deepEqual(await (await confirmTricycle()).json(), tricyclePayment)
  await t.test('staff notification read state, preferences and pagination are account scoped', async () => {
    const { hashPassword } = await import('../backend/auth.js')
    await db.query("INSERT INTO accounts (email,password_hash,role) VALUES ('second-staff',$1,'staff')", [hashPassword('demo')])
    const second = await login('second-staff')
    const path = '/staff/notifications'
    const preferencesPath = '/staff/preferences'
    const feed = async (cookie = staff, query = '') => (await request(path + query, { cookie })).json()
    const post = async (url, body, cookie = staff) => request(url, { cookie, body })
    assert.equal((await request(preferencesPath, { cookie: resident })).status, 403)
    assert.equal((await post(path + '/read-all', { through: '1' }, resident)).status, 403)
    const initial = await feed()
    const tricycleEvents = initial.items.filter(item => item.application_id === tricycleId)
    assert.deepEqual(tricycleEvents.map(({ kind, manual_review }) => [kind, manual_review]),
      [['payment', false], ['resubmission', false], ['submission', true]])
    await db.query("ALTER TABLE staff_notifications ADD CHECK (title <> 'Rollback fixture')")
    const rejected = tricycleForm('DEMO-TRI-042', true, vehiclePdf)
    rejected.set('title', 'Rollback fixture')
    assert.equal((await submitZoning(rejected)).status, 500)
    assert.equal((await db.query("SELECT id FROM applications WHERE title = 'Rollback fixture'")).rowCount, 0)
    assert.deepEqual(await feed(), initial)
    const payment = tricycleEvents[0]
    assert.equal((await post(path + '/' + payment.id + '/read', {})).status, 200)
    assert.equal((await feed()).items.find(item => item.id === payment.id).read, true)
    assert.equal((await feed(second)).items.find(item => item.id === payment.id).read, false)

    const preferences = { submission: true, resubmission: true, payment: false }
    const hidden = await (await post(preferencesPath, { preferences })).json()
    assert.deepEqual(hidden.preferences, preferences)
    assert.equal((await feed()).items.some(item => item.kind === 'payment'), false)
    assert.equal((await feed()).unreadCount, hidden.unreadCount)
    assert.deepEqual((await (await request(preferencesPath, { cookie: second })).json()).preferences,
      { ...preferences, payment: true })
    await post(preferencesPath, { preferences: { ...preferences, payment: true } })
    assert.equal((await feed()).items.find(item => item.id === payment.id).read, true)

    const cutoff = initial.items[0].id
    await db.query(`
      INSERT INTO staff_notifications (application_id, kind, revision, title, service, manual_review)
      SELECT $1, 'resubmission', revision, 'Pagination fixture', 'tricycle_permit', false
      FROM generate_series(100, 125) revision
    `, [tricycleId])
    const marked = await (await post(path + '/read-all', { through: cutoff })).json()
    assert.equal(marked.unreadCount, 26)
    const first = await feed()
    assert.equal(first.items.length, 25)
    const next = await feed(staff, '?before=' + first.nextCursor)
    assert.ok(next.items.every(item => BigInt(item.id) < BigInt(first.nextCursor)))
    assert.equal(next.items.filter(item => !item.read).length, 1)
    assert.equal((await feed(second)).unreadCount, initial.unreadCount + 26)
  })
  const permitDownload = await permit(resident)
  assert.equal(permitDownload.status, 200)
  assert.match(permitDownload.headers.get('content-disposition'), /bayanflow-demo-tricycle-permit\.pdf/)
  const permitText = await extractText(Buffer.from(await permitDownload.arrayBuffer()))
  for (const expected of ['Tricycle Operator’s Permit', 'Alex Sample', 'DEMO-TRI-042', 'Market Loop', tricycleId,
    'DEMO ONLY — NOT AN OFFICIAL MUNICIPAL DOCUMENT', 'Testnet payment confirmed']) assert.ok(permitText.includes(expected), expected)
  assert.equal((await permit(other)).status, 404)
  assert.equal((await permit(staff)).status, 403)
  assert.deepEqual(await (await request('/receipts/' + tricyclePayment.referenceId)).json(),
    { referenceId: tricyclePayment.referenceId, hash: tricycleHash, amount: '1000000000000000', chainId: 97, contract })

  await t.test('staff reports filter each event by Manila date and export the same totals', async () => {
    const fixtures = [
      ['2020-12-31T15:59:59Z', 'business_permit'],
      ['2020-12-31T16:00:00Z', 'zoning_clearance'],
      ['2021-01-01T15:59:59Z', 'business_permit'],
      ['2021-01-01T16:00:00Z', 'business_permit'],
    ]
    const ids = []
    for (const [createdAt, service] of fixtures) {
      const fixtureId = randomUUID()
      ids.push(fixtureId)
      await db.query(
        "INSERT INTO applications (id,resident_id,title,status,created_at,service) SELECT $1,id,'Private fixture name','submitted',$2,$3 FROM accounts WHERE email='resident'",
        [fixtureId, createdAt, service])
    }
    for (const [application, revision, date] of [
      [ids[0], 1, '2020-12-31T16:59:59Z'],
      [ids[0], 2, '2020-12-31T17:00:00Z'],
      [ids[1], 1, '2020-12-31T15:59:59Z'],
      [ids[1], 2, '2020-12-31T17:00:00Z'],
      [ids[2], 1, '2021-01-01T15:59:59Z'],
    ]) {
      await db.query(
        "INSERT INTO decisions (application_id,revision,reviewer_id,status,note,decided_at) SELECT $1,$2,id,'needs_correction','Private note',$3 FROM accounts WHERE email='staff'",
        [application, revision, date])
    }
    for (const [index, wei, tx, date] of [
      [0, '10000000000000000001', 'fixture-a', '2020-12-31T16:00:00Z'],
      [1, '20000000000000000002', 'fixture-b', '2021-01-01T15:59:59Z'],
      [2, '90000000000000000000', null, '2020-12-31T18:00:00Z'],
      [3, '90000000000000000000', 'fixture-c', null],
    ]) {
      await db.query('INSERT INTO payments (application_id,reference_id,amount,tx_hash,confirmed_at) VALUES ($1,$2,$3,$4,$5)',
        [ids[index], 'fixture-' + index, wei, tx, date])
    }
    const query = '?from=2021-01-01&to=2021-01-01'
    const reports = '/staff/reports'
    for (const path of [reports, reports + '/pdf']) {
      assert.equal((await request(path + query)).status, 401)
      assert.equal((await request(path + query, { cookie: resident })).status, 403)
      assert.equal((await request(path + '?from=2021-02-29&to=2021-03-01', { cookie: staff })).status, 400)
    }
    const response = await request(reports + query, { cookie: staff })
    assert.equal(response.status, 200, await response.clone().text())
    const report = await response.json()
    assert.equal(report.submitted, 2)
    assert.deepEqual(report.trend, [{ period: '2021-01-01', count: 2 }])
    assert.deepEqual(report.services.map(({ count }) => count), [1, 0, 1, 0])
    assert.equal(report.firstDecisions, 2)
    assert.equal(report.medianSeconds, 1800)
    assert.equal(report.confirmedPayments, 2)
    assert.equal(report.totalBnb, '30.000000000000000003')

    const pdf = await request(reports + '/pdf' + query, { cookie: staff })
    assert.equal(pdf.status, 200)
    assert.match(pdf.headers.get('content-disposition'), /bayanflow-report-2021-01-01-2021-01-01\.pdf/)
    const pdfText = await extractText(Buffer.from(await pdf.arrayBuffer()))
    for (const expected of ['2021-01-01', 'Applications submitted: 2', 'Median time to first decision: 30 min',
      'Confirmed payments: 2', '30.000000000000000003 BSC Testnet BNB']) assert.ok(pdfText.includes(expected), expected)
    assert.doesNotMatch(pdfText, /Private fixture name|Private note/)

    const empty = await (await request(reports + '?from=2018-01-01&to=2018-04-01', { cookie: staff })).json()
    assert.equal(empty.bucket, 'month')
    assert.equal(empty.medianSeconds, null)
    assert.equal(empty.totalBnb, '0')
    assert.deepEqual(empty.trend, ['2018-01', '2018-02', '2018-03', '2018-04'].map(period => ({ period, count: 0 })))

    const longPdf = await request(reports + '/pdf?from=2018-01-01&to=2018-03-31', { cookie: staff })
    assert.equal(longPdf.status, 200)
    const longText = await extractText(Buffer.from(await longPdf.arrayBuffer()))
    assert.ok(longText.includes('2018-03-31'))
    assert.ok(longText.split('Daily submissions').length > 2)
  })
})
