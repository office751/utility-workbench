/**
 * shutoff.ts — the "shut off electric 2 business days after closing" rule.
 *
 * When a house sells, the electric account (held by Iron Shield) should be
 * shut off / transferred 2 BUSINESS days after the closing date — skipping
 * weekends. This file does that date math.
 */
import type { ProjectState } from '../types'

/** Add N business days (Mon–Fri) to a YYYY-MM-DD date. */
export function addBusinessDays(dateStr: string, n: number): Date {
  // "T00:00:00" pins the time to local midnight so timezones can't shift
  // the date to the previous evening.
  const d = new Date(dateStr + 'T00:00:00')
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const weekday = d.getDay() // 0 = Sunday, 6 = Saturday
    if (weekday !== 0 && weekday !== 6) added++
  }
  return d
}

export interface ShutoffInfo {
  /** The target shut-off date, formatted for display. */
  date: string
  /** Days from today until that date (negative = overdue!). */
  daysLeft: number
}

/**
 * If the project has a closing date and the account hasn't been transferred
 * yet, return the shut-off deadline. Otherwise null (nothing to show).
 */
export function shutoffFor(ps: ProjectState): ShutoffInfo | null {
  if (!ps.closingDate || ps.transferred) return null
  const target = addBusinessDays(ps.closingDate, 2)
  const msPerDay = 86_400_000 // 24h * 60m * 60s * 1000ms
  // "+ 0" normalizes Math.ceil's NEGATIVE zero (ceil(-0.5) === -0) so a
  // due-today deadline is exactly 0 under Object.is / strict test equality.
  const daysLeft = Math.ceil((target.getTime() - Date.now()) / msPerDay) + 0
  return {
    date: target.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    }),
    daysLeft,
  }
}
