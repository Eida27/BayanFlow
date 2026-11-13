import express from 'express'
import multer from 'multer'
import { randomBytes, randomUUID } from 'node:crypto'
import { getAddress, isAddress } from 'viem'
import { digest, passwordMatches } from './auth.js'
import { transaction } from './database.js'
import { checklist, clearanceChecklist, reviewDocuments, tricycleChecklist, zoningChecklist } from './review.js'
import { clearanceCertificate } from './certificate.js'
import { BUSINESS_PERMIT, MAYORS_CLEARANCE, TRICYCLE_PERMIT, ZONING_CLEARANCE, services } from '../services.js'
import { amount } from './payment.js'
import { decisionAllowed } from './workflow.js'

const fileFields = Object.values(services).flatMap(service => service.documents.map(([name]) => ({ name, maxCount: 1 })))
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 3, fileSize: 5 * 1024 * 1024 + 1, fields: 5, fieldSize: 4096 }
}).fields(fileFields)
const sessionName = 'bayanflow_session'
const sessionOptions = { httpOnly: true, sameSite: 'strict', path: '/' }
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const hex32 = /^0x[0-9a-f]{64}$/i
const checklists = {
  [BUSINESS_PERMIT]: checklist,
  [MAYORS_CLEARANCE]: clearanceChecklist,
  [ZONING_CLEARANCE]: zoningChecklist,
  [TRICYCLE_PERMIT]: tricycleChecklist,
}
const certificateFiles = {
  [MAYORS_CLEARANCE]: 'bayanflow-demo-clearance.pdf',
  [ZONING_CLEARANCE]: 'bayanflow-demo-zoning-clearance.pdf',
  [TRICYCLE_PERMIT]: 'bayanflow-demo-tricycle-permit.pdf',
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status })
}

function requiredText(value, label, limit) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || trimmed.length > limit || trimmed.includes('\0')) {
    fail(400, `Enter ${label} of up to ${limit} characters.`)
  }
  return trimmed
}

function role(req, expected) {
  if (!req.user) fail(401, 'Sign in to continue.')
  if (expected && req.user.role !== expected) fail(403, 'Your account cannot perform this action.')
}

