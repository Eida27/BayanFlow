import PDFDocument from 'pdfkit'
import { fileURLToPath } from 'node:url'

const regular = fileURLToPath(import.meta.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'))
const bold = fileURLToPath(import.meta.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff'))
const paymentDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })

export function clearanceCertificate(application, payment) {
  const pdf = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'BayanFlow Demo Clearance' } })
  const chunks = []
  const result = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
  })
  pdf.registerFont('Regular', regular)
  pdf.registerFont('Bold', bold)

  pdf.font('Bold').fontSize(12).fillColor('#173f35').text('BAYANFLOW')
  pdf.moveDown(0.6).fontSize(23).text('Mayor’s Clearance / Certification')
  pdf.moveDown(0.6).fontSize(11).fillColor('#9c3024').text('DEMO ONLY — NOT AN OFFICIAL MUNICIPAL DOCUMENT')
  pdf.moveDown(1.4)
  for (const [label, value] of [
    ['Applicant', application.title],
    ['Address', application.address],
    ['Purpose', application.purpose],
    ['Application reference', application.id],
    ['Testnet payment confirmed', paymentDate.format(payment.confirmed_at)],
  ]) {
    pdf.font('Bold').fontSize(10).fillColor('#173f35').text(label)
    pdf.font('Regular').fontSize(12).fillColor('#202826').text(value.replace(/\s+/g, ' '))
    pdf.moveDown(0.75)
  }
  pdf.end()
  return result
}
