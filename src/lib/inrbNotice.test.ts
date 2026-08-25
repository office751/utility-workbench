import { describe, it, expect } from 'vitest'
import { DEFAULT_OWNER, inrbDefaults, lotBlockFromParcel } from './inrbNotice'
import { emptyProjectState } from '../data/seed'
import type { Project } from '../types'

// The INRB notice gets RECORDED at the courthouse, so the pre-fill rules are
// deliberately conservative:
//   1. lot/block come from the parcel ONLY when it matches SECTION-BLOCK-LOT;
//      anything odd → blank (the user types them), never a bad guess.
//   2. Leading zeros are stripped ("015" → block "15") — matching how the
//      county-accepted example was filled.
//   3. Owner: blank ownerName means our own spec build → Iron Shield.
describe('lotBlockFromParcel', () => {
  it('reads SECTION-BLOCK-LOT (the county-accepted example)', () => {
    // 1801-015-006 was recorded as block 15, lot 6.
    expect(lotBlockFromParcel('1801-015-006')).toEqual({ lot: '6', block: '15' })
  })

  it('handles wider block/lot segments (Silver Springs Shores style)', () => {
    expect(lotBlockFromParcel('9024-0545-28')).toEqual({ lot: '28', block: '545' })
  })

  it('returns null (→ blank fields) for anything that is not 3 segments', () => {
    expect(lotBlockFromParcel('12345')).toBeNull()
    expect(lotBlockFromParcel('R1801-015')).toBeNull()
    expect(lotBlockFromParcel('')).toBeNull()
    expect(lotBlockFromParcel(undefined)).toBeNull()
  })
})

describe('inrbDefaults', () => {
  const project = {
    parcel: '1801-015-006',
    subdivision: 'Rainbow Lakes Estates, Sec A',
  } as Project

  it('assembles the six fields from roster + state', () => {
    const ps = emptyProjectState()
    ps.septicPermit = '42-S1-5167182'
    expect(inrbDefaults(project, ps)).toEqual({
      permit: '42-S1-5167182',
      propertyId: '1801-015-006',
      lot: '6',
      block: '15',
      subdivision: 'Rainbow Lakes Estates, Sec A',
      owner: DEFAULT_OWNER,
    })
  })

  it('a named owner (investor house) replaces the Iron Shield default', () => {
    const ps = emptyProjectState()
    ps.ownerName = 'Sample Investor LLC'
    expect(inrbDefaults(project, ps).owner).toBe('Sample Investor LLC')
  })

  it('missing permit / unparseable parcel → blank fields, no guesses', () => {
    const odd = { parcel: 'unknown', subdivision: '' } as Project
    const v = inrbDefaults(odd, emptyProjectState())
    expect(v.permit).toBe('')
    expect(v.lot).toBe('')
    expect(v.block).toBe('')
  })
})
