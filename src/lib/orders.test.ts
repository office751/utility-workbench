import { describe, it, expect } from 'vitest'
import { isMaterialsDone, ordersSummary, parseQuickAdd, toOrderCount } from './orders'
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
    expect(r.categories).toEqual(['Block'])
  })

  it('street-suffix noise words (SW, Pl, Rd…) never influence the match', () => {
    const r = parseQuickAdd('sw pl rd', roster)
    expect(r.matches).toHaveLength(0)
    expect(r.confident).toBe(false)
  })

  it("understands Josh's spellings: lentil→Lintels, sand→Lintels, slap→Slab", () => {
    expect(parseQuickAdd('lentil delivery', roster).categories).toEqual(['Lintels'])
    expect(parseQuickAdd('need sand', roster).categories).toEqual(['Lintels']) // sand ships with lintels
    expect(parseQuickAdd('slap package', roster).categories).toEqual(['Slab package'])
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
