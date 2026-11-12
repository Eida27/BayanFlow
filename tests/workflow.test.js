import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { checklist, extractText, validateFindings } from '../api/review.js'
import { decisionAllowed } from '../api/workflow.js'

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
  const sample = name => readFile(new URL(`../public/samples/${name}.pdf`, import.meta.url)).then(extractText)
  assert.match(await sample('business-profile'), /Paper Lantern/)
  assert.match(await sample('owner-authorization'), /authorizes/)
  assert.match(await sample('premises-declaration'), /Intended use: Stationery retail/)
  assert.doesNotMatch(await sample('incomplete-premises-declaration'), /Intended use:/)
  await assert.rejects(extractText(Buffer.from('not a pdf')))
})
