/**
 * permitExpiry.ts — "is this permit about to expire?" date math.
 *
 * Deliberately the twin of shutoff.ts: given an expiration date, figure out
 * how many days are left. Building permits lapse if they expire, so this
 * drives the "expiring soon" alerts on the Permit tab.
 */
import type { Project, ProjectState } from '../types'
import { PERMIT_DATES } from '../data/permitDates'

export interface ExpiryInfo {
  /** The expiration date, formatted for display. */
  date: string
  /** Days from today until expiry (negative = already expired). */
  daysLeft: number
}

/** The effective expiration date: a typed-in value wins over the live data. */
export function permitExpiresOf(p: Project, ps: ProjectState): string {
  return ps.permitExpiresDate ?? PERMIT_DATES[p.permit]?.expires ?? ''
}

/** Days until the permit expires, or null if no expiration date is known. */
export function permitExpiryFor(p: Project, ps: ProjectState): ExpiryInfo | null {
  const expires = permitExpiresOf(p, ps)
  if (!expires) return null
  // "T00:00:00" pins to local midnight so timezones can't shift the date.
  const target = new Date(expires + 'T00:00:00')
  const msPerDay = 86_400_000
  const daysLeft = Math.ceil((target.getTime() - Date.now()) / msPerDay)
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

/** True when a permit expires within a week — or has already expired. */
export function permitExpiringSoon(p: Project, ps: ProjectState): boolean {
  const e = permitExpiryFor(p, ps)
  return e !== null && e.daysLeft <= 7
}
