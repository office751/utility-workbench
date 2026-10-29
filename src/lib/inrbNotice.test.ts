import { describe, it, expect } from 'vitest'
import { inrbAddressLine, inrbDefaults } from './inrbNotice'
import { emptyProjectState } from '../data/seed'
import type { Project } from '../types'

// The INRB notice gets RECORDED at the courthouse, so the pre-fill rules are
// deliberately conservative:
//   1. Only address / parcel / DEP permit / notary county are filled — the
//      DEP 9-15-26 form has no lot, block or subdivision.
//   2. Missing data → blank field (the user types it), never a guess.
//   3. The owner's name is NEVER pre-filled — they print + sign it by hand.
const project = {
  address: '20073 SW Rainbow Lakes Blvd',
  city: 'Dunnellon',
  zip: '34431',
  parcel: '1801-015-076',
} as Project

describe('inrbAddressLine', () => {
  it('joins street, city, FL + zip', () => {
    expect(inrbAddressLine(project)).toBe('20073 SW Rainbow Lakes Blvd, Dunnellon, FL 34431')
  })

  it('drops missing pieces instead of leaving stray commas', () => {
    expect(inrbAddressLine({ address: 'TBD SW Pensacola Dr', city: '', zip: '' } as Project)).toBe(
      'TBD SW Pensacola Dr, FL',
    )
  })
})

describe('inrbDefaults', () => {
  it('assembles the four fields from roster + state', () => {
    const ps = emptyProjectState()
    ps.septicPermit = '42-SW-5167236'
    expect(inrbDefaults(project, ps)).toEqual({
      address: '20073 SW Rainbow Lakes Blvd, Dunnellon, FL 34431',
      parcel: '1801-015-076',
      permit: '42-SW-5167236',
      county: 'Marion',
    })
  })

  it('never fills the owner, even on a house with a named owner', () => {
    // The owner prints AND signs by hand (Adam, Oct 21 2026) — an investor's
    // ownerName must not leak onto the form.
    const ps = emptyProjectState()
    ps.ownerName = 'Sample Investor LLC'
    expect(inrbDefaults(project, ps)).not.toHaveProperty('owner')
    expect(Object.values(inrbDefaults(project, ps))).not.toContain('Sample Investor LLC')
  })

  it('missing permit → blank field, no guess', () => {
    expect(inrbDefaults(project, emptyProjectState()).permit).toBe('')
  })
})
