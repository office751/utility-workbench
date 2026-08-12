import { describe, it, expect } from 'vitest'
import { collectPendingOrders, isMaterialsDone, mergeBlockLintels, ordersSummary, parseQuickAdd, toOrderCount } from './orders'
import { emptyProjectState } from '../data/seed'
import { makeProject } from './testUtils'
import type { OrderItem, OrderStatus } from '../types'

const order = (status: OrderStatus, category = 'Block'): OrderItem => ({
  id: `${category}-${status}-${Math.random()}`,
  category,
  status,
  createdAt: '',
})

describe('order summaries', () => {
  it('walks the states: nothing → to order → all ordered → all installed', () => {
    const ps = emptyProjectState()
    expect(ordersSummary(ps)).toBe('no orders yet')
    ps.orders = [order('toOrder'), order('ordered')]
    expect(ordersSummary(ps)).toBe('1 to order')
    expect(toOrderCount(ps)).toBe(1)
    ps.orders = [order('ordered'), order('delivered')]
    expect(ordersSummary(ps)).toBe('all ordered')
    ps.orders = [order('installed'), order('installed')]
    expect(ordersSummary(ps)).toBe('all installed ✓')
  })

  it('materials are never "done" with zero orders (empty ≠ finished)', () => {
    const ps = emptyProjectState()
    expect(isMaterialsDone(ps)).toBe(false)
    ps.orders = [order('installed')]
    expect(isMaterialsDone(ps)).toBe(true)
    ps.orders.push(order('delivered'))
    expect(isMaterialsDone(ps)).toBe(false)
  })
})

// parseQuickAdd is what turns "5560 trusses and block" (typed or pasted from
// Josh's text) into project + categories. Mis-matching a HOUSE would order
// materials to the wrong address, so the scoring rules get pinned here.
describe('parseQuickAdd', () => {
  const p1 = makeProject({ id: 1, address: '5560 SW 88th Pl', subdivision: 'Marion Oaks' })
  const p2 = makeProject({ id: 2, address: '123 Juniper Trl', subdivision: 'Ocala Waterway' })
  const p3 = makeProject({ id: 3, address: 'TBD Hickory Rd', subdivision: 'Marion Oaks' })
  const roster = [p1, p2, p3]

  it('a house number + item is the happy path: confident match + category', () => {
    const r = parseQuickAdd('5560 trusses', roster)
    expect(r.matches[0]).toBe(p1)
    expect(r.confident).toBe(true)
    expect(r.categories).toEqual(['Trusses'])
  })

  it('house numbers count DOUBLE — they beat shared subdivision words', () => {
    const r = parseQuickAdd('marion oaks 5560', roster)
    // p1 scores 5560(×2) + marion + oaks = 4; p3 scores marion + oaks = 2.
    expect(r.matches[0]).toBe(p1)
    expect(r.confident).toBe(true)
  })

  it('a subdivision two houses share is a TIE — never auto-pick', () => {
    const r = parseQuickAdd('marion oaks block', roster)
    expect(r.matches).toHaveLength(2)
    expect(r.confident).toBe(false) // top score equals #2 — ask, don't guess
    expect(r.categories).toEqual(['Block & Lintels'])
  })

  it('street-suffix noise words (SW, Pl, Rd…) never influence the match', () => {
    const r = parseQuickAdd('sw pl rd', roster)
    expect(r.matches).toHaveLength(0)
    expect(r.confident).toBe(false)
  })

  it("understands Josh's spellings: lentil/sand→Block & Lintels, slap→Slab", () => {
    expect(parseQuickAdd('lentil delivery', roster).categories).toEqual(['Block & Lintels'])
    expect(parseQuickAdd('need sand', roster).categories).toEqual(['Block & Lintels']) // sand ships with lintels
    expect(parseQuickAdd('slap package', roster).categories).toEqual(['Slab package'])
  })

  it('block AND lintels in one text collapse to the ONE combined category', () => {
    expect(parseQuickAdd('block and lintels on site', roster).categories).toEqual(['Block & Lintels'])
  })

  it('catches several categories in one message, de-duplicated', () => {
    const r = parseQuickAdd('5560 cabinets, lights and more cabinet stuff', roster)
    expect(r.categories.sort()).toEqual(['Cabinets', 'Lighting package'])
  })

  it('an unmatchable message returns empty-handed rather than guessing', () => {
    const r = parseQuickAdd('call the county about the fence', roster)
    expect(r.matches).toHaveLength(0)
    expect(r.categories).toHaveLength(0)
  })
})

