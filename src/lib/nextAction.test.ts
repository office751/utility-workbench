import { describe, it, expect, afterEach } from 'vitest'
import {
  confirmedUtility,
  electricNeedsAction,
  isElectricDone,
  isOurCourtKey,
  isPermitDone,
  needsVerify,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  permitNeedsAction,
  serviceTypeOf,
} from './nextAction'
import { emptyProjectState } from '../data/seed'
import { makeProject } from './testUtils'
import { applyStepOverrides } from '../data/lifecycles'

// nextAction decides "what's the next move" per stream — it feeds the Today
// command center, the detail banners, and the project-list dots. These tests
// walk each lifecycle in order so a reordered/renamed step can't silently
// change what the app tells Adam to do next.

// The step-override store is module-global (lifecycles.ts) — always reset it
// so one test's customized list can't leak into the next.
afterEach(() => applyStepOverrides(undefined))

describe('nextElectricAction — the electric walk', () => {
  const p = makeProject() // SECO, unambiguous subdivision

  it('walks the default lifecycle in the real-world order', () => {
    const ps = emptyProjectState()
    const done = (id: string) => (ps.steps.electric[id] = { done: true })

    expect(nextElectricAction(p, ps).key).toBe('apply') // ready to apply
    done('submit')
    expect(nextElectricAction(p, ps).key).toBe('deposit') // pay fees
    done('deposit')
    expect(nextElectricAction(p, ps).key).toBe('eng') // awaiting engineer
    done('engineer')
    expect(nextElectricAction(p, ps).key).toBe('rough') // notify on rough pass
    done('rough')
    expect(nextElectricAction(p, ps).key).toBe('meternotify') // send photos
    done('meternotify')
    expect(nextElectricAction(p, ps).key).toBe('field') // awaiting meter set
    done('meter')
    expect(nextElectricAction(p, ps).key).toBe('power') // awaiting power on
    done('power')
    expect(nextElectricAction(p, ps).key).toBe('done')
  })

  it('a TBD lot needs a house number before it can apply', () => {
    expect(nextElectricAction(makeProject({ address: 'TBD Hickory Rd' }), emptyProjectState()).key).toBe('addr')
  })

  it('Clay territory short-circuits everything (phone-only utility)', () => {
    expect(nextElectricAction(makeProject({ electricCo: 'CLAY' }), emptyProjectState()).key).toBe('clay')
  })

  it('ambiguous territory demands verification first — until confirmed', () => {
    const amb = makeProject({ subdivision: 'Silver Springs Shores', electricCo: '' })
    const ps = emptyProjectState()
    expect(needsVerify(amb, ps)).toBe(true)
    expect(nextElectricAction(amb, ps).key).toBe('verify')

    // Confirming EITHER way unlocks the application:
    ps.steps.electric['verify'] = { done: true } // …by checking the step
    expect(confirmedUtility(ps)).toBe(true)
    expect(nextElectricAction(amb, ps).key).toBe('apply')

    const ps2 = emptyProjectState()
    ps2.electricCo = 'SECO' // …or by setting the utility explicitly
    expect(nextElectricAction(amb, ps2).key).toBe('apply')
  })

  it('done = final step checked AND the account transferred after sale', () => {
    const ps = emptyProjectState()
    for (const id of ['verify', 'submit', 'deposit', 'engineer', 'rough', 'fieldsched', 'fielddone', 'meternotify', 'meter', 'power'])
      ps.steps.electric[id] = { done: true }
    expect(isElectricDone(ps)).toBe(false) // power on, but account still ours
    ps.transferred = true
    expect(isElectricDone(ps)).toBe(true)
  })
})

describe('electricNeedsAction agrees with the Today command center', () => {
  const p = makeProject()

  it('our-court keys need action; waiting-on-the-utility does not', () => {
    const ps = emptyProjectState()
    expect(electricNeedsAction(p, ps)).toBe(true) // 'apply' is our move
    ps.steps.electric = { submit: { done: true }, deposit: { done: true } }
    expect(electricNeedsAction(p, ps)).toBe(false) // 'eng' — ball's with SECO
  })

  // A customized list counts ANY pending step as our move — the same fail-open
  // rule Today uses. (These two consumers once disagreed; OUR_COURT is shared now.)
  it('a CUSTOMIZED electric list counts any pending step as our move', () => {
    const ps = emptyProjectState()
    applyStepOverrides({ electric: [{ id: 'walkthru', label: 'Owner walkthrough' }] })
    expect(nextElectricAction(p, ps).key).toBe('walkthru')
    // Shared OUR_COURT judgment: list dots AND Today both say "your move".
    expect(isOurCourtKey('electric', 'walkthru', p, ps)).toBe(true)
    expect(electricNeedsAction(p, ps)).toBe(true)
  })
})

