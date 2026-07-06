import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { permitExpiresOf, permitExpiryFor, permitExpiringSoon } from './permitExpiry'
import { emptyProjectState } from '../data/seed'
import { makeProject } from './testUtils'
import { PERMIT_DATES } from '../data/permitDates'

// permitExpiry drives the "permit expiring" alerts — a lapsed building permit
// stalls the whole house, so the day math and the data precedence both matter.
describe('permitExpiresOf — where the expiration date comes from', () => {
  it('a typed-in date beats the county snapshot', () => {
    // Use a real permit# from permitDates.ts so the county value exists.
    const permit = Object.keys(PERMIT_DATES)[0]
    const p = makeProject({ permit })
    const ps = emptyProjectState()
    expect(permitExpiresOf(p, ps)).toBe(PERMIT_DATES[permit].expires) // county default
    ps.permitExpiresDate = '2027-01-15'
    expect(permitExpiresOf(p, ps)).toBe('2027-01-15') // override wins
  })

  it('clearing the field to "" silences the alert even when county data exists', () => {
    // DELIBERATE escape hatch (see docs/BRAINS.md): '' is a value, so ?? keeps
    // it — the owner can blank the field to turn the alert off for one house.
    const permit = Object.keys(PERMIT_DATES)[0]
    const p = makeProject({ permit })
    const ps = emptyProjectState()
    ps.permitExpiresDate = ''
    expect(permitExpiresOf(p, ps)).toBe('')
    expect(permitExpiryFor(p, ps)).toBeNull()
  })

  it('unknown permit + nothing typed = no date, no alert', () => {
    const p = makeProject() // permit 'X-NONE' is not in PERMIT_DATES
    const ps = emptyProjectState()
    expect(permitExpiresOf(p, ps)).toBe('')
    expect(permitExpiryFor(p, ps)).toBeNull()
  })
})

describe('permitExpiryFor / permitExpiringSoon — the countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00')) // Monday noon
  })
  afterEach(() => vi.useRealTimers())

  const withExpiry = (expires: string) => {
    const ps = emptyProjectState()
    ps.permitExpiresDate = expires
    return { p: makeProject(), ps }
  }

  it('expires today → 0 days left, all day long', () => {
    const { p, ps } = withExpiry('2026-07-06')
    expect(permitExpiryFor(p, ps)?.daysLeft).toBe(0)
    vi.setSystemTime(new Date('2026-07-06T23:45:00'))
    expect(permitExpiryFor(p, ps)?.daysLeft).toBe(0)
  })

  it('counts calendar days forward, and negative once expired', () => {
    expect(permitExpiryFor(...args(withExpiry('2026-07-07')))?.daysLeft).toBe(1)
    expect(permitExpiryFor(...args(withExpiry('2026-07-20')))?.daysLeft).toBe(14)
    expect(permitExpiryFor(...args(withExpiry('2026-07-01')))?.daysLeft).toBe(-5)
  })

  it('"expiring soon" = within 7 days (7 counts, 8 does not), or already expired', () => {
    expect(permitExpiringSoon(...args(withExpiry('2026-07-13')))).toBe(true) // 7 days
    expect(permitExpiringSoon(...args(withExpiry('2026-07-14')))).toBe(false) // 8 days
    expect(permitExpiringSoon(...args(withExpiry('2026-06-01')))).toBe(true) // long expired
  })

  /** Spread the {p, ps} pair into positional args. */
  function args(x: { p: ReturnType<typeof makeProject>; ps: ReturnType<typeof emptyProjectState> }) {
    return [x.p, x.ps] as const
  }
})
