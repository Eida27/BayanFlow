export const BUSINESS_PERMIT = 'business_permit'
export const MAYORS_CLEARANCE = 'mayors_clearance'

export const services = {
  [BUSINESS_PERMIT]: {
    label: 'Business Permit',
    documents: [
      ['profile', 'Business profile', 'business-profile.pdf'],
      ['premises', 'Premises declaration', 'premises-declaration.pdf'],
      ['authorization', 'Owner authorization', 'owner-authorization.pdf'],
    ],
  },
  [MAYORS_CLEARANCE]: {
    label: 'Mayor’s Clearance / Certification',
    documents: [['supporting', 'Supporting document', 'clearance-supporting.pdf']],
  },
}
