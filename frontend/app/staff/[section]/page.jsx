import { notFound } from 'next/navigation'
import Portal from '../../portal'

const sections = ['applications', 'reports', 'notifications', 'settings']

export function generateStaticParams() {
  return sections.map(section => ({ section }))
}

export default async function StaffPage({ params }) {
  const { section } = await params
  if (!sections.includes(section)) notFound()
  return <Portal section={section} />
}
