import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildStatusReport, projectStatusVars } from './statusReport'
import { buildActionCenter } from './actionCenter'
import { emptyProjectState } from '../data/seed'
import { makeProject } from './testUtils'
import { DEFAULT_STATUS_SUBJECT } from './templates'
import type { ProjectState } from '../types'

// statusReport turns a set of houses into a shareable status email. It's the
// customer/investor-facing generator, and its {{nextAction}} headline is
// supposed to inherit the SAME buildActionCenter ranking as the Today screen
// (BRAINS.md global invariant #1 — "one prioritization, never two"). It had no
// tests; these pin the per-house token bag and the report framing so a future
// tweak can't quietly send a client the wrong "next step".

// Both the subject stamp (new Date().toLocaleDateString()) and the nextAction
// headline (buildActionCenter's deadline math) read the clock, so the whole
// file runs on a fixed fake time — same Monday-noon anchor the actionCenter
// tests use. (BRAINS.md: clock-dependent brains use fake timers, never the
// real clock.)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-06T12:00:00'))
})
afterEach(() => vi.useRealTimers())

// A getPS resolver from (project, state) pairs — the exact shape the report
// expects (it looks each house's saved state up by id).
type Entry = { p: ReturnType<typeof makeProject>; ps: ProjectState }
const resolver = (entries: Entry[]) => (id: number) =>
  entries.find((e) => e.p.id === id)!.ps

describe('projectStatusVars — the per-house {{token}} bag', () => {
  it('a pending stream shows its next action; a finished one reads "✓ Complete"', () => {
    // Water is the cheapest done/pending pair: a Well lot tracks one step.
    const pending = makeProject({ waterSource: 'Well' })
    const psPending = emptyProjectState()
    const vPending = projectStatusVars(pending, psPending, () => psPending)
    expect(vPending.water).not.toBe('✓ Complete') // still an open move
    expect(vPending.water.length).toBeGreaterThan(0) // never blank — line() falls back to '—'

    const psDone = emptyProjectState()
    psDone.steps.water['wdrilled'] = { done: true } // well installed → stream done
    const vDone = projectStatusVars(pending, psDone, () => psDone)
    expect(vDone.water).toBe('✓ Complete')
  })

  it('status maps listStatus to the human word (C.O. / ON HOLD / Active)', () => {
    const ps = emptyProjectState()
    expect(projectStatusVars(makeProject({ listStatus: 'CO' }), ps, () => ps).status).toBe('C.O.')
    expect(projectStatusVars(makeProject({ listStatus: 'Hold' }), ps, () => ps).status).toBe('ON HOLD')
    expect(projectStatusVars(makeProject({ listStatus: '' }), ps, () => ps).status).toBe('Active')
  })

  it('septic_type reflects source (Sewer) then system (INRB), else plain Septic', () => {
    const p = makeProject()
    const plain = emptyProjectState()
    expect(projectStatusVars(p, plain, () => plain).septic_type).toBe('Septic')

    const inrb = emptyProjectState()
    inrb.septicSystem = 'INRB'
    expect(projectStatusVars(p, inrb, () => inrb).septic_type).toBe('Septic (INRB)')

    const sewer = emptyProjectState()
    sewer.septicSource = 'Sewer'
    sewer.septicSystem = 'INRB' // Sewer wins even when a system is also set
    expect(projectStatusVars(p, sewer, () => sewer).septic_type).toBe('Sewer')
  })

  it('materials: "no orders yet" when empty, "✓ All in" when every order is installed', () => {
    const p = makeProject()
    const empty = emptyProjectState()
    // NOTE: empty falls through to ordersSummary() which returns "no orders yet"
    // (a truthy string) — the `|| 'none yet'` fallback in the source never fires.
    expect(projectStatusVars(p, empty, () => empty).materials).toBe('no orders yet')

    const allIn = emptyProjectState()
    allIn.orders = [{ id: 'a', category: 'Block', status: 'installed', createdAt: '' }]
    expect(projectStatusVars(p, allIn, () => allIn).materials).toBe('✓ All in')
  })

  it('expires is empty when no date is known, and echoes a typed date (invariant #3)', () => {
    const p = makeProject() // permit 'X-NONE' → no county snapshot
    const none = emptyProjectState()
    expect(projectStatusVars(p, none, () => none).expires).toBe('')

    const typed = emptyProjectState()
    typed.permitExpiresDate = '2026-08-01'
    expect(projectStatusVars(p, typed, () => typed).expires).toBe('2026-08-01')
  })

  it('nextAction inherits the SAME top item as buildActionCenter (invariant #1)', () => {
    const p = makeProject({ id: 7 })
    const ps = emptyProjectState()
    ps.permitExpiresDate = '2026-07-01' // expired on Jul 6 → a crit fire
    const getPS = resolver([{ p, ps }])

    // What Today would float to the top for this house:
    const top = buildActionCenter([p], getPS).attention[0]
    const expected = `${top.icon} ${top.text}${top.detail ? ` (${top.detail})` : ''}`

    const vars = projectStatusVars(p, ps, getPS)
    expect(vars.nextAction).toBe(expected) // the report can't disagree with the command center
    expect(vars.nextAction).toContain('EXPIRED')
  })

  it('a house with nothing open reads "✓ On track" (CO homes are skipped by the ranking)', () => {
    const p = makeProject({ id: 9, listStatus: 'CO' })
    const ps = emptyProjectState()
    const vars = projectStatusVars(p, ps, resolver([{ p, ps }]))
    expect(vars.nextAction).toBe('✓ On track — nothing open')
  })
})

