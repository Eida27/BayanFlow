import Link from 'next/link'

export async function api(path, body) {
  const response = await fetch('/api' + path, body === undefined ? { cache: 'no-store' } : {
    method: 'POST',
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The service is unavailable. Please try again.')
  return result
}

export function Header({ user, signOut, busy }) {
  return <header className="header"><div className="shell header-inner">
    <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">B</span>BayanFlow</Link>
    <div className="header-actions">
      <span className="environment"><i /> Hackathon demo</span>
      {user && <button className="button quiet" disabled={busy} onClick={signOut}>Sign out</button>}
    </div>
  </div></header>
}

export function Footer() {
  return <footer className="shell footer"><strong>BayanFlow</strong><span>Fictional municipal services · BNB Smart Chain Testnet</span></footer>
}

export const explorer = 'https://testnet.bscscan.com/tx/'
