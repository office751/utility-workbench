/**
 * leadTimes.ts — "order it early enough" date math. Pure logic, no React.
 *
 * The problem it solves: a spec home dies waiting on trusses or cabinets.
 * Each material category carries a lead time (data/orders.ts LEAD_TIME_DAYS —
 * cabinets ~4 weeks, trusses ~3, block ~1). Give an order a needed-by date and
 * this module answers: "by WHEN must I place the order, and am I still okay?"
 *
 *   order-by date = neededBy − leadTimeDays (calendar days)
 *   status        = 'ok'   … order-by is more than a week out
 *                   'soon' … order-by is within 7 days (including today)
 *                   'late' … today is already PAST the order-by date
 *
 * Only orders still sitting at 'toOrder' WITH a needed-by date get a status —
 * once it's ordered (or there's no target date) there's nothing to warn about.
 * The Materials row shows this as an "order by <date>" pill; lib/actionCenter
 * turns 'late'/'soon' into 🏠 Today alerts.
 */
import type { OrderItem } from '../types'
import { DEFAULT_LEAD_TIME_DAYS, LEAD_TIME_DAYS } from '../data/orders'

export type LeadStatus = 'ok' | 'soon' | 'late'

/** 'soon' = the order-by date is within this many days. One week gives Adam a
 *  weekend + a vendor's business week to actually place the order. */
export const SOON_WINDOW_DAYS = 7

export interface LeadInfo {
  /** How many days this category takes to arrive (from LEAD_TIME_DAYS). */
  leadTimeDays: number
  /** The last safe day to place the order, as a local-midnight Date. */
  orderBy: Date
  /** Same date formatted for pills/alerts, e.g. "Jul 1". */
  orderByLabel: string
  /** The needed-by date formatted the same way, e.g. "Jul 22". */
  neededByLabel: string
  /** Whole days from today until order-by (0 = today, negative = missed). */
  daysLeft: number
  status: LeadStatus
}

/** The lead time for a category: the tuned number when we have one, the
 *  one-week default otherwise (custom categories, site-service action names). */
export function leadTimeDaysFor(category: string): number {
  return LEAD_TIME_DAYS[category] ?? DEFAULT_LEAD_TIME_DAYS
}

/** Parse "YYYY-MM-DD" to LOCAL midnight. The explicit T00:00:00 matters:
 *  bare date strings parse as UTC, which shifts the date a day for anyone
 *  west of Greenwich (same trick as shutoff.ts). */
function localMidnight(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

/** Short human date for pills/alert text: "Jul 1". */
function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * The lead-time picture for ONE order, or null when it doesn't apply
 * (already ordered/delivered/installed, or no needed-by date set).
 *
 * `today` defaults to the real clock; tests pass a fixed "YYYY-MM-DD" so the
 * math is reproducible.
 */
export function orderLeadInfo(order: OrderItem, today?: string): LeadInfo | null {
  if (order.status !== 'toOrder' || !order.neededBy) return null

  const leadTimeDays = leadTimeDaysFor(order.category)
  const neededBy = localMidnight(order.neededBy)

  // Count back the lead time from the needed-by date. setDate handles
  // month/year rollover for us (Jul 10 − 21 days = Jun 19, no manual math).
  const orderBy = new Date(neededBy)
  orderBy.setDate(orderBy.getDate() - leadTimeDays)

  // Compare whole LOCAL days, not milliseconds — "order by today" must read as
  // 0 days left all day long, not flip negative at 12:01 AM… which it would if
  // we subtracted the current wall-clock time. Round (not ceil/floor) absorbs
  // any DST hour-shift between the two midnights.
  const now = today ? localMidnight(today) : new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msPerDay = 86_400_000
  const daysLeft = Math.round((orderBy.getTime() - todayMid.getTime()) / msPerDay)

  const status: LeadStatus = daysLeft < 0 ? 'late' : daysLeft <= SOON_WINDOW_DAYS ? 'soon' : 'ok'

  return {
    leadTimeDays,
    orderBy,
    orderByLabel: shortDate(orderBy),
    neededByLabel: shortDate(neededBy),
    daysLeft,
    status,
  }
}
