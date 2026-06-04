/**
 * actionCenter.ts — the brain behind the Today command center.
 *
 * It walks EVERY project once and gathers everything time-sensitive or
 * actionable into two prioritized lists:
 *   - attention : deadlines (permit expiry, electric shut-off) + stalled stages
 *   - moves     : the next step where the ball is in OUR court, + materials to order
 *
 * It's pure logic (no React), reusing the per-stream brains we already have so
 * the command center can never disagree with the individual tabs.
 */
import type { Project, ProjectState, Stream } from '../types'
import { shutoffFor } from './shutoff'
import { permitExpiryFor } from './permitExpiry'
import { stalenessFor, isStale } from './staleness'
import {
  nextElectricAction,
  nextWaterAction,
  nextSepticAction,
  nextPermitAction,
  permitNeedsAction,
} from './nextAction'
import { toOrderCount } from './orders'

export type ActionKind = 'expiry' | 'shutoff' | 'stale' | 'todo' | 'order'
export type Severity = 'crit' | 'warn' | 'info'

/** One actionable line on the command center. */
export interface ActionItem {
  projectId: number
  address: string
  meta: string // "F-LH · Silver Springs Shores"
  stream: Stream // which tab to jump to when clicked
  kind: ActionKind
  icon: string
  text: string // what's going on / what to do
  detail?: string // the right-hand chip (deadline or age)
  severity: Severity
  sortDays: number // smaller = more urgent (used to rank within a list)
}

export interface ActionCenter {
  attention: ActionItem[]
  moves: ActionItem[]
  stats: { projects: number; attention: number; moves: number; toOrder: number; allClear: boolean }
}

/**
 * Which "next action" keys mean the ball is in OUR court — something we can act
 * on right now, versus waiting on a utility, the county, or an installer. (The
 * next*Action functions return these keys; see lib/nextAction.ts.)
 */
const OUR_COURT: Record<Stream, Set<string>> = {
  electric: new Set(['verify', 'apply', 'addr', 'deposit', 'rough']),
  water: new Set(['wsrc', 'cavail', 'capply', 'wpermit']),
  septic: new Set(['seval', 'sapplied', 'scounty', 'snrb']),
  permit: new Set(['submitted', 'approved']), // submit it / go pick it up
  materials: new Set(), // handled via the order count instead
}

const SEV_RANK: Record<Severity, number> = { crit: 0, warn: 1, info: 2 }

/** A per-stream icon, so each to-do visually says which KIND of work it is. */
const STREAM_ICON: Record<Stream, string> = {
  electric: '⚡',
  water: '💧',
  septic: '🚽',
  permit: '📋',
  materials: '🛒',
}

/** Build the whole command-center picture from the live roster + saved state. */
export function buildActionCenter(
  projects: Project[],
  getProjectState: (id: number) => ProjectState,
): ActionCenter {
  const attention: ActionItem[] = []
  const moves: ActionItem[] = []
  let toOrderTotal = 0

  for (const p of projects) {
    const ps = getProjectState(p.id)
    const base = { projectId: p.id, address: p.address, meta: `${p.model} · ${p.subdivision}` }

    // --- deadline: permit expiry (look ahead two weeks) ---
    const exp = permitExpiryFor(p, ps)
    if (exp && exp.daysLeft <= 14) {
      const expired = exp.daysLeft < 0
      attention.push({
        ...base,
        stream: 'permit',
        kind: 'expiry',
        icon: '⏰',
        text: expired ? 'Permit EXPIRED' : 'Permit expiring',
        detail: expired ? `expired · ${exp.date}` : `${exp.daysLeft}d · ${exp.date}`,
        severity: expired ? 'crit' : exp.daysLeft <= 7 ? 'warn' : 'info',
        sortDays: exp.daysLeft,
      })
    }

    // --- deadline: electric shut-off after a closing ---
    const so = shutoffFor(ps)
    if (so && so.daysLeft <= 10) {
      const overdue = so.daysLeft < 0
      attention.push({
        ...base,
        stream: 'electric',
        kind: 'shutoff',
        icon: '⚡',
        text: overdue ? 'Shut-off OVERDUE' : 'Electric shut-off due',
        detail: overdue ? `overdue · ${so.date}` : `${so.daysLeft}d · ${so.date}`,
        severity: overdue ? 'crit' : 'warn',
        sortDays: so.daysLeft,
      })
    }

    // --- stalled stages (gone quiet) across the four lifecycle streams ---
    for (const stream of ['electric', 'water', 'septic', 'permit'] as Stream[]) {
      const info = stalenessFor(stream, p, ps)
      if (isStale(info)) {
        attention.push({
          ...base,
          stream,
          kind: 'stale',
          icon: '⚠',
          text: `Stalled: ${info.label}`,
          detail: `${info.daysAtStage}d at this stage`,
          severity: 'warn',
          sortDays: -info.overdueDays, // the more overdue, the higher it floats
        })
      }
    }

    // --- your move: the next step where the ball is in our court ---
    const todos: { stream: Stream; label: string }[] = []
    const e = nextElectricAction(p, ps)
    if (OUR_COURT.electric.has(e.key)) todos.push({ stream: 'electric', label: e.label })
    const w = nextWaterAction(p, ps)
    if (OUR_COURT.water.has(w.key)) todos.push({ stream: 'water', label: w.label })
    const s = nextSepticAction(ps)
    if (OUR_COURT.septic.has(s.key)) todos.push({ stream: 'septic', label: s.label })
    if (permitNeedsAction(ps)) {
      const pm = nextPermitAction(ps)
      if (OUR_COURT.permit.has(pm.key)) todos.push({ stream: 'permit', label: pm.label })
    }
    for (const t of todos) {
      moves.push({ ...base, stream: t.stream, kind: 'todo', icon: STREAM_ICON[t.stream], text: t.label, severity: 'info', sortDays: 0 })
    }

    // --- materials waiting to be ordered ---
    const n = toOrderCount(ps)
    if (n > 0) {
      toOrderTotal += n
      moves.push({
        ...base,
        stream: 'materials',
        kind: 'order',
        icon: '🛒',
        text: `Order ${n} material${n > 1 ? 's' : ''}`,
        severity: 'info',
        sortDays: 0,
      })
    }
  }

  // Rank attention: criticals first, then by urgency (soonest / most overdue).
  attention.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.sortDays - b.sortDays)
  // Moves: cluster the do-something-now to-dos above the shopping list.
  const KIND_ORDER: Record<string, number> = { todo: 0, order: 1 }
  moves.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9))

  return {
    attention,
    moves,
    stats: {
      projects: projects.length,
      attention: attention.length,
      moves: moves.length,
      toOrder: toOrderTotal,
      allClear: attention.length === 0 && moves.length === 0,
    },
  }
}
