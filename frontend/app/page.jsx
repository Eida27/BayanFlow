'use client'

import { useEffect, useState } from 'react'
import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { bscTestnet } from 'viem/chains'
import { api, Header, Footer, explorer } from './shared'
import { BUSINESS_PERMIT, TRICYCLE_PERMIT, ZONING_CLEARANCE, services } from '../../services.js'

const statuses = {
  submitted: 'Under review',
  needs_correction: 'Corrections requested',
  rejected: 'Rejected',
  approved: 'Approved for payment',
  paid: 'Paid',
}
const payAbi = [{
  type: 'function', name: 'pay', stateMutability: 'payable', outputs: [],
  inputs: [
    { name: 'referenceId', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
    { name: 'signature', type: 'bytes' },
  ],
}]
const paymentKey = id => `bayanflow-payment-${id}`
const testnet = createPublicClient({ chain: bscTestnet, transport: http() })

function SignIn({ signIn, busy }) {
  const [role, setRole] = useState('resident')
  return <div className="login-grid">
    <section className="intro">
      <span className="kicker"><i /> MUNICIPAL SERVICES</span>
      <h1>Municipal services<br />in one place<span>.</span></h1>
      <p>Apply for municipal permits and clearances, track staff review, and verify your testnet payment.</p>
      <ol className="journey">
        <li><b>01</b><span>Submit</span></li>
        <li><b>02</b><span>Review</span></li>
        <li><b>03</b><span>Pay &amp; verify</span></li>
      </ol>
    </section>
    <section className="panel login-panel">
      <h2>Sign in to BayanFlow</h2>
      <p>Choose a demo account to try the application workflow.</p>
      <div className="role-toggle" aria-label="Demo account">
        {['resident', 'staff'].map(value => <button type="button" key={value} aria-pressed={role === value} onClick={() => setRole(value)}>{value === 'resident' ? 'Resident' : 'Municipal staff'}</button>)}
      </div>
      <form key={role} className="stack" onSubmit={event => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        signIn({ email: data.get('email'), password: data.get('password') })
      }}>
        <label>Email address<input name="email" type="email" required autoComplete="username" defaultValue={`${role}@bayanflow.test`} /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" defaultValue={`${role}-demo`} /></label>
        <button className="button primary" disabled={busy}>Sign in <span aria-hidden="true">→</span></button>
      </form>
      <p className="notice">Use only the fictional sample documents. Payments use test BNB.</p>
    </section>
  </div>
}

function ApplicationForm({ application, service = application?.service ?? BUSINESS_PERMIT, submit, busy }) {
  const clearance = service !== BUSINESS_PERMIT
  const zoning = service === ZONING_CLEARANCE
  const tricycle = service === TRICYCLE_PERMIT
  const { documents } = services[service]
  return <form className="stack" onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (zoning) {
      for (const [name] of documents) if (!data.get(name)?.name) data.delete(name)
    }
    submit(data)
  }}>
    <input type="hidden" name="service" value={service} />
    <label>{tricycle ? 'Operator name' : zoning ? 'Applicant or project name' : clearance ? 'Full name' : 'Business name'}<input name="title" required maxLength={120} defaultValue={application?.title ?? ''} /></label>
    {clearance && <>
      {tricycle
        ? <label>Fictional plate or unit ID<input name="vehicle_identifier" required maxLength={40} defaultValue={application?.vehicle_identifier ?? ''} /></label>
        : <label>{zoning ? 'Site address' : 'Address'}<textarea name="address" rows="2" required maxLength={240} defaultValue={application?.address ?? ''} /></label>}
      <label>{tricycle ? 'Proposed route or zone' : zoning ? 'Proposed use' : 'Purpose of request'}<textarea name="purpose" rows="3" required maxLength={500} defaultValue={application?.purpose ?? ''} /></label>
    </>}
    {zoning && <p>{application ? 'Reattach every PDF you want included in this revision.' : 'You can submit with missing PDFs. Staff needs all three before approval.'}</p>}
    {documents.map(([name, label, sample, alternate, alternateLabel = 'Download incomplete sample']) => <div className="upload" key={name}>
      <label>{label}<input name={name} type="file" accept=".pdf,application/pdf" required={!zoning} /></label>
      <div className="document-links">
        <a href={'/samples/' + sample} download>Download sample</a>
        {alternate && <a href={'/samples/' + alternate} download>{alternateLabel}</a>}
      </div>
    </div>)}
    {!clearance && <a href="/samples/incomplete-premises-declaration.pdf" download>Download incomplete premises sample</a>}
    <button className="button primary" disabled={busy}>{application ? 'Resubmit application' : 'Submit application'}</button>
  </form>
}

