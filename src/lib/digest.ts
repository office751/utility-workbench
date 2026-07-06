/**
 * digest.ts — the morning-email brain. Pure logic, no React, no I/O.
 *
 * "Given the whole saved state and a person, what should their morning email
 * say?" The Mac sender job (scanner/send-digest.mjs) is just a thin shell
 * around this: read blob → buildDigest per person → send. Keeping the
 * decision-making HERE means it's tested like every other brain, and the
 * email can never disagree with the app — it reuses buildActionCenter (THE
 * prioritization, see docs/BRAINS.md) rather than re-ranking anything.
 *
 * Per-person scope (Adam's choice, July 2026):
 *   - company-critical sections (fires, scanner health, numbers) go to EVERYONE
 *   - the tasks section is YOUR queue: yours + the unassigned pile (fail-open,
 *     same rule as the Tasks tab)
 */
import type { Task, WorkbenchState } from '../types'
import { emptyProjectState } from '../data/seed'
import { buildActionCenter, type ActionItem } from './actionCenter'
import { scanHealth } from './scanHealth'
import { dueLabel, daysUntilDue, forOperator, openTasks, unassignedOpen } from './tasks'

export interface DigestSection {
  title: string
  lines: string[]
}

export interface Digest {
  person: string
  /** Ready-to-use email subject line. */
  subject: string
  sections: DigestSection[]
  /** Nothing burning anywhere — sender may still send (proof of life). */
  allClear: boolean
  counts: {
    attention: number
    crit: number
    myTasks: number // urgent tasks in this person's queue
    upForGrabs: number // open + unassigned
    toOrder: number
  }
}

/** Keep emails scannable: a section shows this many lines, then "…and N more". */
const MAX_LINES = 12

/** One attention item as an email line: "⏰ 123 Main St — Permit EXPIRED (expired · Mon 7/6)". */
function attentionLine(it: ActionItem): string {
  const flag = it.severity === 'crit' ? '‼️ ' : ''
  return `${flag}${it.icon} ${it.address} — ${it.text}${it.detail ? ` (${it.detail})` : ''}`
}

/** Cap a line list, folding the overflow into a final "…and N more". */
function capped(lines: string[]): string[] {
  if (lines.length <= MAX_LINES) return lines
  return [...lines.slice(0, MAX_LINES), `…and ${lines.length - MAX_LINES} more`]
}

/** A task as an email line: "▸ Chase the WO number — due today (waiting on Duke)". */
function taskLine(t: Task): string {
  const due = dueLabel(t)
  const bits = [t.text]
  if (due) bits.push(`— ${due}`)
  if (t.waitingOn?.trim()) bits.push(`(waiting on ${t.waitingOn.trim()})`)
  return `▸ ${bits.join(' ')}`
}

/**
 * The urgent slice of a queue, in reading order: overdue first (most overdue
 * on top), then due-soon, then blocked-on-someone, then the focus stars.
 * De-duplicated — a starred, overdue, waiting task appears once.
 */
export function urgentTasks(queue: Task[]): Task[] {
  const open = openTasks(queue)
  const bucket = (t: Task): number => {
    const d = daysUntilDue(t)
    if (d !== null && d < 0) return 0 // overdue
    if (d !== null && d <= 2) return 1 // due today/soon (Tasks-tab window)
    if (t.waitingOn?.trim()) return 2 // someone is blocked on you
    if (t.focus) return 3 // starred into Today's Focus
    return 9 // not urgent — stays out of the email
  }
  return open
    .map((t) => ({ t, b: bucket(t), d: daysUntilDue(t) ?? 999 }))
    .filter((x) => x.b < 9)
    .sort((a, b) => a.b - b.b || a.d - b.d)
    .map((x) => x.t)
}

