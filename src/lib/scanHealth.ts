/**
 * scanHealth.ts — is the nightly permit scanner still alive?
 *
 * scanner/scan.mjs stamps `scanMeta.lastScanAt` into the saved blob on every
 * successful --write run (~5:30 AM daily on the office Mac). This module turns
 * that stamp into a health level for the 🏠 Today screen:
 *
 *   ok    < 36h  — ran last night (or this morning). All good.
 *   warn  ≥ 36h  — missed a whole night. Maybe the Mac was off or asleep.
 *   crit  ≥ 72h  — three nights dark. Something is broken — go look.
 *
 * WHY 36 and not 24: the job runs once a day, so being "24h late" is normal
 * timing jitter (a 5:30 AM run one day vs. a wake-coalesced 7:00 AM run the
 * next). 36h means a night truly went by with nothing.
 *
 * Born from a real failure: June 12 – July 1 2026 the scanner was silently
 * dead (a macOS launchd issue) and nobody knew for 19 days. This banner makes
 * that impossible to miss again. Pure logic, no React — see scanHealth.test.ts.
 */

export type ScanHealthLevel = 'ok' | 'warn' | 'crit'

export interface ScanHealthInfo {
  level: ScanHealthLevel
  /** Whole hours since the last stamped run. */
  hoursSince: number
  /** Human wording for the banner: "today at 5:31 AM", "yesterday at 5:30 AM", "4 days ago". */
  agoLabel: string
}

const WARN_AFTER_H = 36
const CRIT_AFTER_H = 72

/**
 * `meta` is WorkbenchState.scanMeta. Returns null when there's nothing to say
 * (the scanner has never stamped, or the stamp is unreadable) — callers render
 * nothing in that case, so old saves never cry wolf.
 */
export function scanHealth(
  meta: { lastScanAt?: string } | undefined,
  now: Date = new Date(),
): ScanHealthInfo | null {
  if (!meta?.lastScanAt) return null
  const then = new Date(meta.lastScanAt)
  if (Number.isNaN(then.getTime())) return null
  const hoursSince = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 3_600_000))
  const level: ScanHealthLevel =
    hoursSince >= CRIT_AFTER_H ? 'crit' : hoursSince >= WARN_AFTER_H ? 'warn' : 'ok'
  return { level, hoursSince, agoLabel: agoLabel(then, now) }
}

/**
 * True while a 🔄 "Scan now" request is waiting for the office Mac: requested
 * more recently than the last completed scan, and not so old (> 30 min) that
 * the Mac is clearly off. A stale request stops claiming "pending" so the
 * button offers itself again — the Mac-side watcher ignores stale requests on
 * the same 30-minute clock, so the two sides can't disagree.
 */
export function scanPending(
  meta: { lastScanAt?: string; requestedAt?: string } | undefined,
  now: Date = new Date(),
): boolean {
  if (!meta?.requestedAt) return false
  const req = new Date(meta.requestedAt).getTime()
  if (Number.isNaN(req)) return false
  const last = meta.lastScanAt ? new Date(meta.lastScanAt).getTime() : 0
  if (req <= last) return false // a completed scan already served it
  return now.getTime() - req < 30 * 60_000
}

/** "today at 5:31 AM" / "yesterday at 5:30 AM" / "4 days ago" */
function agoLabel(then: Date, now: Date): string {
  const time = then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (then.toDateString() === now.toDateString()) return `today at ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`
  // Calendar days, the way people count ("June 27 → July 1" is 4 days ago,
  // even if it's 4.7 days in raw hours). Always ≥ 2 here — today/yesterday
  // were handled above — so the plural is safe.
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)
  return `${days} days ago`
}
