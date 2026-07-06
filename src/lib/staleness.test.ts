import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { stalenessFor, isStale } from './staleness'
import { emptyProjectState } from '../data/seed'
import { makeProject } from './testUtils'

// staleness answers "has this project gone quiet at its current stage?" —
// it feeds the ⚠ Gone-quiet section on Today. The two rules that matter most:
//   1. No machine timestamp → return null ("can't tell" beats guessing).
//   2. Age is measured from the NEWEST doneAt in the stream.
describe('stalenessFor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  const p = makeProject()

  it('returns null when no step has a real doneAt (seeded/county data)', () => {
    const ps = emptyProjectState()
    // County-inferred steps carry a display `date` but no machine `doneAt` —
    // the honest-limitation rule says those are NOT measurable.
    ps.steps.electric = { verify: { done: true, date: '(county)' } }
    expect(stalenessFor('electric', p, ps)).toBeNull()
  })

  it('returns null when the stream is complete or not a lifecycle', () => {
    const ps = emptyProjectState()
    ps.steps.septic = {
      sweravail: { done: true }, swerapply: { done: true },
      swertap: { done: true }, swerconn: { done: true },
    }
    ps.septicSource = 'Sewer'
    expect(stalenessFor('septic', p, ps)).toBeNull() // all done
    expect(stalenessFor('materials', p, ps)).toBeNull() // not a lifecycle
  })

  it('flags the FIRST pending step, aged from the newest doneAt', () => {
    const ps = emptyProjectState()
    ps.steps.electric = {
      verify: { done: true, doneAt: '2026-06-20T08:00:00' }, // 16 days ago
    }
    const info = stalenessFor('electric', p, ps)
    expect(info?.stepId).toBe('submit') // the step we're waiting on
    expect(info?.daysAtStage).toBe(16)
    expect(info?.threshold).toBe(14) // DEFAULT_STALE_DAYS
    expect(info?.overdueDays).toBe(2)
    expect(isStale(info)).toBe(true)
  })

  it('a NEWER completion resets the clock (newest doneAt wins)', () => {
    const ps = emptyProjectState()
    ps.steps.electric = {
      verify: { done: true, doneAt: '2026-06-01T08:00:00' }, // 35 days ago
      submit: { done: true, doneAt: '2026-07-01T08:00:00' }, // 5 days ago ← newest
    }
    const info = stalenessFor('electric', p, ps)
    expect(info?.stepId).toBe('deposit')
    expect(info?.daysAtStage).toBe(5)
    expect(isStale(info)).toBe(false) // 5 < 14 — not quiet yet
  })

  it('slow-by-nature steps use their per-step threshold, not the default', () => {
    const ps = emptyProjectState()
    ps.steps.electric = {
      verify: { done: true, doneAt: '2026-06-01T08:00:00' },
      submit: { done: true, doneAt: '2026-06-01T08:00:00' },
      deposit: { done: true, doneAt: '2026-06-01T08:00:00' }, // 35 days ago
    }
    const info = stalenessFor('electric', p, ps)
    expect(info?.stepId).toBe('engineer')
    expect(info?.threshold).toBe(30) // engineers take a month — tuned override
    expect(info?.overdueDays).toBe(5) // 35 − 30: barely over, would show warn
  })

  it("permit 'corrections' is never the step you're waiting on", () => {
    const ps = emptyProjectState()
    ps.steps.permit = {
      submitted: { done: true, doneAt: '2026-06-01T08:00:00' },
      review: { done: true, doneAt: '2026-06-10T08:00:00' },
      // 'corrections' NOT done — but it's an optional aside, so the pending
      // step must be 'approved', not 'corrections'.
    }
    expect(stalenessFor('permit', p, ps)?.stepId).toBe('approved')
  })

  it('an unparseable doneAt is ignored rather than poisoning the math', () => {
    const ps = emptyProjectState()
    ps.steps.electric = { verify: { done: true, doneAt: 'not-a-date' } }
    expect(stalenessFor('electric', p, ps)).toBeNull()
  })
})