/** Build one person's morning digest from the saved blob. */
export function buildDigest(state: WorkbenchState, person: string, now: Date = new Date()): Digest {
  const ac = buildActionCenter(
    state.roster,
    (id) => state.projects[id] ?? emptyProjectState(),
    state.modelTakeoffs,
  )
  const crit = ac.attention.filter((a) => a.severity === 'crit').length

  const sections: DigestSection[] = []

  // --- company-wide fires (identical for every recipient) ---
  if (ac.attention.length > 0) {
    sections.push({
      title: `🔥 Needs attention (${ac.attention.length}${crit ? `, ${crit} critical` : ''})`,
      lines: capped(ac.attention.map(attentionLine)),
    })
  }

  // --- systems health: only speaks up when something is wrong ---
  const scan = scanHealth(state.scanMeta, now)
  if (scan && scan.level !== 'ok') {
    sections.push({
      title: '🩺 Systems',
      lines: [
        `${scan.level === 'crit' ? '‼️' : '⚠'} Permit scanner has gone quiet — last run ${scan.agoLabel}. ` +
          `Check the office Mac (is it on? asleep?).`,
      ],
    })
  }

  // --- YOUR queue: yours + unassigned, urgent slice only ---
  const mine = urgentTasks(forOperator(state.tasks ?? [], person))
  if (mine.length > 0) {
    sections.push({
      title: `✓ Your tasks (${mine.length} urgent)`,
      lines: capped(mine.map(taskLine)),
    })
  }

  // --- the shared pile, so nothing rots unclaimed ---
  const grabs = unassignedOpen(state.tasks ?? [])
  if (grabs.length > 0) {
    sections.push({
      title: `🤝 Up for grabs (${grabs.length} unassigned)`,
      lines: capped(grabs.slice(0, 5).map((t) => `▸ ${t.text}`)),
    })
  }

  // --- the numbers: a one-line pulse even when nothing burns ---
  sections.push({
    title: '📊 The numbers',
    lines: [
      `${ac.stats.projects} houses tracked · ${ac.attention.length} need attention · ` +
        `${ac.moves.length} your-move steps · ${ac.stats.toOrder} materials to order`,
    ],
  })

  const allClear = ac.attention.length === 0 && mine.length === 0 && (!scan || scan.level === 'ok')
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const subject = allClear
    ? `Lodestar digest — all clear ☀️ (${dateLabel})`
    : `Lodestar digest — ${ac.attention.length} need attention${crit ? ` (${crit} critical)` : ''}` +
      `${mine.length ? ` · ${mine.length} tasks` : ''} (${dateLabel})`

  return {
    person,
    subject,
    sections,
    allClear,
    counts: {
      attention: ac.attention.length,
      crit,
      myTasks: mine.length,
      upForGrabs: grabs.length,
      toOrder: ac.stats.toOrder,
    },
  }
}

/** Plain-text body (every mail client renders this). */
export function renderDigestText(d: Digest): string {
  const head = `Good morning, ${d.person} — here's where everything stands.\n`
  const body = d.sections
    .map((s) => `${s.title}\n${s.lines.map((l) => `  ${l}`).join('\n')}`)
    .join('\n\n')
  const foot = `\n\nOpen Lodestar: https://utility-workbench.vercel.app`
  return `${head}\n${body}${foot}\n`
}

/** Simple HTML body — deliberately boring markup so Outlook renders it faithfully. */
export function renderDigestHtml(d: Digest): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const sections = d.sections
    .map(
      (s) =>
        `<h3 style="margin:16px 0 6px;font-size:15px">${esc(s.title)}</h3>` +
        `<ul style="margin:0;padding-left:20px">${s.lines.map((l) => `<li style="margin:2px 0">${esc(l)}</li>`).join('')}</ul>`,
    )
    .join('')
  return (
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222;max-width:640px">` +
    `<p>Good morning, ${esc(d.person)} — here's where everything stands.</p>` +
    sections +
    `<p style="margin-top:18px"><a href="https://utility-workbench.vercel.app">Open Lodestar</a></p>` +
    `</div>`
  )
}
