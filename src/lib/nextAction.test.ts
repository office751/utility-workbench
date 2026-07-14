import { describe, it, expect, afterEach } from 'vitest'
import {
  closingNeedsAction,
  closingPending,
  closingProgress,
  closingStepDone,
  closingStepsFor,
  confirmedUtility,
  electricNeedsAction,
  isElectricDone,
  isOurCourtKey,
  isPermitDone,
  needsVerify,
  needsWaterVerify,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  permitNeedsAction,
  permitStatus,
  serviceTypeOf,
} from './nextAction'
import { emptyProjectState } from '../data/seed'
import { makeProject } from './testUtils'
import { applyStepOverrides } from '../data/lifecycles'
import { PERMIT_DATES } from '../data/permitDates'

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

  it('done = power on — the account transfer is closing workflow, not build', () => {
    const ps = emptyProjectState()
    for (const id of ['verify', 'submit', 'deposit', 'engineer', 'rough', 'fieldsched', 'fielddone', 'meternotify', 'meter', 'power'])
      ps.steps.electric[id] = { done: true }
    // July 2026: transferred moved to the closing checklist ('xfer') — a
    // powered-up house reads Complete regardless of the account's name.
    expect(isElectricDone(ps)).toBe(true)
  })
})

describe('needsWaterVerify — the Water tab county-GIS check gate', () => {
  it('CITY-WATER lots only: wells and unset sources never show the check', () => {
    // Adam's rule (July 2026): a well lot has no water company to verify, and
    // an unset source means well-vs-city itself is still undecided — the GIS
    // can't make that call.
    expect(needsWaterVerify(makeProject({ waterSource: 'Well' }), emptyProjectState())).toBe(false)
    expect(needsWaterVerify(makeProject({ waterSource: '' }), emptyProjectState())).toBe(false)
    expect(needsWaterVerify(makeProject({ waterSource: 'City' }), emptyProjectState())).toBe(true)
    expect(needsWaterVerify(makeProject({ waterSource: 'CityWM' }), emptyProjectState())).toBe(true)
  })

  it('the ps waterSource override wins over the roster value', () => {
    const wellByRoster = makeProject({ waterSource: 'Well' })
    const ps = emptyProjectState()
    ps.waterSource = 'City' // re-decided in Settings: actually a city lot
    expect(needsWaterVerify(wellByRoster, ps)).toBe(true)
  })

  it("confirmed either way dismisses it: a chosen company (incl. the 'MCU' sentinel) or 'cavail' done", () => {
    const city = makeProject({ waterSource: 'City' })

    const viaSentinel = emptyProjectState()
    viaSentinel.waterCompanyId = 'MCU' // the GIS check confirmed the default
    expect(needsWaterVerify(city, viaSentinel)).toBe(false)

    const viaRoster = emptyProjectState()
    viaRoster.waterCompanyId = 'sunshine-utils' // custom company from Settings
    expect(needsWaterVerify(city, viaRoster)).toBe(false)

    const viaStep = emptyProjectState()
    viaStep.steps.water['cavail'] = { done: true } // you can't confirm availability without knowing who you asked
    expect(needsWaterVerify(city, viaStep)).toBe(false)
  })
})