function Details({ application, staff, run, busy, setPending, pending }) {
  const base = '/applications/' + application.id
  const clearance = (application.service ?? BUSINESS_PERMIT) !== BUSINESS_PERMIT
  const zoning = application.service === ZONING_CLEARANCE
  const tricycle = application.service === TRICYCLE_PERMIT
  const { documents } = services[application.service ?? BUSINESS_PERMIT]
  const uploaded = new Set(application.uploaded_documents)
  const missingZoningDocs = zoning && documents.some(([name]) => !uploaded.has(name))
  const [paymentError, setPaymentError] = useState('')
  const paymentWarning = paymentError || (!application.payer && 'Authorize a wallet before confirming payment.')

  function runPayment(action) {
    setPaymentError('')
    return run(action, true, setPaymentError)
  }

  async function verifyPayment(hash) {
    try {
      await api(base + '/confirm', hash ? { hash } : {})
    } catch (error) {
      if (!hash) throw error
      const receipt = await testnet.getTransactionReceipt({ hash }).catch(() => null)
      if (receipt?.status !== 'reverted') throw error
      if (localStorage.getItem(paymentKey(application.id)) === hash) {
        localStorage.removeItem(paymentKey(application.id))
        setPending('')
      }
      throw new Error('The transaction reverted. You can retry the payment.')
    }
  }

  function pay() {
    runPayment(async () => {
      if (!window.ethereum) throw new Error('Install or enable an Ethereum-compatible wallet to pay.')
      const wallet = createWalletClient({ chain: bscTestnet, transport: custom(window.ethereum) })
      const [payer] = await wallet.requestAddresses()
      if (!payer) throw new Error('Connect a wallet account to continue.')
      if (await wallet.getChainId() !== bscTestnet.id) {
        try {
          await wallet.switchChain({ id: bscTestnet.id })
        } catch (error) {
          if (!error.walk?.(cause => cause.code === 4902)) throw error
          await wallet.addChain({ chain: bscTestnet })
          await wallet.switchChain({ id: bscTestnet.id })
        }
      }
      const authorization = await api(base + '/authorize', { payer })
      const hash = await wallet.writeContract({
        account: payer, address: authorization.contract, abi: payAbi,
        functionName: 'pay', args: [authorization.referenceId, BigInt(authorization.deadline), authorization.signature],
        value: BigInt(authorization.amount),
      })
      localStorage.setItem(paymentKey(application.id), hash)
      setPending(hash)
      await testnet.waitForTransactionReceipt({ hash, timeout: 20_000 }).catch(() => null)
      await verifyPayment(hash)
    })
  }

  return <div className="details stack">
    {clearance && <div className="applicant-details">
      <p>{tricycle ? <><strong>Plate or unit ID</strong> {application.vehicle_identifier}</> : <><strong>{zoning ? 'Site address' : 'Address'}</strong> {application.address}</>}</p>
      <p><strong>{tricycle ? 'Proposed route or zone' : zoning ? 'Proposed use' : 'Purpose'}</strong> {application.purpose}</p>
    </div>}
    <div className="document-links">{documents.map(([name, label]) => zoning && !uploaded.has(name)
      ? <span key={name}>{label} · No PDF attached</span>
      : <a key={name} href={`/api${base}/documents/${name}?revision=${application.revision}`} target="_blank" rel="noreferrer">{label} ↗</a>)}</div>
    {(application.findings?.length > 0 || application.ai_error) && <section className="findings">
      <h4>{zoning ? 'Document checklist' : 'AI document review'}</h4>
      <p>Advisory findings for staff review.</p>
      {application.ai_error && <p className="notice">{application.ai_error}</p>}
      {application.findings?.map((finding, index) => <div className="finding" key={index}>
        <strong>{documents.find(([name]) => name === finding.requirement)?.[1] || finding.requirement}</strong>
        <span className="finding-status">{finding.status.replaceAll('_', ' ')}</span>
        <p>{finding.explanation}</p>
        {finding.excerpt && <blockquote>{finding.excerpt}</blockquote>}
      </div>)}
    </section>}
    {application.decision_note && <div className="notice"><strong>Staff note</strong><p>{application.decision_note}</p></div>}
    {staff && application.status === 'submitted' && <form className="stack" onSubmit={event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      run(() => api(base + '/decision', { status: data.get('status'), note: data.get('note'), revision: application.revision }))
    }}>
      {missingZoningDocs && <p className="notice">All three zoning PDFs must be attached before approval.</p>}
      <label>Decision<select name="status" defaultValue="" required><option value="" disabled>Choose a decision</option><option value="approved" disabled={missingZoningDocs}>Approve for payment</option><option value="needs_correction">Request corrections</option><option value="rejected">Reject</option></select></label>
      <label>Decision note<textarea name="note" rows="3" required maxLength={1000} /></label>
      <button className="button primary" disabled={busy}>Save decision</button>
    </form>}
    {!staff && application.status === 'needs_correction' && <ApplicationForm key={application.revision} application={application} busy={busy} submit={data => run(() => api(base + '/revision', data))} />}
    {!staff && application.status === 'approved' && <section className="stack">
      <h4>Testnet payment</h4>
      <p>Use an Ethereum-compatible wallet on BNB Smart Chain Testnet. Your wallet displays the test BNB amount before you approve the transaction.</p>
      {application.payer && <p className="wallet-address">Payment wallet <code>{application.payer}</code></p>}
      {pending && <p>Verify the saved transaction first. If your wallet shows it was dropped or cancelled, you can retry payment.</p>}
      <div className="document-links">
        <button className={pending ? 'button secondary' : 'button primary'} onClick={pay} disabled={busy}>{pending ? 'Retry payment' : 'Pay with wallet'}</button>
        <button className="button secondary" disabled={busy} onClick={() => runPayment(() => verifyPayment(pending))}>Verify payment</button>
        {paymentWarning && <span className="payment-warning" role="status">
          <span className="payment-warning-icon" aria-hidden="true">!</span>
          {paymentWarning}
        </span>}
        {pending && <a href={explorer + pending} target="_blank" rel="noreferrer">View transaction ↗</a>}
      </div>
      {pending && <button className="button secondary" disabled={busy} onClick={() => runPayment(() => verifyPayment())}>Search for a matching payment</button>}
    </section>}
    {application.status === 'paid' && <div className="document-links">
      {!staff && clearance && <a href={`/api${base}/certificate`} download>{tricycle ? 'Download demo tricycle permit PDF' : zoning ? 'Download demo zoning clearance PDF' : 'Download demo clearance PDF'}</a>}
      {application.receipt_ref && <a href={'/receipts/' + application.receipt_ref}>Open public receipt ↗</a>}
      {application.tx_hash && <a href={explorer + application.tx_hash} target="_blank" rel="noreferrer">View on BscScan ↗</a>}
    </div>}
  </div>
}

