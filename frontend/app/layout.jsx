import './globals.css'
import './staff.css'
import './resident.css'

export const metadata = {
  title: 'BayanFlow | Business Permit Demo',
  description: 'A fictional business permit application and payment demo.',
  icons: { icon: { url: '/bayanflow-logo.svg', type: 'image/svg+xml', sizes: 'any' } },
}

export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>
}
