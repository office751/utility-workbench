import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  assigneesInUse,
  daysUntilDue,
  dueLabel,
  dueSoonTasks,
  forOperator,
  isUnassigned,
  parseTaskLine,
  parseTaskLines,
  sameName,
  tasksByHat,
  unassignedOpen,
  waitingOnTasks,
} from './tasks'
import { makeTask } from './testUtils'

// tasks.ts is the queue brain for a TWO-operator office (Adam + Carey).
// The one rule that must never break: unassigned work shows in EVERYONE's
// queue (fail-open) — a task that vanishes from both lists is a missed permit.

describe('due-date math', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('daysUntilDue: today=0, tomorrow=1, overdue negative, no date = null', () => {
    expect(daysUntilDue(makeTask('a', { dueDate: '2026-07-06' }))).toBe(0)
    expect(daysUntilDue(makeTask('b', { dueDate: '2026-07-07' }))).toBe(1)
    expect(daysUntilDue(makeTask('c', { dueDate: '2026-07-04' }))).toBe(-2)
    expect(daysUntilDue(makeTask('d'))).toBeNull()
  })

  it('dueLabel speaks human', () => {
    expect(dueLabel(makeTask('a', { dueDate: '2026-07-04' }))).toBe('2d overdue')
    expect(dueLabel(makeTask('b', { dueDate: '2026-07-06' }))).toBe('due today')
    expect(dueLabel(makeTask('c', { dueDate: '2026-07-07' }))).toBe('due tomorrow')
    expect(dueLabel(makeTask('d', { dueDate: '2026-07-09' }))).toBe('in 3d')
    expect(dueLabel(makeTask('e'))).toBeNull()
  })

  it('dueSoonTasks: overdue + within 2 days by default; done tasks never nag', () => {
    const tasks = [
      makeTask('overdue', { dueDate: '2026-07-01' }),
      makeTask('today', { dueDate: '2026-07-06' }),
      makeTask('twoOut', { dueDate: '2026-07-08' }),
      makeTask('threeOut', { dueDate: '2026-07-09' }),
      makeTask('doneButDue', { dueDate: '2026-07-06', done: true }),
      makeTask('noDate'),
    ]
    expect(dueSoonTasks(tasks).map((t) => t.text)).toEqual(['overdue', 'today', 'twoOut'])
  })
})

describe('the two-operator queue (fail-open)', () => {
  const mine = makeTask('mine', { assignedTo: 'Carey' })
  const theirs = makeTask('theirs', { assignedTo: 'Adam' })
  const shared = makeTask('shared') // unassigned
  const all = [mine, theirs, shared]

  it('unassigned = blank, missing, or whitespace-only', () => {
    expect(isUnassigned(makeTask('a'))).toBe(true)
    expect(isUnassigned(makeTask('b', { assignedTo: '   ' }))).toBe(true)
    expect(isUnassigned(makeTask('c', { assignedTo: 'Carey' }))).toBe(false)
  })

  it("everyone's queue includes the unassigned pile — it can never vanish from both", () => {
    expect(forOperator(all, 'Carey').map((t) => t.text)).toEqual(['mine', 'shared'])
    expect(forOperator(all, 'Adam').map((t) => t.text)).toEqual(['theirs', 'shared'])
    // The shared task appears in BOTH queues — that's the fail-open invariant.
  })

  it('names match case- and whitespace-insensitively', () => {
    expect(sameName(' carey ', 'Carey')).toBe(true)
    expect(forOperator(all, 'CAREY').map((t) => t.text)).toEqual(['mine', 'shared'])
  })

  it('no operator signed in (local dev / pre-RBAC) → nothing is hidden', () => {
    expect(forOperator(all)).toEqual(all)
    expect(forOperator(all, '  ')).toEqual(all)
  })

  it('unassignedOpen is the "up for grabs" pile — open tasks only', () => {
    const done = makeTask('doneShared', { done: true })
    expect(unassignedOpen([...all, done]).map((t) => t.text)).toEqual(['shared'])
  })

  it('assigneesInUse de-dupes case-insensitively, keeping the first spelling', () => {
    const tasks = [
      makeTask('a', { assignedTo: 'Carey' }),
      makeTask('b', { assignedTo: 'carey' }),
      makeTask('c', { assignedTo: 'Adam' }),
      makeTask('d'),
    ]
    expect(assigneesInUse(tasks)).toEqual(['Carey', 'Adam'])
  })

  it('waitingOnTasks ignores whitespace-only names', () => {
    const tasks = [makeTask('a', { waitingOn: 'Josh' }), makeTask('b', { waitingOn: '  ' })]
    expect(waitingOnTasks(tasks).map((t) => t.text)).toEqual(['a'])
  })
})

describe('tasksByHat', () => {
  it("uncategorized tasks land under 'other' (a real hat), never undefined", () => {
    const grouped = tasksByHat([makeTask('a', { category: '' }), makeTask('b', { category: 'it' })])
    expect([...grouped.keys()]).toEqual(['other', 'it'])
    expect(grouped.get('other')?.[0].text).toBe('a')
  })
})

// parseTaskLine ingests the scanner's paste format:
//   <text> | waiting:<name> | due:<today|tomorrow|date> | hat:<id> | company:<co>
describe('parseTaskLine / parseTaskLines', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('parses a fully-loaded line', () => {
    const t = parseTaskLine('Chase the WO number | waiting:Duke | due:2026-07-10 | hat:it | company:Iron Shield')
    expect(t).toEqual({
      text: 'Chase the WO number',
      category: 'it',
      focus: false,
      waitingOn: 'Duke',
      dueDate: '2026-07-10',
      company: 'Iron Shield',
    })
  })

  it('bare text is enough; defaults apply', () => {
    expect(parseTaskLine('Fix the printer')).toEqual({ text: 'Fix the printer', category: 'office', focus: false })
  })

  it("resolves due:today and due:tomorrow against the real clock", () => {
    expect(parseTaskLine('a | due:today')?.dueDate).toBe('2026-07-06')
    expect(parseTaskLine('a | due:tomorrow')?.dueDate).toBe('2026-07-07')
    expect(parseTaskLine('a | due:whenever')?.dueDate).toBeUndefined() // garbage dropped
  })

  it("hat must be a REAL hat id — anything else files under 'other'", () => {
    expect(parseTaskLine('a | hat:it')?.category).toBe('it')
    expect(parseTaskLine('a | hat:bogus')?.category).toBe('other')
  })

  it('accepts the aliases: who→waiting, assign/for→assignedTo, co→company, cat→hat', () => {
    const t = parseTaskLine('a | who:Mickey | for:Carey | co:MRO | cat:supplies')
    expect(t?.waitingOn).toBe('Mickey')
    expect(t?.assignedTo).toBe('Carey')
    expect(t?.company).toBe('MRO')
    expect(t?.category).toBe('supplies')
  })

  it('a line with no leading text is rejected; junk segments are ignored', () => {
    expect(parseTaskLine('| waiting:Josh')).toBeNull()
    const t = parseTaskLine('a | nonsense segment | due:')
    expect(t).toEqual({ text: 'a', category: 'office', focus: false }) // both tails ignored
  })

  it('parseTaskLines splits a paste block, skipping blank lines', () => {
    const tasks = parseTaskLines('one\n\n  \ntwo | hat:it\n')
    expect(tasks.map((t) => t.text)).toEqual(['one', 'two'])
    expect(tasks[1].category).toBe('it')
  })
})