describe('closing helpers — the sale workflow bucket', () => {
  it("'xfer' mirrors ps.transferred; other steps read their own bucket", () => {
    const ps = emptyProjectState()
    expect(closingStepDone(ps, 'xfer')).toBe(false)
    ps.transferred = true
    expect(closingStepDone(ps, 'xfer')).toBe(true) // no closingSteps entry needed
    expect(closingStepDone(ps, 'contract')).toBe(false)
    ps.closingSteps = { contract: { done: true } }
    expect(closingStepDone(ps, 'contract')).toBe(true)
  })

  it('progress counts the effective list, xfer included via transferred', () => {
    const city = makeProject({ waterSource: 'CityWM' }) // municipal → full 8 steps
    const ps = emptyProjectState()
    expect(closingProgress(city, ps)).toEqual({ done: 0, total: 8 })
    ps.closingSteps = { contract: { done: true }, cdate: { done: true } }
    ps.transferred = true
    expect(closingProgress(city, ps)).toEqual({ done: 3, total: 8 })
  })

  it("a well house has NO 'wstop' step — nothing to disconnect", () => {
    const well = makeProject({ waterSource: 'Well' })
    const ps = emptyProjectState()
    expect(closingStepsFor(well, ps).some((s) => s.id === 'wstop')).toBe(false)
    expect(closingProgress(well, ps)).toEqual({ done: 0, total: 7 })
    // …and a user override of the source wins over the roster, as everywhere.
    ps.waterSource = 'City'
    expect(closingProgress(well, ps).total).toBe(8)
  })

  it('follows an owner-edited closing list (override key "closing")', () => {
    applyStepOverrides({ closing: [{ id: 'a', label: 'A' }, { id: 'xfer', label: 'X' }] })
    const ps = emptyProjectState()
    ps.transferred = true
    expect(closingProgress(makeProject({ waterSource: 'City' }), ps)).toEqual({ done: 1, total: 2 })
  })

  it('pending ONLY while under contract with steps left', () => {
    const city = makeProject({ waterSource: 'City' })
    const ps = emptyProjectState()
    expect(closingPending(city, ps)).toBe(false) // not under contract → never pending
    ps.underContract = true
    expect(closingPending(city, ps)).toBe(true)
    ps.closingSteps = {}
    for (const id of ['contract', 'cdate', 'walkthrough', 'estop', 'wstop', 'handoff', 'deedclosed'])
      ps.closingSteps[id] = { done: true }
    ps.transferred = true // = 'xfer'
    expect(closingPending(city, ps)).toBe(false) // all 8 done
  })

  it('fires when the shut-off deadline is 10 days out or closer', () => {
    const ps = emptyProjectState()
    expect(closingNeedsAction(ps)).toBe(false) // no closing date → no deadline
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    ps.closingDate = soon
    expect(closingNeedsAction(ps)).toBe(true)
    ps.transferred = true // account moved → deadline satisfied
    expect(closingNeedsAction(ps)).toBe(false)
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

describe('permitStatus — the coarse bucket behind the Projects permit filter', () => {
  // Dynamic county keys so a snapshot refresh can't silently break these:
  // one permit the county says is issued, one still working its way through.
  const issuedNo = Object.keys(PERMIT_DATES).find((k) => PERMIT_DATES[k].issued !== '')!
  const pendingNo = Object.keys(PERMIT_DATES).find((k) => PERMIT_DATES[k].issued === '')

  it('a C.O. house is co, no matter what the checklist says', () => {
    expect(permitStatus(makeProject({ listStatus: 'CO', permit: '' }), emptyProjectState())).toBe('co')
  })

  it('issued: final step checked, a typed date, or the county snapshot', () => {
    const byStep = emptyProjectState()
    byStep.steps.permit = { issued: { done: true } }
    expect(permitStatus(makeProject({ permit: '' }), byStep)).toBe('issued')

    const byDate = emptyProjectState()
    byDate.permitIssuedDate = '2026-05-01'
    expect(permitStatus(makeProject({ permit: '' }), byDate)).toBe('issued')

    // Nothing ticked in the app, but the county says issued — believe the county.
    expect(permitStatus(makeProject({ permit: issuedNo }), emptyProjectState())).toBe('issued')
  })

  it('blanking the issued date un-says the county (the blank-out escape hatch)', () => {
    const ps = emptyProjectState()
    ps.permitIssuedDate = '' // typed then cleared → county issued date is silenced
    expect(permitStatus(makeProject({ permit: issuedNo }), ps)).toBe('in-review')
  })

  it("Owner/GC lots read not-ours until issued — then they're just issued", () => {
    const ps = emptyProjectState()
    ps.permitResponsible = 'Owner'
    expect(permitStatus(makeProject(), ps)).toBe('not-ours') // even with a permit # on file
    ps.permitIssuedDate = '2026-05-01'
    expect(permitStatus(makeProject(), ps)).toBe('issued')
  })

  it('any evidence of an application means in-review, not not-applied', () => {
    // A checked step…
    const byStep = emptyProjectState()
    byStep.steps.permit = { submitted: { done: true } }
    expect(permitStatus(makeProject({ permit: '' }), byStep)).toBe('in-review')

    // …a permit # on file (the county assigns numbers AT application)…
    expect(permitStatus(makeProject({ permit: 'X-NONE' }), emptyProjectState())).toBe('in-review')

    // …or a county record that isn't issued yet.
    if (pendingNo) {
      expect(permitStatus(makeProject({ permit: pendingNo }), emptyProjectState())).toBe('in-review')
    }
  })

  it('no permit #, no steps, no county record → not applied', () => {
    expect(permitStatus(makeProject({ permit: '' }), emptyProjectState())).toBe('not-applied')
  })

  it('follows an owner-customized permit list (last step = issued)', () => {
    applyStepOverrides({ permit: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })
    const ps = emptyProjectState()
    expect(permitStatus(makeProject({ permit: '' }), ps)).toBe('not-applied')
    ps.steps.permit = { a: { done: true } }
    expect(permitStatus(makeProject({ permit: '' }), ps)).toBe('in-review')
    ps.steps.permit = { a: { done: true }, b: { done: true } }
    expect(permitStatus(makeProject({ permit: '' }), ps)).toBe('issued')
  })
})
