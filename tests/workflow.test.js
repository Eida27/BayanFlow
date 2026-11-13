import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { checklist, clearanceChecklist, extractText, reviewDocuments, validateFindings, zoningChecklist } from '../backend/review.js'
import { decisionAllowed } from '../backend/workflow.js'

test('zoning reports absent PDFs without calling AI', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected AI call') })
  const requirements = [{ requirement: 'zoning_site', description: 'Check the site.' }]
  const result = await reviewDocuments({}, { OPENAI_API_KEY: 'test' }, { requirements, allowPartial: true })
  assert.deepEqual(result.findings.map(({ requirement, status }) => [requirement, status]), [['zoning_site', 'missing']])
  assert.equal(fetch.mock.callCount(), 0)
})

test('zoning merges AI findings with absent and unreadable PDFs', async t => {
  const site = await readFile(new URL('../frontend/public/samples/zoning-site-incomplete.pdf', import.meta.url))
  const files = { zoning_site: { buffer: site }, zoning_use: { buffer: Buffer.from('%PDF-invalid') } }
  const finding = { requirement: 'zoning_site', status: 'missing', explanation: 'The lot area is missing.', excerpt: 'Parcel reference: DT-042' }
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    choices: [{ message: { content: JSON.stringify({ findings: [finding] }) } }]
  }))
  const options = { requirements: zoningChecklist, allowPartial: true }
  const env = { OPENAI_API_KEY: 'test' }
  const result = await reviewDocuments(files, env, options)
  assert.deepEqual(result.findings.map(({ status }) => status), ['missing', 'unclear', 'missing'])
  assert.deepEqual(result.findings[0], finding)
  const [, request] = mock.mock.calls[0].arguments
  const payload = JSON.parse(JSON.parse(request.body).messages[1].content)
  assert.deepEqual(Object.keys(payload.documents), ['zoning_site'])
  assert.deepEqual(payload.checklist, [zoningChecklist[0]])

  finding.excerpt = 'Not in the PDF'
  const fallback = await reviewDocuments(files, env, options)
  assert.match(fallback.error, /could not finish/)
  assert.deepEqual(fallback.findings.map(({ requirement }) => requirement), ['zoning_use', 'zoning_ownership'])
})

test('staff can decide only a submitted application', () => {
  assert.ok(decisionAllowed('submitted', 'needs_correction'))
  assert.ok(decisionAllowed('submitted', 'approved'))
  assert.ok(decisionAllowed('submitted', 'rejected'))
  assert.equal(decisionAllowed('submitted', 'paid'), false)
  assert.equal(decisionAllowed('paid', 'approved'), false)
})

test('requires exactly one grounded result per checklist item', () => {
  const docs = Object.fromEntries(checklist.map(item => [item.requirement, 'A sample excerpt.']))
  const findings = checklist.map(item => ({
    requirement: item.requirement, status: 'present', explanation: 'Included.', excerpt: 'sample excerpt'
  }))
  assert.deepEqual(validateFindings(findings, docs), findings)
  assert.throws(() => validateFindings([findings[0], findings[0], findings[2]], docs))
  assert.throws(() => validateFindings([{...findings[0], excerpt: 'invented'}, ...findings.slice(1)], docs))
})

test('bundled PDFs distinguish complete and incomplete premises declarations', async () => {
  const sample = name => readFile(new URL(`../frontend/public/samples/${name}.pdf`, import.meta.url)).then(extractText)
  assert.match(await sample('business-profile'), /Paper Lantern/)
  assert.match(await sample('owner-authorization'), /authorizes/)
  assert.match(await sample('premises-declaration'), /Intended use: Stationery retail/)
  assert.doesNotMatch(await sample('incomplete-premises-declaration'), /Intended use:/)
  await assert.rejects(extractText(Buffer.from('not a pdf')))
})
test('clearance findings require an excerpt from the supporting PDF', () => {
  const finding = { requirement: 'supporting', status: 'present', explanation: 'The PDF supports the stated purpose.', excerpt: 'Alex Sample' }
  assert.deepEqual(validateFindings([finding], { supporting: 'Applicant: Alex Sample' }, clearanceChecklist), [finding])
  assert.throws(() => validateFindings([{ ...finding, excerpt: 'Someone else' }], { supporting: 'Applicant: Alex Sample' }, clearanceChecklist))
})

test('clearance review sends applicant context and returns grounded findings', async t => {
  const applicant = { name: 'Alex Sample', purpose: 'Volunteer application for the Demo Town Reading Program' }
  const buffer = await readFile(new URL('../frontend/public/samples/clearance-supporting.pdf', import.meta.url))
  const finding = { requirement: 'supporting', status: 'present', explanation: 'The acknowledgment names the applicant and program.', excerpt: applicant.purpose }
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    choices: [{ message: { content: JSON.stringify({ findings: [finding] }) } }]
  }))
  const result = await reviewDocuments({ supporting: { buffer } }, { OPENAI_API_KEY: 'test' },
    { requirements: clearanceChecklist, applicant })
  assert.deepEqual(result, { findings: [finding], error: null })
  const [, options] = mock.mock.calls[0].arguments
  assert.deepEqual(JSON.parse(JSON.parse(options.body).messages[1].content).applicant, applicant)
})
