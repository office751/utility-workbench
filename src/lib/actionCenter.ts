/**
 * actionCenter.ts — the brain behind the Today command center.
 *
 * It walks EVERY project once and gathers everything time-sensitive or
 * actionable into two prioritized lists:
 *   - attention : deadlines (permit expiry, electric shut-off, material
 *                 order-by dates from lead times) + stalled stages
 *   - moves     : the next step where the ball is in OUR court, + materials to order
 *
 * It's pure logic (no React), reusing the per-stream brains we already have so
 * the command center can never disagree with the individual tabs.
 */
import type { Project, ProjectState, Stream, WorkbenchState } from '../types'
import { missingTakeoffs, permitIssued } from './takeoffs'
import { modelKey } from '../data/models'
import { shutoffFor } from './shutoff'
import { permitExpiryFor } from './permitExpiry'
import { stalenessFor, isStale } from './staleness'
import {
  isOurCourtKey,
  nextElectricAction,
  nextWaterAction,
  nextSepticAction,
  nextPermitAction,
  permitNeedsAction,
} from './nextAction'
import { ordersOf, toOrderCount } from './orders'
import { orderLeadInfo } from './leadTimes'

export type ActionKind = 'expiry' | 'shutoff' | 'stale' | 'todo' | 'order' | 'takeoff' | 'leadtime'
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