// The Tasks tab's "Orders to place" list: every to-order material across all
// live houses, most-urgent first. Ordering to the wrong priority (or leaking a
// finished house) matters, so pin the collection + sort here.
describe('collectPendingOrders', () => {
  const withOrders = (id: number, address: string, orders: OrderItem[], over: object = {}) => {
    const p = makeProject({ id, address, ...over })
    const ps = emptyProjectState()
    ps.orders = orders
    return { p, ps }
  }

  it('gathers only to-order items, most-urgent first, skipping CO/Hold homes', () => {
    // Far-past needed-by → order-by long gone → 'late' (sorts first). Far-future
    // → 'ok' (sorts after). No needed-by → no deadline → sinks to the bottom.
    const past = withOrders(1, 'Past House', [
      { id: 'a', category: 'Trusses', status: 'toOrder', neededBy: '2020-01-01', createdAt: '' },
    ])
    const future = withOrders(2, 'Future House', [
      { id: 'b', category: 'Cabinets', status: 'toOrder', neededBy: '2099-01-01', createdAt: '' },
      { id: 'c', category: 'Block', status: 'ordered', createdAt: '' }, // already ordered → excluded
    ])
    const undated = withOrders(3, 'Undated House', [
      { id: 'd', category: 'Windows', status: 'toOrder', createdAt: '' }, // no needed-by
    ])
    const done = withOrders(4, 'Done House', [{ id: 'e', category: 'Flooring', status: 'toOrder', createdAt: '' }], {
      listStatus: 'CO', // finished house → skipped entirely
    })

    const roster = [future.p, undated.p, past.p, done.p]
    const byId = new Map([
      [1, past.ps],
      [2, future.ps],
      [3, undated.ps],
      [4, done.ps],
    ])
    const pending = collectPendingOrders(roster, (id) => byId.get(id)!)

    expect(pending.map((o) => o.category)).toEqual(['Trusses', 'Cabinets', 'Windows'])
    expect(pending[0].projectId).toBe(1)
    expect(pending[0].lead?.status).toBe('late')
    expect(pending[2].lead).toBeNull() // undated sinks last
  })
})

// mergeBlockLintels runs on EVERY load (migrate) against live production
// orders, so its "never rewrite history" promise is worth pinning hard.
describe('mergeBlockLintels', () => {
  const row = (category: string, status: OrderStatus, patch: Partial<OrderItem> = {}): OrderItem => ({
    id: `${category}-id`,
    category,
    status,
    createdAt: '6/1/2026',
    ...patch,
  })

  it('merges a still-to-order Block + Lintels pair into ONE combined row', () => {
    const merged = mergeBlockLintels([
      row('Trusses', 'toOrder'),
      row('Block', 'toOrder', { neededBy: '2026-09-10' }),
      row('Lintels', 'toOrder', { neededBy: '2026-09-01', vendor: 'Marion' }),
    ])
    expect(merged.map((o) => o.category)).toEqual(['Trusses', 'Block & Lintels'])
    const combined = merged[1]
    expect(combined.id).toBe('Block-id') // keeps the Block row's identity
    expect(combined.neededBy).toBe('2026-09-01') // EARLIEST deadline wins
    expect(combined.vendor).toBe('Marion') // hand-typed vendor survives
  })

  it('renames a lone to-order Block (or Lintels) row when its partner is absent', () => {
    expect(mergeBlockLintels([row('Block', 'toOrder')])[0].category).toBe('Block & Lintels')
    expect(mergeBlockLintels([row('Lintels', 'toOrder')])[0].category).toBe('Block & Lintels')
  })

  it('NEVER rewrites history: advanced rows and half-advanced pairs stay as-is', () => {
    // Block already ordered, lone → untouched (renaming would claim it's pending).
    const ordered = [row('Block', 'ordered')]
    expect(mergeBlockLintels(ordered)).toEqual(ordered)
    // Half-advanced pair: block ordered, lintels still pending → BOTH keep
    // their original rows (their old names still map to the right vendors).
    const half = [row('Block', 'ordered'), row('Lintels', 'toOrder')]
    expect(mergeBlockLintels(half)).toEqual(half)
    // Lone to-order Block whose Lintels partner is already installed →
    // untouched (a combined label would claim lintels are still pending).
    const partnerDone = [row('Block', 'toOrder'), row('Lintels', 'installed')]
    expect(mergeBlockLintels(partnerDone)).toEqual(partnerDone)
  })

  it('is idempotent and leaves legacy-free lists alone (same reference back)', () => {
    const once = mergeBlockLintels([row('Block', 'toOrder'), row('Lintels', 'toOrder')])
    expect(mergeBlockLintels(once)).toBe(once) // second pass: nothing to do
    const clean = [row('Trusses', 'toOrder')]
    expect(mergeBlockLintels(clean)).toBe(clean)
  })
})
