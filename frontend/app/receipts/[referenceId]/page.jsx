'use client'

import { useEffect, useState, use } from 'react'
import { formatEther } from 'viem'
import { api, Header, Footer, explorer } from '../../shared'

export default function Receipt({ params }) {
  const { referenceId } = use(params)
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setReceipt(null)
    setError('')
    api('/receipts/' + encodeURIComponent(referenceId))
      .then(result => { if (active) setReceipt(result) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [referenceId, attempt])

  return <div className="resident-site">
    <a className="resident-skip" href="#resident-main">Skip to main content</a>
    <Header />
    <main className="shell main receipt" id="resident-main" tabIndex={-1}>
      <span className="kicker">Public payment record</span>
      <h1>Payment receipt</h1>
      <section className="panel receipt-panel stack">
        {error ? <div><p className="error" role="alert">{error}</p>
          <button className="button secondary" onClick={() => setAttempt(attempt + 1)}>Retry</button>
        </div> : receipt ? <>
          <div className="resident-receipt-amount">
            <h2>Verified payment</h2>
            <p className="receipt-amount">{formatEther(BigInt(receipt.amount))} tBNB</p>
            <p>BNB Smart Chain Testnet · Chain {receipt.chainId}</p>
          </div>
          <dl><dt>Reference</dt><dd>{receipt.referenceId}</dd><dt>Transaction</dt><dd><a href={explorer + receipt.hash} target="_blank" rel="noreferrer">{receipt.hash} ↗</a></dd><dt>Payment contract</dt><dd>{receipt.contract}</dd></dl>
        </> : <p role="status">Loading receipt…</p>}
        <a className="button secondary" href="/">Return to BayanFlow</a>
      </section>
    </main>
    <Footer />
  </div>
}
