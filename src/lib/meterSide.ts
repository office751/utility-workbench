/**
 * meterSide.ts — which side of the house the METER CAN goes on.
 *
 * The chain (Adam, Sep 28 2026): the UTILITY engineer (SECO or Duke) decides
 * the side → Adam records it here → Adam tells Pam (PM) → Pam tells the
 * electrical sub where to set the can. Pam can't move until the utility
 * answers, so an unknown side is a real to-do once an engineer is assigned.
 *
 * Two different facts, kept apart on purpose:
 *   - `ps.meterSide`   — the OFFICIAL answer from the utility. Drives the to-do.
 *   - field hint       — Pam's drive-by reading of which side the power lines
 *                        run on (data/fieldServiceSides.json, keyed by parcel).
 *                        Useful context ("lines look like they're on the right")
 *                        but NOT a decision — it never clears the to-do.
 *
 * Pure logic, no React. Deliberately imports nothing from nextAction.ts (which
 * imports THIS file) to avoid an import cycle.
 */
import type { Project, ProjectState } from '../types'
import FIELD from '../data/fieldServiceSides.json'

export type Side = 'LH' | 'RH'

/** 'RH' → 'RIGHT side (RH)'. Facing the lot from the road. */
export function sideWords(side: Side): string {
  return side === 'LH' ? 'LEFT side (LH)' : 'RIGHT side (RH)'
}

/** Pam's drive-by reading for this lot, if she's been there. Usually 'LH' or
 *  'RH'; the two split parcels hold per-lot text ("Lot 30 RH; Lot 31 LH"). */
export function fieldSideFor(p: Project): string | undefined {
  const sides = FIELD.sides as Record<string, string>
  return sides[String(p.parcel ?? '').trim()]
}

/** The utility-confirmed side, if recorded. */
export function meterSideOf(ps: ProjectState): Side | undefined {
  return ps.meterSide?.side
}

/** Steps that mean the can is already up (or further) — past the point where
 *  asking for the side makes sense. Covers both electric lists. */
const PAST_CAN = ['canup', 'fieldsched', 'fielddone', 'meternotify', 'meter', 'power']

/**
 * Should the app nag "get the meter side from the engineer"? Only when:
 *   - the house is SECO or Duke (Clay/unknown: no engineer flow),
 *   - an engineer is assigned (before that, nobody can answer),
 *   - no utility-confirmed side is recorded yet,
 *   - and the can isn't already up (older houses don't reopen).
 */
export function needsMeterSide(p: Project, ps: ProjectState): boolean {
  const u = ps.electricCo ?? p.electricCo
  if (u !== 'SECO' && u !== 'DUKE') return false
  const done = ps.steps.electric
  if (!done['engineer']?.done) return false
  if (meterSideOf(ps)) return false
  return !PAST_CAN.some((id) => done[id]?.done)
}

/** The "what's next" line for the to-do, with Pam's hint when there is one. */
export function meterSideLabel(p: Project, ps: ProjectState): string {
  const u = (ps.electricCo ?? p.electricCo) === 'DUKE' ? 'Duke' : 'SECO'
  const hint = fieldSideFor(p)
  return `Get meter side from ${u} engineer — Pam's waiting${hint ? ` (her drive-by: ${hint})` : ''}`
}

/** The ready-to-paste note for Pam once the side is known. Parcel first —
 *  she navigates by parcel ID. */
export function pamNote(p: Project, ps: ProjectState): string | null {
  const side = meterSideOf(ps)
  if (!side) return null
  const u = (ps.electricCo ?? p.electricCo) === 'DUKE' ? 'Duke' : 'SECO'
  return `${p.parcel} — ${p.address}: ${u} says the meter can goes on the ${sideWords(side)}, facing the lot from the road. OK to tell the electrician.`
}
