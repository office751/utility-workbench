/**
 * selectionShare.test.ts — the pure brains of the client share link:
 * payload snapshot building, submission counting, and the Apply merge.
 * (The Supabase IO half of selectionShare.ts is fail-soft glue — not tested
 * here, same stance as lib/investor.ts.)
 */
import { describe, expect, it } from 'vitest'
import {
  browseUrlFor,
  buildSharePayload,
  buildShareReportText,
  countShareChoices,
  mergeSubmissionIntoSelections,
} from './selectionShare'
import type { Project, ProjectSelections, SelectionSection } from '../types'
import type { Vendor } from '../data/vendors'

const P: Project = {
  id: 42,
  address: '123 SW Test Ln',
  city: 'Ocala',
  zip: '34481',
  model: 'F-LH',
  parcel: '1234-000-000',
  subdivision: 'Testwood',
  electricCo: 'SECO',
  permit: '',
  workOrder: '',
  serviceType: 'UG',
  listStatus: 'InProgress',
  engineer: '',
  waterSource: 'Well',
}

const VENDORS_FIXTURE: Vendor[] = [
  {
    id: 'fgt',
    name: 'FGT Cabinetry',
    email: 'orders@fgt.test',
    website: 'https://fgt.test/browse',
    icon: 'cabinet',
    supplies: 'cabinets',
    finish: true,
  },
]

const SECTIONS: SelectionSection[] = [
  {
    id: 'interior',
    label: 'Interior Selections',
    icon: 'palette',
    categories: [
      { id: 'cabColor', label: 'Cabinet Color', options: ['White', 'Navy'], vendorId: 'fgt' },
      {
        id: 'wallPaint',
        label: 'Wall Paint',
        options: ['Agreeable Gray'],
        hint: 'Brand & color',
        url: 'https://paint.test/colors',
        optionImages: { 'Agreeable Gray': 'https://img.test/ag.jpg' },
      },
    ],
  },
  {
    id: 'exterior',
    label: 'Exterior Selections',
    icon: 'home',
    categories: [{ id: 'roof', label: 'Roof Shingle Color', options: ['Charcoal'] }],
  },
]

describe('browseUrlFor', () => {
  it('prefers the category url over the vendor website', () => {
    expect(browseUrlFor(SECTIONS[0].categories[1], VENDORS_FIXTURE)).toBe('https://paint.test/colors')
  })
  it('falls back to the linked vendor website', () => {
    expect(browseUrlFor(SECTIONS[0].categories[0], VENDORS_FIXTURE)).toBe('https://fgt.test/browse')
  })
  it('is undefined with neither', () => {
    expect(browseUrlFor(SECTIONS[1].categories[0], VENDORS_FIXTURE)).toBeUndefined()
  })
})

describe('buildSharePayload', () => {
  const sel: ProjectSelections = {
    interior: { cabColor: { option: 'White' } },
    exterior: {},
    additionalRequests: 'Soft-close everywhere',
  }
  const payload = buildSharePayload(P, sel, SECTIONS, VENDORS_FIXTURE)

  it('carries the house facts and version', () => {
    expect(payload.version).toBe(1)
    expect(payload.address).toBe('123 SW Test Ln')
    expect(payload.model).toBe('F-LH')
  })
  it('bakes resolved browse links in (public page needs no vendor data)', () => {
    const [cab, paint] = payload.sections[0].categories
    expect(cab.browseUrl).toBe('https://fgt.test/browse')
    expect(paint.browseUrl).toBe('https://paint.test/colors')
    expect(payload.sections[1].categories[0].browseUrl).toBeUndefined()
  })
  it('snapshots current choices and the additional-requests note', () => {
    expect(payload.current.interior.cabColor).toEqual({ option: 'White' })
    expect(payload.current.additionalRequests).toBe('Soft-close everywhere')
  })
  it('copies option images through for swatch rendering', () => {
    expect(payload.sections[0].categories[1].optionImages).toEqual({
      'Agreeable Gray': 'https://img.test/ag.jpg',
    })
  })
  it('deep-copies — mutating the payload never touches the inputs', () => {
    payload.sections[0].categories[0].options.push('MUTATED')
    payload.current.interior.extra = { option: 'MUTATED' }
    expect(SECTIONS[0].categories[0].options).toEqual(['White', 'Navy'])
    expect(sel.interior.extra).toBeUndefined()
  })
})

describe('countShareChoices', () => {
  it('counts only categories with an actual answer', () => {
    expect(
      countShareChoices({
        interior: { a: { option: 'x' }, b: {}, c: { writeIn: '  ' } },
        exterior: { d: { writeIn: 'custom' } },
      }),
    ).toBe(2)
  })
})

describe('mergeSubmissionIntoSelections (the Apply button)', () => {
  const current: ProjectSelections = {
    interior: { cabColor: { option: 'White' }, grout: { option: 'Gray' } },
    exterior: { roof: { option: 'Charcoal' } },
    additionalRequests: 'Existing note',
    lock: { locked: false, signature: 'Old Sig' },
  }

  it('answered categories replace; untouched ones survive', () => {
    const out = mergeSubmissionIntoSelections(current, {
      interior: { cabColor: { option: 'Navy', writeIn: 'island navy too' } },
      exterior: {},
    })
    expect(out.interior.cabColor).toEqual({ option: 'Navy', writeIn: 'island navy too' })
    expect(out.interior.grout).toEqual({ option: 'Gray' }) // untouched
    expect(out.exterior.roof).toEqual({ option: 'Charcoal' }) // untouched
  })

  it('an EMPTY submitted category never wipes staff-entered data', () => {
    const out = mergeSubmissionIntoSelections(current, {
      interior: { grout: {} },
      exterior: { roof: { writeIn: '   ' } },
    })
    expect(out.interior.grout).toEqual({ option: 'Gray' })
    expect(out.exterior.roof).toEqual({ option: 'Charcoal' })
  })

  it('additionalRequests replaces only when the client wrote something', () => {
    const kept = mergeSubmissionIntoSelections(current, { interior: {}, exterior: {} })
    expect(kept.additionalRequests).toBe('Existing note')
    const replaced = mergeSubmissionIntoSelections(current, {
      interior: {},
      exterior: {},
      additionalRequests: 'New ask',
    })
    expect(replaced.additionalRequests).toBe('New ask')
  })

  it('preserves the sign-off lock object untouched', () => {
    const out = mergeSubmissionIntoSelections(current, { interior: {}, exterior: {} })
    expect(out.lock).toEqual({ locked: false, signature: 'Old Sig' })
  })

  it('works from a project with no selections yet', () => {
    const out = mergeSubmissionIntoSelections(undefined, {
      interior: { cabColor: { option: 'Navy' } },
      exterior: {},
    })
    expect(out.interior.cabColor).toEqual({ option: 'Navy' })
  })
})

describe('buildShareReportText', () => {
  it('lists answered categories under section headers with a signature line', () => {
    const payload = buildSharePayload(P, undefined, SECTIONS, VENDORS_FIXTURE)
    const text = buildShareReportText(
      payload,
      { interior: { cabColor: { option: 'Navy' } }, exterior: {}, additionalRequests: 'Please call' },
      'Pat Client',
    )
    expect(text).toContain('INTERIOR SELECTIONS')
    expect(text).toContain('Cabinet Color: Navy')
    expect(text).toContain('ADDITIONAL REQUESTS')
    expect(text).toContain('Prepared by Pat Client.')
    expect(text).toContain('NOT FINAL')
    expect(text).toContain('Signature:')
    expect(text).not.toContain('EXTERIOR') // nothing answered there
  })
})
