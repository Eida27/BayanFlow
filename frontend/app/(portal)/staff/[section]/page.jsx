import { notFound } from 'next/navigation'

const sections = ['applications', 'reports', 'notifications', 'settings']

export function generateStaticParams() {
  return sections.map(section => ({ section }))
}

export default async function StaffPage({ params }) {
  const { section } = await params
  if (!sections.includes(section)) notFound()
  return null
}
