import { describe, it, expect } from 'vitest'
import { leadTimeDaysFor, orderLeadInfo } from './leadTimes'
import type { OrderItem } from '../types'

// The order-by math drives real "Order NOW" alerts on the Today screen, so the
// date arithmetic (month rollover, the ok/soon/late boundaries, and the
// only-toOrder-with-neededBy rule) is worth pinning down. Every test passes a
// fixed `today` so results never depend on when the suite runs.

/** A minimal to-order line — tests override what they care about. */
function order(patch: Partial<OrderItem>): OrderItem {
  return {
    id: 'test',
    category: 'Trusses',
    status: 'toOrder',
    createdAt: '6/1/2026',
    ...patch,
  }
}

describe('leadTimeDaysFor', () => {
  it('returns the tuned number for a known category', () => {
    expect(leadTimeDaysFor('Trusses')).toBe(21)
    expect(leadTimeDaysFor('Cabinets')).toBe(28)
    expect(leadTimeDaysFor('Block')).toBe(7)
  })

  it('falls back to the one-week default for unknown categories', () => {
    expect(leadTimeDaysFor('Custom widget')).toBe(7)
    expect(leadTimeDaysFor('Deliver dumpster')).toBe(7) // site-service action names
  })
})

describe('orderLeadInfo', () => {
  it('counts the lead time back from needed-by, rolling over the month', () => {
    // Trusses (21-day lead) needed Jul 22 → must be ordered by Jul 1.
    const info = orderLeadInfo(order({ neededBy: '2026-07-22' }), '2026-06-01')!
    expect(info.leadTimeDays).toBe(21)
    expect(info.orderBy.getFullYear()).toBe(2026)
    expect(info.orderBy.getMonth()).toBe(6) // July (0-indexed)
    expect(info.orderBy.getDate()).toBe(1) // Jul 22 − 21 days
    expect(info.neededByLabel).toBe('Jul 22')
  })

  it("is 'ok' while the order-by date is more than a week out", () => {
    // order-by Jul 1, today Jun 1 → 30 days of slack.
    const info = orderLeadInfo(order({ neededBy: '2026-07-22' }), '2026-06-01')!
    expect(info.status).toBe('ok')
    expect(info.daysLeft).toBe(30)
  })

  it("turns 'soon' when the order-by date is within 7 days", () => {
    // order-by Jul 1, today Jun 24 → exactly 7 days: the edge of the window.
    const info = orderLeadInfo(order({ neededBy: '2026-07-22' }), '2026-06-24')!
    expect(info.status).toBe('soon')
    expect(info.daysLeft).toBe(7)
  })

  it("still 'soon' (not late) on the order-by day itself — you can order today", () => {
    const info = orderLeadInfo(order({ neededBy: '2026-07-22' }), '2026-07-01')!
    expect(info.status).toBe('soon')
    expect(info.daysLeft).toBe(0)
  })

  it("goes 'late' the day after the order-by date passes", () => {
    const info = orderLeadInfo(order({ neededBy: '2026-07-22' }), '2026-07-02')!
    expect(info.status).toBe('late')
    expect(info.daysLeft).toBe(-1)
  })

  it('uses the fallback lead for a category without a tuned number', () => {
    // Unknown category → 7-day default: needed Jul 10 → order by Jul 3.
    const info = orderLeadInfo(order({ category: 'Custom widget', neededBy: '2026-07-10' }), '2026-06-01')!
    expect(info.leadTimeDays).toBe(7)
    expect(info.orderBy.getDate()).toBe(3)
    expect(info.orderBy.getMonth()).toBe(6) // July
  })

  it('returns null once the order is placed — nothing left to warn about', () => {
    expect(orderLeadInfo(order({ status: 'ordered', neededBy: '2026-07-22' }), '2026-07-02')).toBeNull()
    expect(orderLeadInfo(order({ status: 'installed', neededBy: '2026-07-22' }), '2026-07-02')).toBeNull()
  })

  it('returns null when no needed-by date is set', () => {
    expect(orderLeadInfo(order({}), '2026-07-02')).toBeNull()
  })
})
