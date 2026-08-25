import { describe, it, expect } from 'vitest'
import { NOC_OWNER_IRON_SHIELD, nocDefaults, nocLegalLine, nocOwner } from './nocForm'
import { PA_OWNER, PA_RAW_LEGAL } from '../data/paProperty'
import { LEGAL_PLACEHOLDER } from '../data/legal'
import { emptyProjectState } from '../data/seed'
import type { Project } from '../types'

// The NOC gets RECORDED, so the prefill rules are conservative:
//   1. Line 1 = the PA's FULL legal (plat book included) + street address;
//      an unknown parcel falls back to the look-it-up placeholder — the
//      form can never go out silently blank.
//   2. Owner 3a = the DEEDED owner from the PA record; Iron Shield lots get
//      the Belleview office address (Adam, Aug 2026). Anything else shows
//      the PA record verbatim and the UI nudges a Sunbiz check.
//   3. Lender is ALWAYS N/A (financed builds get their NOC from the lender).
const proj = (over: Partial<Project>) =>
  ({ address: '123 Test St', city: 'Ocala', zip: '34470', parcel: 'none', permit: '', subdivision: '' , ...over }) as Project

describe('nocLegalLine', () => {
  it('uses the PA full legal + street address when the parcel is known', () => {
    const parcel = Object.keys(PA_RAW_LEGAL)[0] // any generated entry
    const p = proj({ parcel })
    expect(nocLegalLine(p)).toBe(`${PA_RAW_LEGAL[parcel]} — 123 Test St, Ocala FL, 34470`)
  })

  it('unknown parcel → the look-it-up placeholder, never silently blank', () => {
    expect(nocLegalLine(proj({ parcel: '0000-000-000' }))).toContain(LEGAL_PLACEHOLDER)
  })
})

describe('nocOwner', () => {
  it('Iron Shield-deeded lots use the Belleview office address', () => {
    const parcel = Object.keys(PA_OWNER).find((k) => /IRON SHIELD/i.test(PA_OWNER[k]))
    if (!parcel) return // no Iron Shield-deeded lots on the roster right now
    expect(nocOwner(proj({ parcel }))).toEqual({ owner: NOC_OWNER_IRON_SHIELD, fromPa: false })
  })

  it('other deeded owners show verbatim, flagged for a Sunbiz check', () => {
    const parcel = Object.keys(PA_OWNER).find((k) => !/IRON SHIELD/i.test(PA_OWNER[k]))
    if (!parcel) return
    expect(nocOwner(proj({ parcel }))).toEqual({ owner: PA_OWNER[parcel], fromPa: true })
  })

  it('unknown parcel → Iron Shield default (editable in the form)', () => {
    expect(nocOwner(proj({ parcel: '0000-000-000' })).owner).toBe(NOC_OWNER_IRON_SHIELD)
  })
})

describe('nocDefaults', () => {
  it('lender is ALWAYS N/A, and the N/A boilerplate is prefilled', () => {
    const v = nocDefaults(proj({ parcel: '0000-000-000', permit: 'BLDR-26-01-00001' }), emptyProjectState())
    expect(v.lender).toBe('N/A')
    expect(v.surety).toBe('N/A')
    expect(v.expiration).toBe('N/A')
    expect(v.interest).toBe('100%')
    expect(v.improvement).toBe('New Construction SFR')
    expect(v.permit).toBe('BLDR-26-01-00001')
  })
})
