import { describe, it, expect } from 'vitest'
import { CAUGHT_UP_DATE, catchUpPlan } from './catchup'
import { ELECTRIC_STEPS, PERMIT_STEPS } from '../data/lifecycles'
import { hasManualPermitEdits } from './projectFacts'

// catchUpPlan answers "does this checklist have a GAP worth closing?" — a
// later step checked while earlier ones aren't (houses that predate the app).
// The rules that matter:
//   1. Anchor = the LAST checked step; targets = unchecked steps before it.
//   2. A normally-progressing list (checked prefix, unchecked tail) is NOT a
//      gap — the affordance must never nag ordinary houses.
//   3. Permit 'corrections' is never a target (optional "if any" aside).
describe('catchUpPlan', () => {
  it('returns null when nothing is checked', () => {
    expect(catchUpPlan(ELECTRIC_STEPS, {}, 'electric')).toBeNull()
  })

  it('returns null when only the FIRST step is checked (nothing before it)', () => {
    const bucket = { verify: { done: true } }
    expect(catchUpPlan(ELECTRIC_STEPS, bucket, 'electric')).toBeNull()
  })

  it('returns null for a normally-progressing list (checked prefix, unchecked tail)', () => {
    const bucket = {
      verify: { done: true },
      submit: { done: true },
      deposit: { done: true },
    }
    expect(catchUpPlan(ELECTRIC_STEPS, bucket, 'electric')).toBeNull()
  })

  it('offers every unchecked step before the last checked one', () => {
    // The pre-app classic: someone ticks "Power ON" on a house finished last
    // year — all 9 earlier steps are the gap.
    const bucket = { power: { done: true } }
    const plan = catchUpPlan(ELECTRIC_STEPS, bucket, 'electric')
    expect(plan?.anchor.id).toBe('power')
    expect(plan?.targets.map((s) => s.id)).toEqual([
      'verify', 'submit', 'deposit', 'engineer', 'rough',
      'fieldsched', 'fielddone', 'meternotify', 'meter',
    ])
  })

  it('anchors on the LAST checked step and skips already-checked ones', () => {
    const bucket = {
      verify: { done: true },
      deposit: { done: true }, // last checked — 'submit' above it was missed
    }
    const plan = catchUpPlan(ELECTRIC_STEPS, bucket, 'electric')
    expect(plan?.anchor.id).toBe('deposit')
    expect(plan?.targets.map((s) => s.id)).toEqual(['submit'])
  })

  it('an unchecked step AFTER the anchor is not a target (still genuinely pending)', () => {
    const bucket = { meter: { done: true } }
    const plan = catchUpPlan(ELECTRIC_STEPS, bucket, 'electric')
    // 'power' comes after 'meter' — it stays pending, not caught up.
    expect(plan?.targets.some((s) => s.id === 'power')).toBe(false)
  })

  it("permit 'corrections' is never a target — it's an optional aside", () => {
    const bucket = { issued: { done: true, date: '(county)' } }
    const plan = catchUpPlan(PERMIT_STEPS, bucket, 'permit')
    expect(plan?.anchor.id).toBe('issued')
    expect(plan?.targets.map((s) => s.id)).toEqual(['submitted', 'review', 'approved'])
  })

  it("permit with ONLY corrections as the gap → null (nothing tickable)", () => {
    const bucket = {
      submitted: { done: true },
      review: { done: true },
      approved: { done: true }, // corrections (before 'approved') unchecked — fine
    }
    expect(catchUpPlan(PERMIT_STEPS, bucket, 'permit')).toBeNull()
  })

  it("'corrections' filtering is permit-only — a custom list elsewhere keeps its ids", () => {
    // An owner-edited electric list could name a step 'corrections'; only the
    // permit stream's aside gets the special treatment.
    const custom = [
      { id: 'corrections', label: 'Fix-ups' },
      { id: 'final', label: 'Final' },
    ]
    const plan = catchUpPlan(custom, { final: { done: true } }, 'electric')
    expect(plan?.targets.map((s) => s.id)).toEqual(['corrections'])
  })
})

describe('CAUGHT_UP_DATE sentinel', () => {
  it('is NOT a parseable date — backfillDoneAt must never mint a doneAt from it', () => {
    // Invariant 3: a caught-up step has no machine timestamp, so staleness
    // says "can't tell" instead of pretending old work happened today.
    expect(Number.isNaN(Date.parse(CAUGHT_UP_DATE))).toBe(true)
  })

  it('DOES count as a manual permit edit — county re-derive keeps its hands off', () => {
    const permitSteps = { submitted: { done: true, date: CAUGHT_UP_DATE } }
    expect(hasManualPermitEdits(permitSteps)).toBe(true)
  })
})
