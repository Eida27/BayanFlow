'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { bscTestnet } from 'viem/chains'
import { api, Header, Footer, explorer } from './shared'
import StaffDashboard, { applicationAnchor, openApplicationCard, openLinkedApplication } from './staff-dashboard'
import { applicationFilters } from '../../application-filters.js'
import StaffReports from './staff-reports'
import { StaffNotifications, StaffSettings } from './staff-notifications'
import { useVisibleRefresh } from './use-visible-refresh'
import StaffShell, { StaffIcon } from './staff-shell'
import ResidentApplication from './resident-application'
import { reportRange, reportTimezone } from '../../report-dates.js'
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

function SignIn({ signIn, busy, error }) {
  const [role, setRole] = useState('resident')
  const [visible, setVisible] = useState(false)
  return <div className="login-grid resident-login">
    <section className="intro">
      <span className="kicker"><i /> MUNICIPAL SERVICES</span>
      <h1>Municipal services<br />in one place<span>.</span></h1>
      <p>Apply for municipal permits and clearances, track staff review, and verify your testnet payment.</p>
    </section>
    <section className="panel login-panel">
      <h2>Sign in to BayanFlow</h2>
      <p>Choose a demo account to try the application workflow.</p>
      <div className="role-toggle" aria-label="Demo account">
        {['resident', 'staff'].map(value => <button type="button" key={value} disabled={busy} aria-pressed={role === value} onClick={() => {
          setVisible(false)
          setRole(value)
        }}>{value === 'resident' ? 'Resident' : 'Municipal staff'}</button>)}
      </div>
      <form key={role} className="stack" onSubmit={event => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        signIn({ email: data.get('email'), password: data.get('password') })
      }}>
        <label>Email address<input name="email" type="email" required autoComplete="username" defaultValue={`${role}@bayanflow.test`} /></label>
        <div>
          <label htmlFor="demo-password">Password</label>
          <div className="resident-password">
            <input id="demo-password" name="password" type={visible ? 'text' : 'password'} required autoComplete="current-password" defaultValue={`${role}-demo`} />
            <button type="button" className="button secondary" aria-controls="demo-password"
              onClick={() => setVisible(!visible)}>{visible ? 'Hide password' : 'Show password'}</button>
          </div>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span></button>
      </form>
      <p className="notice">Use only the fictional sample documents. Payments use test BNB.</p>
    </section>
  </div>
}

