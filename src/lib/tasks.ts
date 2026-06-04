/**
 * tasks.ts — pure helpers for the free-form task list (no UI, no storage).
 *
 * Tasks are the non-construction half of the command center: IT, office,
 * supply orders, research — anything that isn't a project lifecycle step.
 */
import type { Task } from '../types'
import { HATS } from '../data/hats'

const MS_PER_DAY = 86_400_000

/** Just the not-done tasks. */
export function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done)
}

/** The starred ("Today's Focus") tasks that are still open. */
export function focusTasks(tasks: Task[]): Task[] {
  return openTasks(tasks).filter((t) => t.focus)
}

/** Days until a task's due date (negative = overdue), or null if no due date. */
export function daysUntilDue(t: Task): number | null {
  if (!t.dueDate) return null
  // "T00:00:00" pins to local midnight so a timezone can't shift the day.
  const target = new Date(t.dueDate + 'T00:00:00')
  return Math.ceil((target.getTime() - Date.now()) / MS_PER_DAY)
}

/** A friendly due label, e.g. "due today", "in 3d", "2d overdue" — or null. */
export function dueLabel(t: Task): string | null {
  const d = daysUntilDue(t)
  if (d === null) return null
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d === 0) return 'due today'
  if (d === 1) return 'due tomorrow'
  return `in ${d}d`
}

/**
 * "Urgent" = overdue, due within 3 days, or someone is waiting on you. These
 * are the tasks that should jump onto the Today command center on their own
 * (wired up in M2). Kept here so the rule lives in one place.
 */
export function isUrgentTask(t: Task): boolean {
  if (t.done) return false
  if (t.waitingOn && t.waitingOn.trim()) return true
  const d = daysUntilDue(t)
  return d !== null && d <= 3
}

/** Open tasks that are time-urgent: overdue or due within `days` (default 2). */
export function dueSoonTasks(tasks: Task[], days = 2): Task[] {
  return openTasks(tasks).filter((t) => {
    const d = daysUntilDue(t)
    return d !== null && d <= days
  })
}

/** Open tasks where someone is blocked waiting on you. */
export function waitingOnTasks(tasks: Task[]): Task[] {
  return openTasks(tasks).filter((t) => Boolean(t.waitingOn && t.waitingOn.trim()))
}

/** Group open tasks by hat id, preserving the order they were added. */
export function tasksByHat(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const t of openTasks(tasks)) {
    if (!map.has(t.category)) map.set(t.category, [])
    map.get(t.category)!.push(t)
  }
  return map
}

/* ---------------- paste-import (from the text-scan script) ---------------- */

/** A task minus the fields the store fills in (id/createdAt/done/doneAt). */
export type ParsedTask = Omit<Task, 'id' | 'createdAt' | 'done' | 'doneAt'>

/** Turn "today" / "tomorrow" / "YYYY-MM-DD" into a stored YYYY-MM-DD (or undefined). */
function resolveDue(v: string): string | undefined {
  const t = v.trim().toLowerCase()
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (t === 'today') return fmt(new Date())
  if (t === 'tomorrow') {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return fmt(d)
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : undefined
}

/**
 * Parse one pasted line into task fields. Format (what the scan script emits):
 *   <text> | waiting:<name> | due:<today|tomorrow|YYYY-MM-DD> | hat:<id> | company:<co>
 * Only the leading text is required; the rest are optional "key:value" tails.
 */
export function parseTaskLine(line: string): ParsedTask | null {
  const parts = line.split('|').map((s) => s.trim())
  const text = parts[0]
  if (!text) return null
  const out: ParsedTask = { text, category: 'office', focus: false }
  for (const seg of parts.slice(1)) {
    const i = seg.indexOf(':')
    if (i === -1) continue
    const key = seg.slice(0, i).trim().toLowerCase()
    const val = seg.slice(i + 1).trim()
    if (!val) continue
    if (key === 'waiting' || key === 'who') out.waitingOn = val
    else if (key === 'due') out.dueDate = resolveDue(val)
    else if (key === 'company' || key === 'co') out.company = val
    else if (key === 'hat' || key === 'cat') {
      const id = val.toLowerCase()
      out.category = HATS.some((h) => h.id === id) ? id : 'other'
    }
  }
  return out
}

/** Parse a multi-line paste into tasks (blank lines ignored). */
export function parseTaskLines(text: string): ParsedTask[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseTaskLine)
    .filter((t): t is ParsedTask => t !== null)
}
