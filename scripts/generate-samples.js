import { mkdir, writeFile } from 'node:fs/promises'

const samples = {
  'business-profile': ['Business profile', 'Business name: Paper Lantern Stationery', 'Activity: Stationery retail', 'Applicant: Alex Sample'],
  'premises-declaration': ['Premises-use declaration', 'Site: 10 Example Lane, Demo Town', 'Intended use: Stationery retail'],
  'incomplete-premises-declaration': ['Premises-use declaration', 'Site: 10 Example Lane, Demo Town'],
  'owner-authorization': ['Owner authorization', 'Casey Sample authorizes Paper Lantern Stationery', 'to use 10 Example Lane, Demo Town.']
}

const folder = new URL('../public/samples/', import.meta.url)
await mkdir(folder, { recursive: true })
for (const [filename, lines] of Object.entries(samples)) {
  const stream = [
    'BT /F1 24 Tf 60 735 Td (BayanFlow) Tj',
    '0 -32 Td /F1 12 Tf (FICTIONAL TRAINING DOCUMENT) Tj',
    ...lines.map(line => `0 -25 Td (${line}) Tj`),
    'ET'
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = Buffer.byteLength(pdf)
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  await writeFile(new URL(`${filename}.pdf`, folder), pdf)
}