function Details({ application, staff, run, decide, busy, setPending, pending, submitApplication }) {
  const base = '/applications/' + application.id
  const clearance = (application.service ?? BUSINESS_PERMIT) !== BUSINESS_PERMIT
  const zoning = application.service === ZONING_CLEARANCE
  const tricycle = application.service === TRICYCLE_PERMIT
  const { documents } = services[application.service ?? BUSINESS_PERMIT]
  const uploaded = new Set(application.uploaded_documents)
  const missingZoningDocs = zoning && documents.some(([name]) => !uploaded.has(name))
  const [paymentError, setPaymentError] = useState('')
  const [decisionError, setDecisionError] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const correctionStart = useRef(null)
  const paymentWarning = !application.payer && !pending && 'Authorize a wallet before confirming payment.'
  const staffNote = application.decision_note && <div className="notice"><strong>Staff note</strong><p>{application.decision_note}</p></div>

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

  const documentsAndFindings = <>
    {clearance && <h4>Applicant details</h4>}
    {clearance && <div className="applicant-details">
      <p>{tricycle ? <><strong>Plate or unit ID</strong> {application.vehicle_identifier}</> : <><strong>{zoning ? 'Site address' : 'Address'}</strong> {application.address}</>}</p>
      <p><strong>{tricycle ? 'Proposed route or zone' : zoning ? 'Proposed use' : 'Purpose'}</strong> {application.purpose}</p>
    </div>}
    <h4>Submitted documents</h4>
    <div className="document-links">{documents.map(([name, label]) => (staff || zoning) && !uploaded.has(name)
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
    {staff && staffNote}
  </>

  return <div className={staff ? 'details staff-review' : 'details stack'}>
    {!staff && staffNote}
    {!staff && application.status === 'needs_correction' && <>
      {!correcting && <div><button className="button primary" ref={correctionStart} disabled={busy}
        onClick={() => setCorrecting(true)}>Start corrections</button></div>}
      {correcting && <ResidentApplication key={application.revision} application={application} busy={busy}
        submit={(data, reportError) => submitApplication(data, reportError, application.id, () => setCorrecting(false))}
        onCancel={() => {
          setCorrecting(false)
          requestAnimationFrame(() => correctionStart.current?.focus())
        }} />}
    </>}
    {staff ? <div className="staff-evidence stack">{documentsAndFindings}</div> : documentsAndFindings}
    {staff && application.status === 'submitted' && <form className="staff-decision stack" onSubmit={event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      setDecisionError('')
      decide(application.id, () => api(base + '/decision', {
        status: data.get('status'), note: data.get('note'), revision: application.revision,
      }), setDecisionError)
    }}>
      <h4>Staff decision</h4>
      {missingZoningDocs && <p className="notice">All three zoning PDFs must be attached before approval.</p>}
      <label>Decision<select name="status" defaultValue="" required><option value="" disabled>Choose a decision</option><option value="approved" disabled={missingZoningDocs}>Approve for payment</option><option value="needs_correction">Request corrections</option><option value="rejected">Reject</option></select></label>
      <label>Decision note<textarea name="note" rows="3" required maxLength={1000} /></label>
      {decisionError && <p className="error" role="alert">{decisionError}</p>}
      <button className="button primary" disabled={busy}>{busy ? 'Working…' : 'Save decision'}</button>
    </form>}
    {!staff && application.status === 'approved' && <section className="stack resident-payment">
      <h4>Testnet payment</h4>
      <p>Use an Ethereum-compatible wallet on BNB Smart Chain Testnet. Your wallet displays the test BNB amount before you approve the transaction.</p>
      {application.payer && <p className="wallet-address">Payment wallet <code>{application.payer}</code></p>}
      {pending && <p>Verify the saved transaction first. If your wallet shows it was dropped or cancelled, you can retry payment.</p>}
      <div className="document-links">
        {!pending && <button className="button primary" onClick={pay} disabled={busy}>Pay with wallet</button>}
        <button className={pending ? 'button primary' : 'button secondary'} disabled={busy} onClick={() => runPayment(() => verifyPayment(pending))}>Verify payment</button>
        {pending && <button className="button secondary" onClick={pay} disabled={busy}>Retry payment</button>}
        {paymentWarning && <span className="payment-warning" role="status">
          <span className="payment-warning-icon" aria-hidden="true">!</span>
          {paymentWarning}
        </span>}
        {pending && <a href={explorer + pending} target="_blank" rel="noreferrer">View transaction ↗</a>}
      </div>
      {paymentError && <p className="error" role="alert">{paymentError}</p>}
      {pending && <button className="button secondary" disabled={busy} onClick={() => runPayment(() => verifyPayment())}>Search for a matching payment</button>}
    </section>}
    {application.status === 'paid' && <div className="document-links">
      {!staff && clearance && <a href={`/api${base}/certificate`} download>{tricycle ? 'Download demo tricycle permit PDF' : zoning ? 'Download demo zoning clearance PDF' : 'Download demo clearance PDF'}</a>}
      {application.receipt_ref && <a href={'/receipts/' + application.receipt_ref}>Open public receipt ↗</a>}
      {application.tx_hash && <a href={explorer + application.tx_hash} target="_blank" rel="noreferrer">View on BscScan ↗</a>}
    </div>}
  </div>
}

function ApplicationCard({ application, staff, ...props }) {
  const [pending, setPending] = useState('')
  useEffect(() => {
    if (staff) return
    const hash = localStorage.getItem(paymentKey(application.id))
    setPending(hash ?? '')
  }, [application.id, staff])
  const nextStep = {
    submitted: 'Wait for staff review',
    needs_correction: 'Review staff feedback and resubmit',
    approved: pending ? 'Verify your saved transaction' : 'Pay the demo fee with your wallet',
    rejected: 'Read the staff decision',
    paid: 'Open your payment receipt',
  }
  return <details className="application" id={applicationAnchor(application.id)}>
    <summary><div><h3>{application.title}</h3><small>{services[application.service ?? BUSINESS_PERMIT].label}{application.created_at && ` · ${new Date(application.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: reportTimezone })}`}</small>
      {!staff && <span className="resident-next-step">{nextStep[application.status]}</span>}</div><span className={`status ${application.status}`}>{statuses[application.status]}</span></summary>
    <Details application={application} staff={staff} pending={pending} setPending={setPending} {...props} />
  </details>
}

function matchesQueueSearch(application, query) {
  const term = query.trim().toLocaleLowerCase('en-PH')
  const service = services[application.service ?? BUSINESS_PERMIT].label
  return [application.title, service].some(value => value.toLocaleLowerCase('en-PH').includes(term))
}

function QueueToolbar({ search, setSearch, queueFilter, busy }) {
  const [filter, setFilter] = useState(queueFilter?.filter ?? '')
  const dated = filter === 'new-today' || filter === 'resubmissions'
  return <div className="staff-queue-tools">
    <label className="staff-search">Search applications
      <span><StaffIcon name="search" />
        <input id="staff-queue-search" type="search" value={search} placeholder="Application title or service" readOnly={busy}
          onChange={event => setSearch(event.target.value)} />
      </span>
    </label>
    <form action="/staff/applications" className="staff-queue-filters">
      {search.trim() && <input type="hidden" name="q" value={search.trim()} />}
      <label>Queue filter
        <select name={filter ? 'filter' : undefined} value={filter} disabled={busy} onChange={event => setFilter(event.target.value)}>
          <option value="">All applications</option>
          {Object.entries(applicationFilters).map(([value, label]) =>
            <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {dated && <label>Activity date (Manila)
        <input type="date" name="date" required defaultValue={queueFilter?.date ?? reportRange({}).to} />
      </label>}
      <button className="button secondary" disabled={busy}>Apply filter</button>
    </form>
  </div>
}

export default function Portal({ section = 'dashboard' }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [applications, setApplications] = useState(null)
  const [queueFilter, setQueueFilter] = useState(null)
  const [search, setSearch] = useState('')
  const [decisionNotice, setDecisionNotice] = useState('')
  const nextFocus = useRef(null)
  const queueHeading = useRef(null)
  const [showForm, setShowForm] = useState(false)
  const [residentNotice, setResidentNotice] = useState('')
  const startButton = useRef(null)
  const residentHeading = useRef(null)
  const residentFocus = useRef(null)
  const [unreadCount, updateUnreadCount] = useState(null)
  const badgeVersion = useRef(0)
  const staff = user?.role === 'staff'
  const setUnreadCount = useCallback(count => {
    badgeVersion.current++
    updateUnreadCount(count)
  }, [])
  const refreshUnread = useCallback(async () => {
    const version = ++badgeVersion.current
    try {
      const result = await api('/staff/notifications/unread')
      if (version === badgeVersion.current) updateUnreadCount(result.unreadCount)
    } catch {
      // The feed shows request errors and offers a retry.
    }
  }, [])
  useVisibleRefresh(staff && section !== 'notifications' ? refreshUnread : null)
  const staffQueueReady = staff && section === 'applications' && !loading && applications !== null

  async function enterPortal(account) {
    if (account?.role === 'staff' && section === 'dashboard' && /^#application-[0-9a-f-]+$/i.test(window.location.hash)) {
      window.location.replace('/staff/applications' + window.location.hash)
      return
    }
    if (account?.role === 'resident' && section !== 'dashboard') {
      window.location.replace('/')
      return
    }
    setUser(account)
    if (account?.role === 'staff' && section === 'applications') {
      setSearch(new URLSearchParams(window.location.search).get('q') ?? '')
    }
    if (account && (account.role === 'resident' || section === 'applications')) await refresh(account.role === 'staff')
  }

  async function loadApplications(forStaff) {
    const params = new URLSearchParams(forStaff ? window.location.search : '')
    params.delete('q')
    const filter = params.get('filter')
    const date = params.get('date')
    const filtered = params.has('filter') || params.has('date')
    setQueueFilter(filtered ? { filter, date } : null)
    return (await api('/applications' + (filtered ? '?' + params : ''))).applications
  }

  async function refresh(forStaff = staff) {
    setApplications(await loadApplications(forStaff))
  }

  useEffect(() => {
    api('/me').then(({ user }) => enterPortal(user)).catch(error => setError(error.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!staffQueueReady) return
    openLinkedApplication()
    window.addEventListener('hashchange', openLinkedApplication)
    return () => window.removeEventListener('hashchange', openLinkedApplication)
  }, [staffQueueReady])

  useEffect(() => {
    if (busy || nextFocus.current === null) return
    const target = nextFocus.current
    nextFocus.current = null
    if (target) openApplicationCard(applicationAnchor(target))
    else queueHeading.current?.focus()
  }, [applications, busy])

  useEffect(() => {
    if (busy || !residentFocus.current) return
    if (applications?.some(application => application.id === residentFocus.current)) {
      openApplicationCard(applicationAnchor(residentFocus.current))
      residentFocus.current = null
    } else residentHeading.current?.focus()
  }, [applications, busy])

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

  function submitApplication(data, reportError, applicationId, afterSave = () => setShowForm(false)) {
    setResidentNotice('')
    run(async () => {
      const { id } = await api(applicationId ? '/applications/' + applicationId + '/revision' : '/applications', data)
      residentFocus.current = id
      afterSave()
      setResidentNotice(applicationId ? 'Application resubmitted for review.' : 'Application submitted for review.')
      try {
        await refresh(false)
      } catch {
        setApplications(null)
        setError('Your application was saved. Refresh to see its latest status.')
      }
    }, false, reportError)
  }

  function decide(id, action, reportError) {
    setDecisionNotice('')
    run(async () => {
      await action()
      setDecisionNotice('Decision saved.')
      let updated
      try {
        updated = await loadApplications(true)
      } catch {
        setApplications(null)
        nextFocus.current = ''
        setError('The decision was saved. Refresh to reload the application queue.')
        return
      }
      const visible = updated.filter(item => matchesQueueSearch(item, search))
      if (!visible.some(item => item.id === id)) {
        const reviewedIndex = visibleApplications.findIndex(item => item.id === id)
        const remaining = new Set(visible.map(item => item.id))
        nextFocus.current = visibleApplications.slice(reviewedIndex + 1).find(item => remaining.has(item.id))?.id
          ?? visible[0]?.id ?? ''
        if (window.location.hash === '#' + applicationAnchor(id)) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      } else nextFocus.current = id
      setApplications(updated)
    }, false, reportError)
  }

  const visibleApplications = staff ? applications?.filter(item => matchesQueueSearch(item, search)) : applications
  const filterLabel = queueFilter && (Object.hasOwn(applicationFilters, queueFilter.filter)
    ? applicationFilters[queueFilter.filter] : 'Application filter')
  const eventCount = queueFilter?.filter === 'resubmissions'
    ? applications?.reduce((sum, item) => sum + item.event_count, 0) : null

  function updateSearch(value) {
    setSearch(value)
    const url = new URL(window.location.href)
    if (value.trim()) {
      url.searchParams.set('q', value.trim())
      url.hash = ''
    } else url.searchParams.delete('q')
    window.history.replaceState(null, '', url)
  }

  function signOut() {
    run(async () => {
      await api('/logout', {})
      setUser(null)
      setUnreadCount(null)
      setApplications(null)
      setShowForm(false)
      setResidentNotice('')
      residentFocus.current = null
      setSearch('')
      setDecisionNotice('')
      if (section !== 'dashboard') window.location.replace('/')
    }, false)
  }

  const feedback = <>
    {error && <p className="error" role="alert">{error}</p>}
    {busy && <p className="progress" role="status">Working on your request…</p>}
  </>

  if (staff) return <StaffShell section={section} unreadCount={unreadCount} busy={busy} signOut={signOut}>
    {feedback}
    {section === 'dashboard' && <StaffDashboard />}
    {section === 'reports' && <StaffReports />}
    {section === 'notifications' && <StaffNotifications setUnreadCount={setUnreadCount} />}
    {section === 'settings' && <StaffSettings setUnreadCount={setUnreadCount} />}
    {section === 'applications' && <section className="panel staff-queue">
      <div className="section-title">
        <h2 ref={queueHeading} tabIndex={-1}>Application queue</h2>
        <button className="button secondary" disabled={busy || loading} onClick={() => run(refresh, false)}>Refresh</button>
      </div>
      {!loading && <QueueToolbar key={queueFilter?.filter ?? 'all'} queueFilter={queueFilter}
        search={search} setSearch={updateSearch} busy={busy} />}
      <div className="queue-filter">
        <p role="status">
          {filterLabel && <strong>{filterLabel} · </strong>}
          {queueFilter?.date && <>{queueFilter.date} Manila time · </>}
          {visibleApplications && <>{visibleApplications.length} {visibleApplications.length === 1 ? 'application' : 'applications'}
            {search.trim() && <> of {applications.length}</>}
            {!search.trim() && eventCount > applications.length && <> from {eventCount} resubmission events</>}
          </>}
        </p>
        <div className="staff-clear-actions">
          {search && <button className="button secondary" disabled={busy} onClick={() => {
            updateSearch('')
            document.getElementById('staff-queue-search')?.focus()
          }}>Clear search</button>}
          {queueFilter && <a href={'/staff/applications' + (search.trim() ? '?' + new URLSearchParams({ q: search.trim() }) : '')}>Clear filter</a>}
        </div>
      </div>
      {decisionNotice && <p className="notice" role="status">{decisionNotice}</p>}
      {!visibleApplications ? <p role="status">{busy || loading ? 'Loading applications…' : 'Applications are unavailable.'}</p>
        : visibleApplications.length ? visibleApplications.map(application => <ApplicationCard key={application.id}
          application={application} staff run={run} decide={decide} busy={busy} />)
        : <div className="empty"><h3>{search.trim() || queueFilter ? 'No matching applications' : 'No applications yet'}</h3>
          <p>{search.trim() ? 'Try another title or service name.' : queueFilter ? 'Choose another filter to see more applications.' : 'Submitted applications will appear here.'}</p>
        </div>}
    </section>}
  </StaffShell>

  return <div className="resident-site">
    <a className="resident-skip" href="#resident-main">Skip to main content</a>
    <Header user={user} busy={busy} signOut={signOut} />
    <main className="shell main" id="resident-main" tabIndex={-1}>
      {loading ? <p role="status">Loading BayanFlow…</p> : !user ? <SignIn busy={busy} error={error} signIn={credentials => run(async () => {
        await api('/login', credentials)
        await enterPortal((await api('/me')).user)
      }, false)} /> : <>
        <section className="resident-hero">
          <div><span className="kicker">Resident Portal</span>
          <h1>Municipal services</h1>
          <p>Submit documents and follow your applications through review and payment.</p></div>
          {!showForm && <button className="button primary" ref={startButton} onClick={() => setShowForm(true)} disabled={busy}>Start an application</button>}
        </section>
        {showForm && <section className="resident-new stack">
          <h2>New application</h2>
          <ResidentApplication busy={busy} submit={submitApplication} onCancel={() => {
            setShowForm(false)
            requestAnimationFrame(() => startButton.current?.focus())
          }} />
        </section>}
        <section className="panel list-panel">
          <div className="section-title"><h2 ref={residentHeading} tabIndex={-1}>Your applications</h2><button className="button secondary" disabled={busy} onClick={() => run(refresh, false)}>{busy ? 'Working…' : applications === null || error ? 'Retry' : 'Refresh'}</button></div>
          {residentNotice && <p className="notice" role="status">{residentNotice}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {applications === null ? <p role="status">{busy ? 'Loading applications…' : 'Applications are unavailable.'}</p> : applications.length ? applications.map(application => <ApplicationCard key={application.id}
            application={application} run={run} busy={busy} submitApplication={submitApplication} />)
            : <div className="empty"><StaffIcon name="applications" /><h3>No applications yet</h3><p>Your submitted applications will appear here.</p>
              {!showForm && <button className="button secondary" disabled={busy} onClick={() => setShowForm(true)}>Choose a service</button>}</div>}
        </section>
      </>}
    </main>
    <Footer />
  </div>
}