describe('buildStatusReport — framing the whole email', () => {
  it('count and subject reflect the selection', () => {
    const p = makeProject({ id: 1 })
    const ps = emptyProjectState()
    const report = buildStatusReport([p], resolver([{ p, ps }]), { detailed: false })

    const stamp = new Date().toLocaleDateString() // same faked clock as the module
    expect(report.count).toBe(1)
    expect(report.subject).toBe(DEFAULT_STATUS_SUBJECT.replace('{{date}}', stamp))
  })

  it('an empty selection yields the placeholder body, not a blank email', () => {
    const report = buildStatusReport([], () => emptyProjectState(), { detailed: false })
    expect(report.count).toBe(0)
    expect(report.body).toBe('(no projects selected)')
  })

  it('a note is prepended (trimmed); a blank/whitespace note is ignored', () => {
    const p = makeProject({ id: 1 })
    const getPS = resolver([{ p, ps: emptyProjectState() }])

    const withNote = buildStatusReport([p], getPS, { detailed: false, note: '  Hi Mickey  ' })
    expect(withNote.body.startsWith('Hi Mickey')).toBe(true)

    const blankNote = buildStatusReport([p], getPS, { detailed: false, note: '   ' })
    const noNote = buildStatusReport([p], getPS, { detailed: false })
    expect(blankNote.body).toBe(noNote.body) // whitespace-only note changes nothing
  })

  it('detailed joins blocks with a blank line; simple with a single newline', () => {
    const entries: Entry[] = [
      { p: makeProject({ id: 1, address: '1 A St' }), ps: emptyProjectState() },
      { p: makeProject({ id: 2, address: '2 B St' }), ps: emptyProjectState() },
    ]
    const getPS = resolver(entries)
    const projects = entries.map((e) => e.p)

    // Neither block template has an internal blank line, so a "\n\n" can only be
    // the between-block separator: simple (sep '\n') has none; detailed (sep
    // '\n\n') has exactly one for two houses.
    const simple = buildStatusReport(projects, getPS, { detailed: false })
    expect(simple.body.split('\n\n')).toHaveLength(1)

    const detailed = buildStatusReport(projects, getPS, { detailed: true })
    expect(detailed.body.split('\n\n')).toHaveLength(2)
  })

  it('fullText frames the subject over a rule; mailto is URL-encoded', () => {
    const p = makeProject({ id: 1 })
    const report = buildStatusReport([p], resolver([{ p, ps: emptyProjectState() }]), { detailed: false })

    expect(report.fullText.startsWith(`${report.subject}\n`)).toBe(true)
    expect(report.fullText).toContain('===') // the '=' underline rule
    expect(report.fullText.endsWith(report.body)).toBe(true)

    expect(report.mailto.startsWith('mailto:?subject=')).toBe(true)
    expect(report.mailto).toContain(encodeURIComponent(report.subject))
    expect(report.mailto).toContain('&body=')
  })
})
