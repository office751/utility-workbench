import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildDigest, renderDigestText, urgentTasks } from './digest'
import { emptyProjectState } from '../data/seed'
import { makeProject, makeTask } from './testUtils'
import type { WorkbenchState } from '../types'

// digest.ts decides what the morning email says. The rules under test:
//   - company-critical content is IDENTICAL for every recipient
//   - the tasks section is per-person (yours + unassigned, fail-open)
//   - it reuses buildActionCenter — the email can never disagree with Today

const baseState = (): WorkbenchState => ({
  roster: [],
  projects: {},
  tasks: [],
})

describe('buildDigest', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T06:30:00')) // Monday, digest hour
  })
  afterEach(() => vi.useRealTimers())

  it('company fires reach BOTH people; task queues stay personal', () => {
    const state = baseState()
    state.roster = [makeProject({ id: 1 })]
    const ps = emptyProjectState()
    ps.permitExpiresDate = '2026-07-01' // expired → crit fire
    state.projects[1] = ps
    state.tasks = [
      makeTask('call Duke', { assignedTo: 'Adam', dueDate: '2026-07-06' }),
      makeTask('order blinds', { assignedTo: 'Carey', dueDate: '2026-07-04' }),
      makeTask('file the NOC', { dueDate: '2026-07-06' }), // unassigned → everyone
    ]

    const adam = buildDigest(state, 'Adam')
    const carey = buildDigest(state, 'Carey')

    // Identical fire section for both:
    const fires = (d: ReturnType<typeof buildDigest>) =>
      d.sections.find((s) => s.title.startsWith('🔥'))!
    expect(fires(adam).lines).toEqual(fires(carey).lines)
    expect(fires(adam).lines[0]).toContain('Permit EXPIRED')
    expect(adam.counts.crit).toBe(1)

    // Personal queues: own task + the unassigned one, never the other person's:
    const tasksOf = (d: ReturnType<typeof buildDigest>) =>
      d.sections.find((s) => s.title.startsWith('✓'))!.lines.join('\n')
    expect(tasksOf(adam)).toContain('call Duke')
    expect(tasksOf(adam)).toContain('file the NOC')
    expect(tasksOf(adam)).not.toContain('order blinds')
    expect(tasksOf(carey)).toContain('order blinds')
    expect(tasksOf(carey)).toContain('file the NOC')
    expect(tasksOf(carey)).not.toContain('call Duke')

    // The unassigned pile is called out to both (fail-open, invariant 2):
    expect(adam.counts.upForGrabs).toBe(1)
    expect(carey.counts.upForGrabs).toBe(1)
  })

  it('a quiet scanner earns a Systems section; a fresh one stays silent', () => {
    const state = baseState()
    state.scanMeta = { lastScanAt: '2026-07-01T05:30:00' } // 5 days dark → crit
    const d = buildDigest(state, 'Adam')
    const sys = d.sections.find((s) => s.title.startsWith('🩺'))
    expect(sys?.lines[0]).toContain('scanner has gone quiet')
    expect(d.allClear).toBe(false)

    state.scanMeta = { lastScanAt: '2026-07-06T05:30:00' } // ran this morning
    const fresh = buildDigest(state, 'Adam')
    expect(fresh.sections.find((s) => s.title.startsWith('🩺'))).toBeUndefined()
  })

  it('all clear: no fires, no urgent tasks, healthy scanner → says so in the subject', () => {
    const state = baseState()
    state.roster = [makeProject({ id: 1, listStatus: 'CO' })] // nothing active
    state.scanMeta = { lastScanAt: '2026-07-06T05:30:00' }
    state.tasks = [makeTask('someday: reorganize the shed')] // open but not urgent
    const d = buildDigest(state, 'Adam')
    expect(d.allClear).toBe(true)
    expect(d.subject).toContain('all clear')
    // The numbers section still gives a pulse:
    expect(d.sections.at(-1)?.title).toContain('📊')
  })

  it('long fire lists fold into "…and N more" so the email stays scannable', () => {
    const state = baseState()
    for (let i = 1; i <= 15; i++) {
      state.roster.push(makeProject({ id: i, address: `${i} Elm St` }))
      const ps = emptyProjectState()
      ps.permitExpiresDate = '2026-07-01'
      state.projects[i] = ps
    }
    const d = buildDigest(state, 'Adam')
    const fires = d.sections.find((s) => s.title.startsWith('🔥'))!
    expect(fires.lines).toHaveLength(13) // 12 + the fold line
    expect(fires.lines.at(-1)).toBe('…and 3 more')
    expect(d.counts.attention).toBe(15) // counts stay honest
  })

  it('renderDigestText reads top to bottom: greeting, sections, app link', () => {
    const state = baseState()
    state.tasks = [makeTask('call Duke', { dueDate: '2026-07-04', waitingOn: 'Duke' })]
    const text = renderDigestText(buildDigest(state, 'Carey'))
    expect(text).toContain('Good morning, Carey')
    expect(text).toContain('▸ call Duke — 2d overdue (waiting on Duke)')
    expect(text).toContain('https://utility-workbench.vercel.app')
  })
})

describe('urgentTasks — what makes the email vs. what stays in the app', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T06:30:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('orders: overdue → due-soon → blocked-on-someone → starred; quiet tasks stay out', () => {
    const tasks = [
      makeTask('starred', { focus: true }),
      makeTask('waiting', { waitingOn: 'Josh' }),
      makeTask('dueSoon', { dueDate: '2026-07-08' }),
      makeTask('overdue', { dueDate: '2026-07-02' }),
      makeTask('someday'), // no urgency signal at all
      makeTask('doneOverdue', { dueDate: '2026-07-01', done: true }),
    ]
    expect(urgentTasks(tasks).map((t) => t.text)).toEqual(['overdue', 'dueSoon', 'waiting', 'starred'])
  })
})
