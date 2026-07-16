import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildActionCenter, streamActionCounts } from './actionCenter'
import { PROJECTS } from '../data/projects'
import { emptyProjectState } from '../data/seed'
import { makeProject } from './testUtils'
import type { ProjectState, WorkbenchState } from '../types'

// buildActionCenter is THE prioritization — Today, the 🏠 badge, and the
// status report all inherit this one ranking. These tests pin the ordering
// rules down so a future tweak can't quietly bury a real deadline.

describe('buildActionCenter — sewer work reaches Today', () => {
  // Regression guard for the OUR_COURT fix: a Sewer lot's next action
  // ('sweravail'/'swerapply'/'swertap') must count as OUR move so it reaches
  // the Today command center. Before the fix, OUR_COURT.septic had no sewer
  // keys and these silently never surfaced.
  it("surfaces a Sewer lot's next move as a 'septic' stream move", () => {
    const active = PROJECTS.find((p) => p.listStatus !== 'CO' && p.listStatus !== 'Hold')
    expect(active).toBeDefined()
    const ps = emptyProjectState()
    ps.septicSource = 'Sewer' // → nextSepticAction = 'sweravail' (our court)
    const ac = buildActionCenter([active!], () => ps)
    const septicMoves = ac.moves.filter((m) => m.stream === 'septic')
    expect(septicMoves.length).toBeGreaterThan(0)
  })
})

