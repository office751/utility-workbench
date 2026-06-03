/**
 * Badges.tsx — the little colored pills used by BOTH the sidebar and the
 * dashboard tiles. One source of truth for how a utility / water source /
 * septic type is displayed, so the two views can never drift apart.
 */
import type { Project, ProjectState } from '../types'
import { permitResponsibleOf, septicSourceOf, utilityOf, waterSourceOf } from '../lib/nextAction'

/** SECO / Duke / Clay pill (or "utility?" when unknown). */
export function UtilityBadge({ p, ps }: { p: Project; ps: ProjectState }) {
  const u = utilityOf(p, ps)
  return <span className={`badge u-${u || 'NONE'}`}>{u || 'utility?'}</span>
}

/** Well / City / City+WM pill (or "source?" when unknown). */
export function WaterBadge({ p, ps }: { p: Project; ps: ProjectState }) {
  const s = waterSourceOf(p, ps)
  const label = s === 'CityWM' ? 'City+WM' : s || 'source?'
  return <span className={`badge w-${s || 'NONE'}`}>{label}</span>
}

/** Septic / City Sewer pill. */
export function SepticBadge({ ps }: { ps: ProjectState }) {
  const s = septicSourceOf(ps)
  return <span className={`badge s-${s}`}>{s === 'Sewer' ? 'City Sewer' : 'Septic'}</span>
}

/** Who's handling the permit — Us / Owner / GC pill. */
export function PermitBadge({ ps }: { ps: ProjectState }) {
  const who = permitResponsibleOf(ps)
  return <span className={`badge r-${who || 'Us'}`}>{who || 'Us'}</span>
}

/** Small green "done" chip shown next to finished projects in the list. */
export function DoneChip() {
  return <span className="badge done">done</span>
}
