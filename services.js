export const BUSINESS_PERMIT = 'business_permit'
export const MAYORS_CLEARANCE = 'mayors_clearance'
export const ZONING_CLEARANCE = 'zoning_clearance'
export const TRICYCLE_PERMIT = 'tricycle_permit'

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
  [ZONING_CLEARANCE]: {
    label: 'Zoning / Locational Clearance',
    documents: [
      ['zoning_site', 'Site information sheet', 'zoning-site.pdf', 'zoning-site-incomplete.pdf'],
      ['zoning_use', 'Land-use declaration', 'zoning-use.pdf', 'zoning-use-incomplete.pdf'],
      ['zoning_ownership', 'Ownership or owner authorization', 'zoning-ownership.pdf'],
    ],
  },
  [TRICYCLE_PERMIT]: {
    label: 'Tricycle Operator’s Permit',
    documents: [
      ['tricycle_vehicle', 'Vehicle registration record', 'tricycle-vehicle.pdf', 'tricycle-vehicle-mismatch.pdf', 'Download mismatched sample'],
      ['tricycle_operator', 'Operator record', 'tricycle-operator.pdf'],
    ],
  },
}
