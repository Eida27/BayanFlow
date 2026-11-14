import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { fileURLToPath } from 'node:url'
import { BUSINESS_PERMIT, MAYORS_CLEARANCE, TRICYCLE_PERMIT, ZONING_CLEARANCE, services } from '../services.js'

const regular = fileURLToPath(import.meta.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'))
const bold = fileURLToPath(import.meta.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff'))
const paymentDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })

export function clearanceCertificate(application, payment, verificationUrl) {
  const { modules } = QRCode.create(verificationUrl, { errorCorrectionLevel: 'M' })
  const business = application.service === BUSINESS_PERMIT
  const zoning = application.service === ZONING_CLEARANCE
  const tricycle = application.service === TRICYCLE_PERMIT
  const title = services[application.service ?? MAYORS_CLEARANCE].label
  const pdf = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `BayanFlow Demo ${title}` } })
  const chunks = []
  const result = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
  })
  pdf.registerFont('Regular', regular)
  pdf.registerFont('Bold', bold)

  pdf.font('Bold').fontSize(12).fillColor('#173f35').text('BAYANFLOW')
  pdf.moveDown(0.6).fontSize(23).text(title)
  pdf.moveDown(0.6).fontSize(11).fillColor('#9c3024').text('DEMO ONLY — NOT AN OFFICIAL MUNICIPAL DOCUMENT')
  pdf.moveDown(1.4)
  const applicantFields = business ? [['Business name', application.title]] : [
    [tricycle ? 'Operator' : zoning ? 'Applicant or project' : 'Applicant', application.title],
    tricycle ? ['Plate or unit ID', application.vehicle_identifier] : [zoning ? 'Site address' : 'Address', application.address],
    [tricycle ? 'Proposed route or zone' : zoning ? 'Proposed use' : 'Purpose', application.purpose],
  ]
  for (const [label, value] of [
    ...applicantFields,
    ['Application reference', application.id],
    ['Issued on', paymentDate.format(payment.confirmed_at)],
  ]) {
    pdf.font('Bold').fontSize(10).fillColor('#173f35').text(label)
    pdf.font('Regular').fontSize(12).fillColor('#202826').text(value.replace(/\s+/g, ' '))
    pdf.moveDown(0.75)
  }
  const qrSize = 132
  const blockHeight = qrSize + 78
  if (pdf.y + blockHeight > pdf.page.height - pdf.page.margins.bottom) pdf.addPage()
  const x = pdf.page.margins.left
  const y = pdf.y
  const quietZone = 4
  const cell = qrSize / (modules.size + 2 * quietZone)
  pdf.save().fillColor('#ffffff').rect(x, y, qrSize, qrSize).fill()
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) {
        pdf.rect(x + (column + quietZone) * cell, y + (row + quietZone) * cell, cell, cell)
      }
    }
  }
  pdf.fill('#000000').restore()
  pdf.link(x, y, qrSize, qrSize, verificationUrl)
  pdf.font('Bold').fontSize(11).fillColor('#173f35').text('Scan to verify this demo document', x, y + qrSize + 5, {
    link: verificationUrl, underline: true,
  })
  pdf.moveDown(0.5).font('Bold').fontSize(10).text('Verification ID')
  pdf.font('Regular').fontSize(10).fillColor('#202826').text(payment.reference_id)
  pdf.end()
  return result
}