// OUR_COURT (which next-action keys are OUR move vs. waiting on someone) lives
// in lib/nextAction.ts now — one source shared with the project-list dots, so
// Today and the list can never disagree about whose move it is.

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
  modelTakeoffs?: WorkbenchState['modelTakeoffs'],
): ActionCenter {
  const attention: ActionItem[] = []
  const moves: ActionItem[] = []
  let toOrderTotal = 0

  for (const p of projects) {
    // Finished (C.O.) and parked (Hold) homes never belong in "needs attention"
    // or the to-do moves — skip them entirely so the command center stays focused.
    if (p.listStatus === 'CO' || p.listStatus === 'Hold') continue
    const ps = getProjectState(p.id)
    const base = { projectId: p.id, address: p.address, meta: `${p.model} · ${p.subdivision}` }

    // --- NEW-MODEL TAKEOFFS: a model missing takeoffs is a problem; missing
    //     them once the PERMIT IS ISSUED is the most important thing on the
    //     project (it blocks ordering everything). ---
    const missing = missingTakeoffs(modelTakeoffs, p.model)
    if (missing.length > 0) {
      const names = missing.map((t) => t.label.split(' ')[0]).join(', ')
      if (permitIssued(ps)) {
        attention.push({
          ...base,
          stream: 'materials',
          kind: 'takeoff',
          icon: '🧩',
          text: `PERMIT ISSUED but model ${modelKey(p.model)} is missing takeoffs`,
          detail: names,
          severity: 'crit',
          sortDays: -9999, // floats to the very top
        })
      } else {
        moves.push({
          ...base,
          stream: 'materials',
          kind: 'takeoff',
          icon: '🧩',
          text: `Gather takeoffs for new model ${modelKey(p.model)} (${names})`,
          severity: 'info',
          sortDays: 0,
        })
      }
    }

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
          // Past the threshold = warn; parked at least TWICE the expected
          // duration = crit (a project quiet for months shouldn't look the
          // same as one a day over the line). Crit also turns the 🏠 tab
          // badge red — see todayBadge in App.tsx.
          severity: info.overdueDays >= info.threshold ? 'crit' : 'warn',
          sortDays: -info.overdueDays, // the more overdue, the higher it floats
        })
      }
    }

    // --- your move: the next step where the ball is in our court ---
    const todos: { stream: Stream; label: string }[] = []
    const e = nextElectricAction(p, ps)
    if (isOurCourtKey('electric', e.key, p, ps)) todos.push({ stream: 'electric', label: e.label })
    const w = nextWaterAction(p, ps)
    if (isOurCourtKey('water', w.key, p, ps)) todos.push({ stream: 'water', label: w.label })
    const s = nextSepticAction(ps)
    if (isOurCourtKey('septic', s.key, p, ps)) todos.push({ stream: 'septic', label: s.label })
    if (permitNeedsAction(ps)) {
      const pm = nextPermitAction(ps)
      if (isOurCourtKey('permit', pm.key, p, ps)) todos.push({ stream: 'permit', label: pm.label })
    }
    for (const t of todos) {
      moves.push({ ...base, stream: t.stream, kind: 'todo', icon: STREAM_ICON[t.stream], text: t.label, severity: 'info', sortDays: 0 })
    }

    // --- deadline: material lead times ("order NOW or the schedule slips") ---
    // Any to-order line with a needed-by date gets order-by math from
    // lib/leadTimes.ts. 'late' = the order-by date already passed (crit);
    // 'soon' = it lands within a week (warn). 'ok' lines stay quiet here —
    // the Materials row's pill covers them. Clicking deep-links to the
    // project's Materials tab like every other attention item.
    for (const o of ordersOf(ps)) {
      const lead = orderLeadInfo(o) // null unless still toOrder + neededBy set
      if (!lead || lead.status === 'ok') continue
      attention.push({
        ...base,
        stream: 'materials',
        kind: 'leadtime',
        icon: '🛒',
        text: `${lead.status === 'late' ? 'Order NOW' : 'Order soon'}: ${o.category} — needed ${lead.neededByLabel}, ${lead.leadTimeDays}-day lead`,
        detail: `order by ${lead.orderByLabel}`,
        severity: lead.status === 'late' ? 'crit' : 'warn',
        sortDays: lead.daysLeft, // negative once missed → floats above closer deadlines
      })
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

  // Rank attention: criticals first; within a severity, hard DEADLINES outrank
  // gone-quiet stalls — their sortDays scales aren't comparable (a permit
  // expired 3 days ago is -3; a 30-day-overdue stall is -30), and an expired
  // permit must never lose the top spot to a stall. Then by urgency. Every
  // consumer inherits this one order — Today, the 🏠 badge, and the status
  // report's {{nextAction}} headline.
  const staleLast = (i: ActionItem) => (i.kind === 'stale' ? 1 : 0)
  attention.sort(
    (a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
      staleLast(a) - staleLast(b) ||
      a.sortDays - b.sortDays,
  )
  // Moves: cluster the do-something-now to-dos above the shopping list.
  const KIND_ORDER: Record<string, number> = { takeoff: 0, todo: 1, order: 2 }
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

/** Per-stream "how many projects need me here" + whether any are on fire. */
export interface StreamCount {
  count: number // distinct projects with an actionable item in this stream
  fire: boolean // any deadline/stale fire in this stream (→ red badge)
}

/**
 * Roll the command center up into a count per stream, for the tab badges.
 * `count` = distinct projects needing action (a fire OR an our-court move);
 * `fire` = at least one true fire (expiry / shut-off / stale) in that stream.
 */
export function streamActionCounts(
  projects: Project[],
  getProjectState: (id: number) => ProjectState,
): Record<Stream, StreamCount> {
  const ac = buildActionCenter(projects, getProjectState)
  const proj: Record<Stream, Set<number>> = {
    electric: new Set(),
    water: new Set(),
    septic: new Set(),
    permit: new Set(),
    materials: new Set(),
  }
  const fire: Record<Stream, boolean> = {
    electric: false,
    water: false,
    septic: false,
    permit: false,
    materials: false,
  }
  for (const it of ac.attention) {
    proj[it.stream].add(it.projectId)
    fire[it.stream] = true
  }
  for (const it of ac.moves) proj[it.stream].add(it.projectId)
  return {
    electric: { count: proj.electric.size, fire: fire.electric },
    water: { count: proj.water.size, fire: fire.water },
    septic: { count: proj.septic.size, fire: fire.septic },
    permit: { count: proj.permit.size, fire: fire.permit },
    materials: { count: proj.materials.size, fire: fire.materials },
  }
}
