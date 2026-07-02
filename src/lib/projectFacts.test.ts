import { describe, it, expect } from 'vitest'
import { applyFactsPatch, hasManualPermitEdits, shouldRederivePermitSteps } from './projectFacts'
import { emptyProjectState } from '../data/seed'
import type { Project, StepState, WorkbenchState } from '../types'

/* ------------------------- tiny fixtures ------------------------- */

/** A complete Project with sensible defaults; override what a test needs. */
function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 1,
    address: '123 SW Test Ave',
    city: 'Ocala',
    zip: '34473',
    model: 'F-LH',
    parcel: '8011-1376-25',
    subdivision: 'Marion Oaks Unit 11',
    electricCo: 'SECO',
    permit: 'BLDR-99-01-00001', // BLDR format = "in review" when inferred
    workOrder: '',
    serviceType: 'OH',
    listStatus: 'NotApplied',
    engineer: '',
    waterSource: 'Well',
    ...over,
  }
}

/** A minimal whole-app state around one project. */
function makeState(p: Project, permitSteps: Record<string, StepState> = {}): WorkbenchState {
  const ps = emptyProjectState()
  ps.steps.permit = permitSteps
  return { roster: [p], projects: { [p.id]: ps }, tasks: [] }
}

const county: StepState = { done: true, date: '(county)' }
const inferred: StepState = { done: true, date: '(inferred)' }
const manual: StepState = { done: true, date: '6/30/2026' } // a real click

/* ------------------------- the decision ------------------------- */

describe('hasManualPermitEdits()', () => {
  it('machine markers do NOT count as manual', () => {
    expect(hasManualPermitEdits({})).toBe(false)
    expect(hasManualPermitEdits({ submitted: county, review: inferred })).toBe(false)
  })

  it('a real (clicked) date counts as manual', () => {
    expect(hasManualPermitEdits({ submitted: county, issued: manual })).toBe(true)
  })

  it("other human markers (a C.O.'d home) count as manual too", () => {
    expect(hasManualPermitEdits({ issued: { done: true, date: '(C.O.)' } })).toBe(true)
  })
})

describe('shouldRederivePermitSteps()', () => {
  it('no permit in the patch → never', () => {
    expect(shouldRederivePermitSteps('A', undefined, {})).toBe(false)
  })
  it('permit unchanged → never', () => {
    expect(shouldRederivePermitSteps('A', 'A', { submitted: manual })).toBe(false)
  })
  it('permit changed + checklist still machine-derived → yes', () => {
    expect(shouldRederivePermitSteps('A', 'B', { submitted: inferred })).toBe(true)
  })
  it('permit changed but steps were hand-toggled → hands off', () => {
    expect(shouldRederivePermitSteps('A', 'B', { submitted: manual })).toBe(false)
  })
})

/* ------------------------- the full patch ------------------------- */

describe('applyFactsPatch()', () => {
  it('edits only the targeted project and trims strings', () => {
    const p = makeProject()
    const next = applyFactsPatch(makeState(p), 1, { address: '  456 NW Fixed St  ' })
    expect(next.roster[0].address).toBe('456 NW Fixed St')
    expect(next.roster[0].city).toBe('Ocala') // untouched field survives
  })

  it('returns the SAME state object for a no-op patch (no re-render, no save)', () => {
    const p = makeProject()
    const prev = makeState(p)
    // same value, and same value with only whitespace added — both no-ops
    expect(applyFactsPatch(prev, 1, { address: p.address })).toBe(prev)
    expect(applyFactsPatch(prev, 1, { address: `  ${p.address}  ` })).toBe(prev)
  })

  it('ignores an unknown project id', () => {
    const prev = makeState(makeProject())
    expect(applyFactsPatch(prev, 999, { address: 'nope' })).toBe(prev)
  })

  it('never lets a patch change the project id (identity = saved progress)', () => {
    const prev = makeState(makeProject())
    const next = applyFactsPatch(prev, 1, { id: 42, address: 'moved' } as Partial<Project>)
    expect(next.roster[0].id).toBe(1)
    expect(next.roster[0].address).toBe('moved')
  })

  it('re-derives the permit checklist when the permit # changes (machine-derived)', () => {
    const prev = makeState(makeProject(), { submitted: inferred, review: inferred })
    // all-digits permit = issued, per inferPermitSteps' format fallback
    const next = applyFactsPatch(prev, 1, { permit: '2099123456' })
    expect(next.roster[0].permit).toBe('2099123456')
    expect(next.projects[1].steps.permit.issued?.done).toBe(true)
    expect(next.projects[1].steps.permit.issued?.date).toBe('(inferred)')
  })

  it('leaves a hand-toggled checklist alone on a permit change', () => {
    const steps = { submitted: manual }
    const prev = makeState(makeProject(), steps)
    const next = applyFactsPatch(prev, 1, { permit: '2099123456' })
    expect(next.roster[0].permit).toBe('2099123456') // fact still updates…
    expect(next.projects[1].steps.permit).toEqual(steps) // …checklist untouched
  })

  it('does not re-derive when the permit # is not part of the patch', () => {
    const prev = makeState(makeProject(), { submitted: inferred })
    const next = applyFactsPatch(prev, 1, { address: 'new addr' })
    expect(next.projects[1].steps.permit).toEqual({ submitted: inferred })
    expect(next.projects[1]).toBe(prev.projects[1]) // progress object reused as-is
  })
})