async function ownedApplication(db, req, lock = false) {
  if (!uuid.test(req.params.id)) fail(404, 'Application not found.')
  const { rows: [application] } = await db.query(
    `SELECT * FROM applications WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [req.params.id])
  if (!application || (req.user.role === 'resident' && application.resident_id !== req.user.id)) {
    fail(404, 'Application not found.')
  }
  return application
}

export function createApp({ pool, gateway, env = process.env, review = reviewDocuments }) {
  const app = express()
  app.disable('x-powered-by')
  const api = express.Router()
  app.use('/api', api)
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    res.set('X-Content-Type-Options', 'nosniff')
    const origins = new Set([env.WEB_ORIGIN || 'http://localhost:3000'])
    if (!env.WEB_ORIGIN) origins.add('http://127.0.0.1:3000')
    if (req.method !== 'GET' && req.headers.origin && !origins.has(req.headers.origin)) {
      fail(403, 'Request origin is not allowed.')
    }
    next()
  })
  api.use(express.json({ limit: '16kb' }))
  api.use(async (req, _res, next) => {
    const token = req.headers.cookie?.match(/(?:^|;\s*)bayanflow_session=([a-f0-9]{64})(?:;|$)/)?.[1]
    if (token) {
      const { rows: [user] } = await pool.query(
        `SELECT a.id, a.email, a.role FROM accounts a JOIN sessions s ON a.id = s.account_id
         WHERE s.digest = $1 AND s.expires_at > now()`, [digest(token)])
      req.user = user
      req.sessionDigest = digest(token)
    }
    next()
  })

  api.get('/me', (req, res) => res.json({ user: req.user ?? null }))
  api.post('/login', async (req, res) => {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) {
      fail(400, 'Enter an email and password.')
    }
    const { rows: [account] } = await pool.query(
      'SELECT id, email, role, password_hash FROM accounts WHERE email = $1', [email.trim().toLowerCase()])
    if (!account || !passwordMatches(password, account.password_hash)) fail(401, 'Email or password is incorrect.')
    const token = randomBytes(32).toString('hex')
    await transaction(pool, async db => {
      await db.query('DELETE FROM sessions WHERE expires_at <= now() OR digest = $1', [req.sessionDigest ?? null])
      await db.query("INSERT INTO sessions VALUES ($1, $2, now() + interval '8 hours')", [digest(token), account.id])
    })
    res.cookie(sessionName, token, { ...sessionOptions, maxAge: 8 * 60 * 60 * 1000 })
    res.json({ user: { id: account.id, email: account.email, role: account.role } })
  })
  api.post('/logout', async (req, res) => {
    if (req.sessionDigest) await pool.query('DELETE FROM sessions WHERE digest = $1', [req.sessionDigest])
    res.clearCookie(sessionName, sessionOptions).json({ ok: true })
  })

  api.get('/applications', async (req, res) => {
    role(req)
    const { rows } = await pool.query(
      `SELECT a.id, a.title, a.service, a.address, a.purpose, a.vehicle_identifier, a.status, a.revision, a.findings, a.ai_error, a.decision_note, a.created_at,
              p.payer, p.tx_hash, CASE WHEN a.status = 'paid' THEN p.reference_id END AS receipt_ref,
              ARRAY(SELECT d.requirement FROM documents d WHERE d.application_id = a.id AND d.revision = a.revision) AS uploaded_documents
         FROM applications a LEFT JOIN payments p ON p.application_id = a.id
        WHERE ($1::integer IS NULL OR a.resident_id = $1) ORDER BY a.created_at DESC`,
      [req.user.role === 'resident' ? req.user.id : null])
    res.json({ applications: rows })
  })

  const residentOnly = (req, _res, next) => { role(req, 'resident'); next() }

  async function submit(req, res) {
    const previous = req.params.id ? await ownedApplication(pool, req) : null
    if (previous && previous.status !== 'needs_correction') {
      fail(409, 'This application is not open for corrections.')
    }
    const body = req.body ?? {}
    const service = previous?.service ?? body.service ?? BUSINESS_PERMIT
    if (typeof service !== 'string' || !Object.hasOwn(services, service) ||
        (previous && body.service !== undefined && body.service !== service)) fail(400, 'Choose a valid municipal service.')
    const clearance = service === MAYORS_CLEARANCE
    const zoning = service === ZONING_CLEARANCE
    const tricycle = service === TRICYCLE_PERMIT
    const title = requiredText(body.title, tricycle ? 'an operator name' : zoning ? 'an applicant or project name' : clearance ? 'a full name' : 'a business name', 120)
    const address = zoning || clearance ? requiredText(body.address, zoning ? 'a site address' : 'an address', 240) : null
    const purpose = service !== BUSINESS_PERMIT
      ? requiredText(body.purpose, tricycle ? 'a proposed route or zone' : zoning ? 'a proposed use' : 'a purpose', 500)
      : null
    const vehicleIdentifier = tricycle ? requiredText(body.vehicle_identifier, 'a fictional plate or unit ID', 40) : null
    const requirements = checklists[service]
    const names = requirements.map(item => item.requirement)
    const files = Object.fromEntries(Object.entries(req.files ?? {}).map(([name, [file]]) => [name, file]))
    if (Object.entries(files).some(([name, file]) => !names.includes(name) || !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))) {
      fail(400, 'Attach only PDFs for this service.')
    }
    if (!zoning && Object.keys(files).length !== names.length) fail(400, 'Attach a PDF for each fictional requirement.')
    const applicant = tricycle ? { name: title, vehicleIdentifier, purpose }
      : zoning ? { name: title, address, purpose } : clearance ? { name: title, purpose } : undefined
    const result = await review(files, env, { requirements, applicant, allowPartial: zoning })
    const id = previous?.id ?? randomUUID()
    await transaction(pool, async db => {
      let number = 1
      if (previous) {
        const current = await ownedApplication(db, req, true)
        if (current.status !== 'needs_correction' || current.revision !== previous.revision) {
          fail(409, 'This application is no longer open for these corrections.')
        }
        number = current.revision + 1
        await db.query(
          `UPDATE applications SET title=$2, status='submitted', revision=$3, findings=$4, ai_error=$5,
           decision_note=NULL, address=$6, purpose=$7, vehicle_identifier=$8 WHERE id=$1`,
          [id, title, number, JSON.stringify(result.findings), result.error, address, purpose, vehicleIdentifier])
      } else {
        await db.query(
          `INSERT INTO applications (id,resident_id,title,status,findings,ai_error,service,address,purpose,vehicle_identifier)
           VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7,$8,$9)`,
          [id, req.user.id, title, JSON.stringify(result.findings), result.error, service, address, purpose, vehicleIdentifier])
      }
      for (const [name, file] of Object.entries(files)) {
        await db.query('INSERT INTO documents VALUES ($1,$2,$3,$4)', [id, number, name, file.buffer])
      }
    })
    res.status(previous ? 200 : 201).json({ id })
  }

  api.post('/applications', residentOnly, upload, submit)
  api.post('/applications/:id/revision', residentOnly, upload, submit)
  api.get('/applications/:id/certificate', async (req, res) => {
    role(req, 'resident')
    const application = await ownedApplication(pool, req)
    const filename = certificateFiles[application.service]
    if (!filename || application.status !== 'paid') fail(404, 'Certificate not found.')
    const { rows: [payment] } = await pool.query(
      'SELECT confirmed_at FROM payments WHERE application_id=$1 AND tx_hash IS NOT NULL AND confirmed_at IS NOT NULL',
      [application.id])
    if (!payment) fail(404, 'Certificate not found.')
    const pdf = await clearanceCertificate(application, payment)
    res.attachment(filename).send(pdf)
  })
  api.get('/applications/:id/documents/:requirement', async (req, res) => {
    role(req)
    const application = await ownedApplication(pool, req)
    const revision = req.query.revision === undefined ? application.revision : Number(req.query.revision)
    if (!Number.isSafeInteger(revision) || revision < 1 || revision > application.revision) {
      fail(404, 'Document not found.')
    }
    const { rows: [document] } = await pool.query(
      'SELECT pdf FROM documents WHERE application_id=$1 AND revision=$2 AND requirement=$3',
      [application.id, revision, req.params.requirement])
    if (!document) fail(404, 'Document not found.')
    res.attachment(`${req.params.requirement}.pdf`).send(document.pdf)
  })
  api.post('/applications/:id/decision', async (req, res) => {
    role(req, 'staff')
    const { status, note, revision } = req.body ?? {}
    if (typeof note !== 'string' || !note.trim() || note.length > 1000) fail(400, 'Enter a decision note of up to 1000 characters.')
    if (!decisionAllowed('submitted', status)) fail(400, 'Choose a valid staff decision.')
    if (!Number.isSafeInteger(revision) || revision < 1) fail(400, 'A submission revision is required.')
    await transaction(pool, async db => {
      const application = await ownedApplication(db, req, true)
      if (application.revision !== revision) fail(409, 'A new revision is available. Refresh the application before reviewing it.')
      if (!decisionAllowed(application.status, status)) fail(409, 'This application has already been reviewed.')
      if (status === 'approved' && application.service === ZONING_CLEARANCE) {
        const { rowCount } = await db.query(
          'SELECT requirement FROM documents WHERE application_id=$1 AND revision=$2 AND requirement=ANY($3::text[])',
          [application.id, revision, zoningChecklist.map(item => item.requirement)])
        if (rowCount !== zoningChecklist.length) fail(409, 'All three zoning PDFs must be attached before approval.')
      }
      await db.query(
        'INSERT INTO decisions (application_id,revision,reviewer_id,status,note) VALUES ($1,$2,$3,$4,$5)',
        [application.id, application.revision, req.user.id, status, note.trim()])
      await db.query('UPDATE applications SET status=$2, decision_note=$3 WHERE id=$1', [application.id, status, note.trim()])
      if (status === 'approved') {
        await db.query('INSERT INTO payments (application_id,reference_id,amount) VALUES ($1,$2,$3)',
          [application.id, `0x${randomBytes(32).toString('hex')}`, amount.toString()])
      }
    })
    res.json({ ok: true })
  })

  api.post('/applications/:id/authorize', async (req, res) => {
    role(req, 'resident')
    const application = await ownedApplication(pool, req)
    if (application.status !== 'approved') fail(409, 'The application is not ready for payment.')
    const payer = req.body?.payer
    if (typeof payer !== 'string' || !isAddress(payer)) fail(400, 'Connect a valid wallet.')
    if (!gateway) fail(503, 'BSC Testnet payments are not configured.')
    const block = await gateway.currentBlock()
    const payment = await transaction(pool, async db => {
      const current = await ownedApplication(db, req, true)
      if (current.status !== 'approved') fail(409, 'The application is not ready for payment.')
      const { rows: [row] } = await db.query(
        `UPDATE payments SET payer=$2, contract=$3, authorization_block=COALESCE(authorization_block,$4)
          WHERE application_id=$1 AND (payer IS NULL OR payer=$2) AND (contract IS NULL OR contract=$3)
          RETURNING *`, [current.id, getAddress(payer), gateway.contract, block.toString()])
      if (!row) fail(409, 'Use the wallet already connected to this payment.')
      return row
    })
    res.json(await gateway.authorize(payment))
  })

  api.post('/applications/:id/confirm', async (req, res) => {
    role(req, 'resident')
    const application = await ownedApplication(pool, req)
    const { rows: [payment] } = await pool.query('SELECT * FROM payments WHERE application_id=$1', [application.id])
    if (payment?.tx_hash) return res.json({ referenceId: payment.reference_id, hash: payment.tx_hash })
    const hash = req.body?.hash
    if (hash !== undefined && (typeof hash !== 'string' || !hex32.test(hash))) fail(400, 'Enter a valid transaction hash.')
    if (application.status !== 'approved' || !payment?.payer) fail(409, 'Authorize a wallet before confirming payment.')
    if (!gateway || gateway.contract !== payment.contract) fail(503, 'The payment contract is unavailable.')
    const verifiedHash = await gateway.verify(payment, hash)
    if (!verifiedHash) fail(409, 'A matching confirmed payment has not been found yet.')
    const storedHash = await transaction(pool, async db => {
      const current = await ownedApplication(db, req, true)
      if (current.status === 'paid') {
        const { rows: [stored] } = await db.query('SELECT tx_hash FROM payments WHERE application_id=$1', [current.id])
        return stored.tx_hash
      }
      if (current.status !== 'approved') fail(409, 'The application is not ready for payment.')
      await db.query('UPDATE payments SET tx_hash=$2, confirmed_at=now() WHERE application_id=$1', [current.id, verifiedHash])
      await db.query("UPDATE applications SET status='paid' WHERE id=$1", [current.id])
      return verifiedHash
    })
    res.json({ referenceId: payment.reference_id, hash: storedHash })
  })

  api.get('/receipts/:referenceId', async (req, res) => {
    if (!hex32.test(req.params.referenceId)) fail(404, 'Receipt not found.')
    const { rows: [payment] } = await pool.query(
      'SELECT reference_id, amount, tx_hash, contract FROM payments WHERE reference_id=$1 AND tx_hash IS NOT NULL',
      [req.params.referenceId.toLowerCase()])
    if (!payment) fail(404, 'Receipt not found.')
    res.json({ referenceId: payment.reference_id, amount: payment.amount, hash: payment.tx_hash, chainId: 97, contract: payment.contract })
  })

  api.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))
  api.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Attach one PDF per requirement, up to 5 MB per file.' })
    }
    if (!error.status) console.error('BayanFlow API request failed:', error.name, error.code ?? '')
    res.status(error.status ?? 500).json({
      error: error.status >= 400 && error.status < 500 && !error.type ? error.message
        : error.status === 503 ? error.message : 'The request could not be completed. Please try again.'
    })
  })
  return app
}