describe('nextWaterAction — source decides the checklist', () => {
  it('no source set → the first move is choosing one', () => {
    expect(nextWaterAction(makeProject(), emptyProjectState()).key).toBe('wsrc')
  })

  it('a Well lot tracks exactly one thing: the well', () => {
    const p = makeProject({ waterSource: 'Well' })
    const ps = emptyProjectState()
    expect(nextWaterAction(p, ps).key).toBe('wdrilled')
    ps.steps.water['wdrilled'] = { done: true }
    expect(nextWaterAction(p, ps)).toEqual({ key: 'done', label: 'Well installed ✓' })
  })

  it('City lots skip the water-main-extension steps; CityWM includes them', () => {
    const ps = emptyProjectState()
    ps.steps.water = { cavail: { done: true }, capply: { done: true } }
    expect(nextWaterAction(makeProject({ waterSource: 'City' }), ps).key).toBe('ctap')
    expect(nextWaterAction(makeProject({ waterSource: 'CityWM' }), ps).key).toBe('cwmagree')
  })

  it('a user override beats the roster source', () => {
    const p = makeProject({ waterSource: 'Well' })
    const ps = emptyProjectState()
    ps.waterSource = 'City'
    expect(nextWaterAction(p, ps).key).toBe('cavail')
  })
})

describe('nextSepticAction — septic vs INRB vs sewer', () => {
  it('a default (Septic) lot starts at the site/soil evaluation', () => {
    expect(nextSepticAction(emptyProjectState()).key).toBe('seval')
  })

  it('the INRB notice step only exists for INRB systems', () => {
    const ps = emptyProjectState()
    ps.steps.septic = {
      seval: { done: true }, sapplied: { done: true },
      sissued: { done: true }, scounty: { done: true },
    }
    expect(nextSepticAction(ps).key).toBe('sinstalled') // plain septic: no snrb
    ps.septicSystem = 'INRB'
    expect(nextSepticAction(ps).key).toBe('snrb') // INRB: Georges Plumbing notice
  })

  it('a SEWER lot resolves to the sewer steps (availability first)', () => {
    const ps = emptyProjectState()
    ps.septicSource = 'Sewer'
    expect(nextSepticAction(ps).key).toBe('sweravail')
  })

  it('reports done once every step of the resolved list is checked', () => {
    const ps = emptyProjectState()
    ps.septicSource = 'Sewer'
    ps.steps.septic = {
      sweravail: { done: true },
      swerapply: { done: true },
      swertap: { done: true },
      swerconn: { done: true },
    }
    expect(nextSepticAction(ps).key).toBe('done')
  })
})

describe('nextPermitAction / permitNeedsAction', () => {
  it('nothing done yet reads as "not submitted"', () => {
    expect(nextPermitAction(emptyProjectState())).toEqual({ key: 'submitted', label: 'Not submitted' })
  })

  it("skips the optional 'corrections' step in the walk", () => {
    const ps = emptyProjectState()
    ps.steps.permit = { submitted: { done: true }, review: { done: true } }
    expect(nextPermitAction(ps).key).toBe('approved') // NOT 'corrections'
  })

  it('issued = done, even if earlier boxes were never ticked', () => {
    const ps = emptyProjectState()
    ps.steps.permit = { issued: { done: true } } // county says issued — believe it
    expect(isPermitDone(ps)).toBe(true)
    expect(nextPermitAction(ps).key).toBe('done')
  })

  it("needs MY action only while we're the responsible party", () => {
    const ps = emptyProjectState()
    expect(permitNeedsAction(ps)).toBe(true) // default responsible = Us
    ps.permitResponsible = 'Owner'
    expect(permitNeedsAction(ps)).toBe(false)
    ps.permitResponsible = 'GC'
    expect(permitNeedsAction(ps)).toBe(false)
    ps.permitResponsible = 'Us'
    ps.steps.permit = { issued: { done: true } }
    expect(permitNeedsAction(ps)).toBe(false) // issued → nothing left to do
  })
})

describe('serviceTypeOf — override → roster → subdivision default', () => {
  it('resolves in precedence order', () => {
    const ps = emptyProjectState()
    ps.serviceType = 'UG'
    expect(serviceTypeOf(makeProject({ serviceType: 'OH' }), ps)).toBe('UG') // override
    expect(serviceTypeOf(makeProject({ serviceType: 'OH' }), emptyProjectState())).toBe('OH') // roster
    expect(serviceTypeOf(makeProject({ subdivision: 'Rainbow Lakes Estates' }), emptyProjectState())).toBe('UG')
    expect(serviceTypeOf(makeProject({ subdivision: 'Regal Park' }), emptyProjectState())).toBe('OH')
    expect(serviceTypeOf(makeProject(), emptyProjectState())).toBe('') // unknown
  })
})
