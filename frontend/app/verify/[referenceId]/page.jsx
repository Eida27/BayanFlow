'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'
import { services } from '../../../../services.js'
import { Header, Footer, explorer } from '../../shared'

const manilaDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })

export default function VerifyDocument({ params }) {
  const { referenceId } = use(params)
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    async function lookup() {
      try {
        const response = await fetch('/api/verify/' + encodeURIComponent(referenceId), {
          cache: 'no-store', credentials: 'omit', signal: controller.signal,
        })
        if (response.status === 404) {
          if (!controller.signal.aborted) setResult({ missing: true })
          return
        }
        if (!response.ok) throw new Error('Verification unavailable')
        const record = await response.json()
        if (!controller.signal.aborted) setResult({ record })
      } catch {
        if (!controller.signal.aborted) setResult({ unavailable: true })
      }
    }
    lookup()
    return () => controller.abort()
  }, [referenceId, attempt])

  const record = result?.record
  return <div className="resident-site">
    <a className="resident-skip" href="#resident-main">Skip to main content</a>
    <Header />
    <main className="shell main receipt" id="resident-main" tabIndex={-1}>
      <h1>Verify a demo document</h1>
      <section className="panel receipt-panel stack">
        {record && <>
          <div className="resident-receipt-amount">
            <h2>Verified demo document</h2>
            <p>Payment previously confirmed on BSC Testnet · Chain {record.chainId}</p>
            <p className="receipt-amount">{formatEther(BigInt(record.amount))} tBNB</p>
          </div>
          <p>Compare the verification ID, service, and issue date with the document.</p>
          <dl>
            <dt>Verification ID</dt><dd>{record.referenceId}</dd>
            <dt>Service</dt><dd>{services[record.service].label}</dd>
            <dt>Issued on</dt><dd>{manilaDate.format(new Date(record.issuedAt))}</dd>
            <dt>Transaction</dt>
            <dd><a href={explorer + record.hash} target="_blank" rel="noreferrer">View on BscScan Testnet ↗</a></dd>
            <dd>{record.hash}</dd>
            <dt>Payment contract</dt><dd>{record.contract}</dd>
          </dl>
        </>}
        {result?.missing && <p role="status">No issued demo document was found for this verification ID.</p>}
        {result?.unavailable && <div className="stack">
          <p className="error" role="alert">Verification is temporarily unavailable.</p>
          <button className="button secondary" onClick={() => setAttempt(attempt + 1)}>Retry</button>
        </div>}
        {!result && <p role="status">Checking document…</p>}
        <Link className="button secondary" href="/">Return to BayanFlow</Link>
      </section>
    </main>
    <Footer />
  </div>
}
