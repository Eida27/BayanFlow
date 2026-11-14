'use client'

import { useRef, useState } from 'react'
import { Footer, Header } from './shared'
import styles from './sign-in.module.css'

const accounts = [
  { id: 'resident', label: 'Resident', description: 'Apply for permits', icon: 'resident' },
  { id: 'staff', label: 'Municipal staff', description: 'Review applications', icon: 'staff' },
]

const iconPaths = {
  resident: <><circle cx="12" cy="8" r="3" /><path d="M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" /></>,
  staff: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12a20 20 0 0 0 18 0M12 12v3" /></>,
  eye: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeOff: <><path d="m3 3 18 18M10.6 6.1A11 11 0 0 1 12 6c6.4 0 10 6 10 6a16 16 0 0 1-3.1 3.4M6.5 7.5A16.5 16.5 0 0 0 2 12s3.6 6 10 6c1.5 0 2.8-.3 4-.8" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  check: <path d="m5 12 4 4L19 6" />,
}

function Icon({ name }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {iconPaths[name]}
  </svg>
}

export default function SignIn({ loading, busy, error, clearError, signIn }) {
  const [role, setRole] = useState('resident')
  const [visible, setVisible] = useState(false)
  const submitting = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (busy || submitting.current) return
    const data = new FormData(event.currentTarget)
    submitting.current = true
    try {
      await signIn({ email: data.get('email'), password: data.get('password') })
    } finally {
      submitting.current = false
    }
  }

  return <div className={styles.page}>
    <a className={styles.skip} href="#sign-in-main">Skip to main content</a>
    <Header />
    <main className={styles.main} id="sign-in-main" tabIndex={-1}>
      <div className={styles.layout}>
        <section className={styles.access} aria-labelledby="sign-in-title">
          <div className={styles.accessContent}>
            <h1 id="sign-in-title">Sign in to BayanFlow</h1>
            {loading ? <p className={styles.description} role="status">Checking your session…</p> : <>
              <p className={styles.description}>Choose a demo account to get started.</p>
              <fieldset className={styles.accounts} disabled={busy}>
                <legend>Demo account</legend>
                <div className={styles.accountOptions}>
                  {accounts.map(account => <button type="button" key={account.id} className={styles.account}
                    aria-pressed={role === account.id} onClick={() => {
                      if (role === account.id) return
                      setRole(account.id)
                      setVisible(false)
                      clearError()
                    }}>
                    <span className={styles.accountIcon}><Icon name={account.icon} /></span>
                    {role === account.id && <span className={styles.selected}><Icon name="check" /></span>}
                    <strong>{account.label}</strong>
                    <span className={styles.accountDescription}>{account.description}</span>
                  </button>)}
                </div>
              </fieldset>
              <form key={role} className={styles.form} onSubmit={submit} aria-busy={busy}>
                <label htmlFor="demo-email">Email address</label>
                <input id="demo-email" name="email" type="email" autoComplete="username"
                  autoCapitalize="none" spellCheck={false} required defaultValue={`${role}@bayanflow.test`} />
                <label htmlFor="demo-password">Password</label>
                <div className={styles.password}>
                  <input id="demo-password" name="password" type={visible ? 'text' : 'password'}
                    autoComplete="current-password" required defaultValue={`${role}-demo`} />
                  <button type="button" className={styles.passwordToggle} aria-controls="demo-password"
                    aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(value => !value)}>
                    <Icon name={visible ? 'eyeOff' : 'eye'} />
                  </button>
                </div>
                {error && <p className={styles.error} role="alert"><Icon name="info" />{error}</p>}
                <button className={styles.submit} type="submit" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}<Icon name="arrow" />
                </button>
              </form>
              <span className={styles.srOnly} role="status">{busy ? 'Signing in…' : ''}</span>
              <p className={styles.notice}><Icon name="info" />
                <span>Use fictional sample documents. Payments use test BNB.</span>
              </p>
            </>}
          </div>
        </section>
        <section className={styles.hero} aria-labelledby="portal-intro-title">
          <div className={styles.heroCopy}>
            <h2 id="portal-intro-title">Municipal services in one place</h2>
            <p>Apply for permits and clearances, follow their review, and verify your testnet payment.</p>
          </div>
          <div className={styles.heroArt} aria-hidden="true" />
        </section>
      </div>
    </main>
    <Footer />
  </div>
}