describe('buildActionCenter — deterministic fixtures', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00')) // Monday noon
  })
  afterEach(() => vi.useRealTimers())

  /** Roster + per-project state, in one call. */
  const center = (entries: Array<{ p: ReturnType<typeof makeProject>; ps: ProjectState }>, takeoffs?: WorkbenchState['modelTakeoffs']) =>
    buildActionCenter(
      entries.map((e) => e.p),
      (id) => entries.find((e) => e.p.id === id)!.ps,
      takeoffs,
    )

  it('finished (CO) and parked (Hold) homes surface no construction items', () => {
    const ps = emptyProjectState()
    ps.permitExpiresDate = '2026-06-01' // long expired — would be a crit fire
    const ac = center([
      { p: makeProject({ id: 1, listStatus: 'CO' }), ps },
      { p: makeProject({ id: 2, listStatus: 'Hold' }), ps },
    ])
    expect(ac.attention).toHaveLength(0)
    expect(ac.moves).toHaveLength(0)
    // NOTE (documented behavior): stats.projects counts the whole roster,
    // including CO/Hold — it's "how many houses we track", not "how many active".
    expect(ac.stats.projects).toBe(2)
    expect(ac.stats.allClear).toBe(true)
  })

  it("a C.O. home that's SELLING still fires its shut-off deadline (Hold never does)", () => {
    // The sale workflow runs on finished homes (July 2026): C.O. → under
    // contract → closing. The shut-off deadline is the one alert a C.O.
    // house must still raise — everything else stays quiet.
    const ps = emptyProjectState()
    ps.underContract = true
    ps.closingDate = '2026-07-02' // → shut-off due today (Mon Jul 6)
    ps.permitExpiresDate = '2026-06-01' // expired — must STILL stay silent on a C.O. house
    const ac = center([{ p: makeProject({ id: 1, listStatus: 'CO' }), ps }])
    expect(ac.attention.map((a) => a.kind)).toEqual(['shutoff'])
    expect(ac.moves).toHaveLength(0)
    // A parked (Hold) house is skipped entirely, closing date or not.
    const held = center([{ p: makeProject({ id: 2, listStatus: 'Hold' }), ps }])
    expect(held.attention).toHaveLength(0)
  })

  it('permit expiry: 14-day lookahead window, severity steps at 7/0', () => {
    const mk = (id: number, expires: string) => {
      const ps = emptyProjectState()
      ps.permitExpiresDate = expires
      return { p: makeProject({ id }), ps }
    }
    const ac = center([
      mk(1, '2026-07-20'), // 14 days — last day inside the window → info
      mk(2, '2026-07-21'), // 15 days — outside, must NOT appear
      mk(3, '2026-07-10'), // 4 days → warn
      mk(4, '2026-07-01'), // expired → crit
    ])
    const exp = ac.attention.filter((a) => a.kind === 'expiry')
    expect(exp.map((a) => a.projectId)).not.toContain(2)
    expect(exp.find((a) => a.projectId === 1)?.severity).toBe('info')
    expect(exp.find((a) => a.projectId === 3)?.severity).toBe('warn')
    const expired = exp.find((a) => a.projectId === 4)
    expect(expired?.severity).toBe('crit')
    expect(expired?.text).toBe('Permit EXPIRED')
  })

  it('shut-off: 10-day window, overdue goes crit', () => {
    const mk = (id: number, closing: string) => {
      const ps = emptyProjectState()
      ps.closingDate = closing
      return { p: makeProject({ id }), ps }
    }
    const ac = center([
      mk(1, '2026-07-02'), // → deadline today (Mon Jul 6) → 0d, warn
      mk(2, '2026-06-24'), // → deadline Fri Jun 26 → -10d, crit
      mk(3, '2026-07-15'), // → deadline Fri Jul 17 → 11d, outside the window
    ])
    const so = ac.attention.filter((a) => a.kind === 'shutoff')
    expect(so.map((a) => a.projectId)).not.toContain(3)
    expect(so.find((a) => a.projectId === 1)?.severity).toBe('warn')
    const overdue = so.find((a) => a.projectId === 2)
    expect(overdue?.severity).toBe('crit')
    expect(overdue?.text).toBe('Shut-off OVERDUE')
  })

  it('THE ordering rule: a hard deadline outranks a stall, however old the stall', () => {
    // Project 1: stalled 30 days past threshold (sortDays −30, crit).
    const stalled = emptyProjectState()
    stalled.steps.electric = { verify: { done: true, doneAt: '2026-05-23T12:00:00' } } // 44d at 'submit' (threshold 14)
    // Project 2: permit expired 3 days ago (sortDays −3, crit).
    const expired = emptyProjectState()
    expired.permitExpiresDate = '2026-07-03'

    const ac = center([
      { p: makeProject({ id: 1 }), ps: stalled },
      { p: makeProject({ id: 2 }), ps: expired },
    ])
    expect(ac.attention[0].kind).toBe('expiry') // the deadline wins the top spot
    expect(ac.attention[1].kind).toBe('stale')
    expect(ac.attention[0].severity).toBe('crit')
    expect(ac.attention[1].severity).toBe('crit') // 30 ≥ threshold 14 → crit
  })

  it('severity outranks everything: crit > warn > info across kinds', () => {
    const warnExpiry = emptyProjectState()
    warnExpiry.permitExpiresDate = '2026-07-10' // 4d → warn
    const critStall = emptyProjectState()
    critStall.steps.electric = { verify: { done: true, doneAt: '2026-05-23T12:00:00' } }
    const ac = center([
      { p: makeProject({ id: 1 }), ps: warnExpiry },
      { p: makeProject({ id: 2 }), ps: critStall },
    ])
    // The crit stall beats the warn deadline — staleLast only breaks ties WITHIN a severity.
    expect(ac.attention[0].kind).toBe('stale')
    expect(ac.attention[1].kind).toBe('expiry')
  })

  it('missing takeoffs on an ISSUED permit floats above every deadline', () => {
    const ps = emptyProjectState()
    ps.steps.permit = { issued: { done: true } } // permit issued
    ps.permitExpiresDate = '2026-07-01' // AND expired — a crit deadline to beat
    const ac = center([{ p: makeProject({ id: 1, model: 'A' }), ps }], {}) // model A has takeoffs to miss
    expect(ac.attention[0].kind).toBe('takeoff') // sortDays −9999: nothing outranks it
    expect(ac.attention[0].severity).toBe('crit')
  })

  it('missing takeoffs BEFORE issuance is just an info move (gather them)', () => {
    const ac = center([{ p: makeProject({ id: 1, model: 'A' }), ps: emptyProjectState() }], {})
    expect(ac.attention.filter((a) => a.kind === 'takeoff')).toHaveLength(0)
    expect(ac.moves[0].kind).toBe('takeoff') // and moves cluster takeoffs first
  })

  it('lead times: late → crit, soon → warn, comfortable → silent', () => {
    const ps = emptyProjectState()
    ps.orders = [
      { id: 'a', category: 'Trusses', status: 'toOrder', neededBy: '2026-07-10', createdAt: '' }, // order-by Jun 19 — missed
      { id: 'b', category: 'Trusses', status: 'toOrder', neededBy: '2026-08-01', createdAt: '' }, // order-by Jul 11 — 5d out
      { id: 'c', category: 'Trusses', status: 'toOrder', neededBy: '2026-09-01', createdAt: '' }, // months of slack
      { id: 'd', category: 'Trusses', status: 'ordered', neededBy: '2026-07-10', createdAt: '' }, // already ordered — no alarm
    ]
    const ac = center([{ p: makeProject({ id: 1 }), ps }])
    const lead = ac.attention.filter((a) => a.kind === 'leadtime')
    expect(lead).toHaveLength(2)
    expect(lead[0].severity).toBe('crit') // the missed one ranks first
    expect(lead[0].text).toContain('Order NOW')
    expect(lead[1].severity).toBe('warn')
    // …and the to-order pile still shows as ONE move with the count:
    const orderMove = ac.moves.find((m) => m.kind === 'order')
    expect(orderMove?.text).toBe('Order 3 materials')
    expect(ac.stats.toOrder).toBe(3)
  })

  it('moves cluster by kind: takeoffs, then to-dos, then the shopping list', () => {
    const ps = emptyProjectState()
    ps.orders = [{ id: 'a', category: 'Block', status: 'toOrder', createdAt: '' }]
    const ac = center([{ p: makeProject({ id: 1, model: 'A' }), ps }], {})
    const kinds = ac.moves.map((m) => m.kind)
    // takeoff first, order last, todos in between
    expect(kinds[0]).toBe('takeoff')
    expect(kinds[kinds.length - 1]).toBe('order')
    expect(kinds).toContain('todo')
  })
})

describe('streamActionCounts — the tab badges', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('counts DISTINCT projects per stream; fire only on true fires', () => {
    const expired = emptyProjectState()
    expired.permitExpiresDate = '2026-07-01' // permit fire + the usual fresh-project moves
    const counts = streamActionCounts([makeProject({ id: 1 })], () => expired)
    expect(counts.permit.fire).toBe(true)
    expect(counts.permit.count).toBe(1) // one project, however many permit items
    expect(counts.electric.fire).toBe(false) // 'apply' is a move, not a fire
    expect(counts.electric.count).toBe(1)
  })
})