function ApplicationCard({ application, ...props }) {
  const [pending, setPending] = useState('')
  useEffect(() => {
    const hash = localStorage.getItem(paymentKey(application.id))
    setPending(hash ?? '')
  }, [application.id])
  return <details className="application">
    <summary><div><h3>{application.title}</h3><small>{services[application.service ?? BUSINESS_PERMIT].label}{application.created_at && ` · ${new Date(application.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}`}</small></div><span className={`status ${application.status}`}>{statuses[application.status]}</span></summary>
    <Details application={application} pending={pending} setPending={setPending} {...props} />
  </details>
}

export default function Home() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [applications, setApplications] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [service, setService] = useState(BUSINESS_PERMIT)

  async function refresh() {
    setApplications((await api('/applications')).applications)
  }

  useEffect(() => {
    api('/me').then(async result => {
      setUser(result.user)
      if (result.user) await refresh()
    }).catch(error => setError(error.message)).finally(() => setLoading(false))
  }, [])

  async function run(action, refreshAfter = true, reportError = setError) {
    setBusy(true)
    setError('')
    try {
      await action()
      if (refreshAfter) await refresh()
    } catch (error) {
      reportError(error.shortMessage || error.message)
    } finally {
      setBusy(false)
    }
  }

  const staff = user?.role === 'staff'
  return <>
    <Header user={user} busy={busy} signOut={() => run(async () => {
      await api('/logout', {})
      setUser(null)
      setApplications([])
      setShowForm(false)
      setService(BUSINESS_PERMIT)
    }, false)} />
    <main className="shell main">
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <p className="progress" role="status">Working on your request…</p>}
      {loading ? <p role="status">Loading BayanFlow…</p> : !user ? <SignIn busy={busy} signIn={credentials => run(async () => {
        await api('/login', credentials)
        setUser((await api('/me')).user)
      })} /> : <>
        <section className="workspace-hero">
          <div><span className="kicker"><i /> {staff ? 'MUNICIPAL STAFF PORTAL' : 'RESIDENT PORTAL'}</span>
          <h1>{staff ? 'Application review' : 'Municipal services'}<span>.</span></h1>
          <p>{staff ? 'Review submitted documents and record application decisions.' : 'Submit documents and follow your applications through review and payment.'}</p></div>
          {!staff && <button className="button primary" aria-expanded={showForm} onClick={() => setShowForm(!showForm)} disabled={busy}>{showForm ? 'Close form' : '+ New application'}</button>}
        </section>
        {showForm && !staff && <section className="panel form-panel stack">
          <h2>New application</h2>
          <label>Municipal service<select value={service} disabled={busy} onChange={event => setService(event.target.value)}>
            {Object.entries(services).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <ApplicationForm key={service} service={service} busy={busy} submit={data => run(async () => {
            await api('/applications', data)
            setShowForm(false)
          })} />
        </section>}
        <section className="panel list-panel">
          <div className="section-title"><h2>{staff ? 'Application queue' : 'Your applications'}</h2><button className="button secondary" disabled={busy} onClick={() => run(refresh, false)}>Refresh</button></div>
          {applications.length ? applications.map(application => <ApplicationCard key={application.id} application={application} staff={staff} run={run} busy={busy} />) : <div className="empty"><h3>No applications yet</h3><p>{staff ? 'Submitted applications will appear here.' : 'Choose a municipal service to start an application.'}</p></div>}
        </section>
      </>}
    </main>
    <Footer />
  </>
}
