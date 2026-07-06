import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { addBusinessDays, shutoffFor } from './shutoff'
import { emptyProjectState } from '../data/seed'

// The shut-off deadline = 2 BUSINESS days after closing. Weekend-skipping math
// drives a real deadline on the Today screen, so it's worth pinning down.
describe('addBusinessDays', () => {
  it('skips the weekend: Friday + 1 business day = Monday', () => {
    const d = addBusinessDays('2026-06-26', 1) // Fri Jun 26 2026
    expect(d.getDay()).toBe(1) // Monday
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5) // June (0-indexed)
    expect(d.getDate()).toBe(29) // jumped over Sat 27 + Sun 28
  })

  it('counts only weekdays: Monday + 3 business days = Thursday', () => {
    const d = addBusinessDays('2026-06-22', 3) // Mon Jun 22 2026
    expect(d.getDay()).toBe(4) // Thursday
    expect(d.getDate()).toBe(25)
  })

  it('a weekend CLOSING still works: Saturday + 2 business days = Tuesday', () => {
    // Closings do land on Saturdays. The walk starts from the closing date
    // itself, so Sat → (Sun skipped) Mon = 1, Tue = 2.
    const d = addBusinessDays('2026-06-27', 2) // Sat Jun 27 2026
    expect(d.getDay()).toBe(2) // Tuesday
    expect(d.getDate()).toBe(30)
  })

  it('rolls across a month boundary', () => {
    const d = addBusinessDays('2026-06-30', 2) // Tue Jun 30
    expect(d.getMonth()).toBe(6) // July
    expect(d.getDate()).toBe(2) // Wed 1, Thu 2
  })

  it('rolls across a year boundary (documents: NO holiday awareness)', () => {
    // Thu Dec 31 2026 + 2 business days = Mon Jan 4 2027 — and note it happily
    // counts Fri Jan 1 (New Year's Day) as a business day. Holidays are a KNOWN
    // judgment call, not a bug: see docs/BRAINS.md. If that ever bites, this is
    // the test to update alongside the fix.
    const d = addBusinessDays('2026-12-31', 2)
    expect(d.getFullYear()).toBe(2027)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(4)
  })
})

describe('shutoffFor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns null with no closing date, and null once transferred', () => {
    vi.setSystemTime(new Date('2026-07-06T12:00:00'))
    const ps = emptyProjectState()
    expect(shutoffFor(ps)).toBeNull()
    ps.closingDate = '2026-07-02'
    ps.transferred = true
    expect(shutoffFor(ps)).toBeNull()
  })

  it('"due today" reads as 0 days left — even late in the evening', () => {
    // Closing Thu Jul 2 → +2 business days (Fri 3, Mon 6) = Mon Jul 6.
    const ps = emptyProjectState()
    ps.closingDate = '2026-07-02'

    vi.setSystemTime(new Date('2026-07-06T08:00:00'))
    expect(shutoffFor(ps)?.daysLeft).toBe(0)

    // The same all-day answer at 11:30 PM. (Math.ceil over a negative
    // fraction-of-a-day is what makes this hold — pin it so a refactor to
    // floor/round can't silently flip "due today" into "overdue" at 12:01 AM.)
    vi.setSystemTime(new Date('2026-07-06T23:30:00'))
    expect(shutoffFor(ps)?.daysLeft).toBe(0)
  })

  it('counts down day by day and goes NEGATIVE once missed', () => {
    const ps = emptyProjectState()
    ps.closingDate = '2026-07-02' // → deadline Mon Jul 6

    vi.setSystemTime(new Date('2026-07-03T12:00:00')) // Friday before
    expect(shutoffFor(ps)?.daysLeft).toBe(3) // calendar days to Monday

    vi.setSystemTime(new Date('2026-07-08T12:00:00')) // two days past
    expect(shutoffFor(ps)?.daysLeft).toBe(-2)
  })

  it('the deadline for a Thursday closing lands on Monday (weekend skipped)', () => {
    vi.setSystemTime(new Date('2026-06-26T12:00:00'))
    const ps = emptyProjectState()
    ps.closingDate = '2026-06-25' // Thu Jun 25 → Fri 26, Mon 29
    const so = shutoffFor(ps)
    expect(so?.daysLeft).toBe(3)
    expect(so?.date).toContain('Mon')
  })
})
