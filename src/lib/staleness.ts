/**
 * staleness.ts — "has this project gone quiet at its current stage?"
 *
 * Pure logic, no UI. This is the engine behind the Today command center's
 * "gone quiet" flags, and the payoff of the doneAt timestamp we added earlier:
 *
 *   1. Find the step the project is currently WAITING ON (first applicable
 *      step that isn't checked off).
 *   2. Find when it last made progress here = the newest `doneAt` among the
 *      steps that ARE checked off.
 *   3. If more days have passed than that step's threshold allows, it's stale.
 *
 * Honest limitation: step 2 needs a real machine timestamp. Steps completed
 * before the doneAt change (seeded / county-inferred ones) have none, so a
 * project only becomes measurable once you check something off "for real."
 * Until then this returns null — we'd rather say "can't tell" than guess.
 */
import type { Project, ProjectState, Stream } from '../types'
import {
  ELECTRIC_STEPS,
  PERMIT_STEPS,
  septicStepsFor,
  waterStepsFor,
  type StepDef,
} from '../data/lifecycles'
import { staleThreshold } from '../data/thresholds'

const MS_PER_DAY = 86_400_000

export interface StaleInfo {
  stream: Stream
  stepId: string
  label: string // the human label of the step we're waiting on
  daysAtStage: number // days since the last completed step in this stream
  threshold: number // the "too long" line for that step (from thresholds.ts)
  overdueDays: number // daysAtStage − threshold; > 0 means stale
}

/** Which steps apply to this project for a given stream (mirrors the detail view). */
function streamSteps(stream: Stream, p: Project, ps: ProjectState): StepDef[] {
  if (stream === 'electric') return ELECTRIC_STEPS
  if (stream === 'water') return waterStepsFor(p, ps)
  if (stream === 'septic') return septicStepsFor(ps)
  // "corrections" is an optional aside, never the thing you're waiting on.
  if (stream === 'permit') return PERMIT_STEPS.filter((s) => s.id !== 'corrections')
  return [] // materials isn't a linear lifecycle — staleness doesn't apply
}

/**
 * Compute the staleness picture for one project + stream, or null when there's
 * nothing to measure (stream complete, not a lifecycle, or no timestamped
 * progress yet). Callers decide what's "stale" via overdueDays > 0 / isStale().
 */
export function stalenessFor(stream: Stream, p: Project, ps: ProjectState): StaleInfo | null {
  const steps = streamSteps(stream, p, ps)
  if (steps.length === 0) return null

  const bucket = ps.steps[stream] ?? {}

  // The step we're currently waiting on = first applicable step not yet done.
  const current = steps.find((s) => !bucket[s.id]?.done)
  if (!current) return null // every step done → stream complete, nothing pending

  // When did we last make progress? = newest doneAt among completed steps.
  let enteredAt: number | null = null
  for (const s of steps) {
    const st = bucket[s.id]
    if (st?.done && st.doneAt) {
      const t = Date.parse(st.doneAt)
      if (!Number.isNaN(t) && (enteredAt === null || t > enteredAt)) enteredAt = t
    }
  }
  if (enteredAt === null) return null // no real timestamp yet → can't measure

  const daysAtStage = Math.floor((Date.now() - enteredAt) / MS_PER_DAY)
  const threshold = staleThreshold(stream, current.id)
  return {
    stream,
    stepId: current.id,
    label: current.label,
    daysAtStage,
    threshold,
    overdueDays: daysAtStage - threshold,
  }
}

/** Type guard: is this a real, currently-stale result? (also narrows away null) */
export function isStale(info: StaleInfo | null): info is StaleInfo {
  return info !== null && info.overdueDays > 0
}
