'use client'

import { useEffect, useState, use } from 'react'
import { formatEther } from 'viem'
import { api, Header, Footer, explorer } from '../../shared'

export default function Receipt({ params }) {
  const { referenceId } = use(params)
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/receipts/' + encodeURIComponent(referenceId)).then(setReceipt).catch(error => setError(error.message))
  }, [referenceId])

  return <>
    <Header />
    <main className="shell main receipt">
      <span className="kicker"><i /> PUBLIC PAYMENT RECORD</span>
      <h1>Payment receipt<span>.</span></h1>
      <section className="panel receipt-panel">
        {error ? <p className="error" role="alert">{error}</p> : receipt ? <>
          <h2>Verified payment</h2>
          <p className="receipt-amount">{formatEther(BigInt(receipt.amount))} tBNB</p>
          <dl><dt>Reference</dt><dd>{receipt.referenceId}</dd><dt>Transaction</dt><dd><a href={explorer + receipt.hash} target="_blank" rel="noreferrer">{receipt.hash} ↗</a></dd><dt>Network</dt><dd>BNB Smart Chain Testnet ({receipt.chainId})</dd><dt>Payment contract</dt><dd>{receipt.contract}</dd></dl>
        </> : <p role="status">Loading receipt…</p>}
        <a href="/">Return to BayanFlow</a>
      </section>
    </main>
    <Footer />
  </>
}
