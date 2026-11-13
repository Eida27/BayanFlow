import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { checklist, clearanceChecklist, extractText, reviewDocuments, validateFindings } from '../backend/review.js'
import { decisionAllowed } from '../backend/workflow.js'

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
