import { mkdir, writeFile } from 'node:fs/promises'

const samples = {
  'business-profile': ['Business profile', 'Business name: Paper Lantern Stationery', 'Activity: Stationery retail', 'Applicant: Alex Sample'],
  'premises-declaration': ['Premises-use declaration', 'Site: 10 Example Lane, Demo Town', 'Intended use: Stationery retail'],
  'incomplete-premises-declaration': ['Premises-use declaration', 'Site: 10 Example Lane, Demo Town'],
  'owner-authorization': ['Owner authorization', 'Casey Sample authorizes Paper Lantern Stationery', 'to use 10 Example Lane, Demo Town.'],
  'clearance-supporting': ['Volunteer application acknowledgment', 'Applicant: Alex Sample', 'Address: 10 Example Lane, Demo Town', 'Purpose: Volunteer application for the Demo Town Reading Program', 'The program requests a municipal clearance from the applicant.'],
  'zoning-site': ['Site information sheet', 'Site address: 25 Example Avenue, Demo Town', 'Parcel reference: DT-042', 'Lot area: 240 square meters'],
  'zoning-site-incomplete': ['Site information sheet', 'Site address: 25 Example Avenue, Demo Town', 'Parcel reference: DT-042'],
  'zoning-use': ['Land-use declaration', 'Site address: 25 Example Avenue, Demo Town', 'Project: Paper Lantern Reading Room', 'Proposed activity: Operate a community reading room.'],
  'zoning-use-incomplete': ['Land-use declaration', 'Site address: 25 Example Avenue, Demo Town', 'Project: Paper Lantern Reading Room'],
  'zoning-ownership': ['Owner authorization', 'Site address: 25 Example Avenue, Demo Town', 'I, Casey Sample, own this site and authorize its use', 'for the Paper Lantern Reading Room project.'],
  'tricycle-vehicle': ['Vehicle registration record', 'Unit ID: DEMO-TRI-042', 'Vehicle make: Sample Motors', 'Vehicle model: Town Runner'],
  'tricycle-vehicle-mismatch': ['Vehicle registration record', 'Unit ID: DEMO-TRI-099', 'Vehicle make: Sample Motors', 'Vehicle model: Town Runner'],
  'tricycle-operator': ['Operator record', 'Operator name: Alex Sample', 'Proposed route or zone: Market Loop']
}

const folder = new URL('../frontend/public/samples/', import.meta.url)
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
