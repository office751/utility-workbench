/**
 * takeoffs.ts (lib) — which takeoffs are still MISSING for a model, and how
 * urgent that is for a given project. Pure logic.
 */
import type { ProjectState, WorkbenchState } from '../types'
import { TAKEOFF_TYPES, type TakeoffType } from '../data/takeoffs'
import { modelKey } from '../data/models'
import { permitSteps } from './../data/lifecycles'

/** The takeoff types not yet gathered for this model ('' model key → none). */
export function missingTakeoffs(
  modelTakeoffs: WorkbenchState['modelTakeoffs'],
  model: string,
): TakeoffType[] {
  const key = modelKey(model)
  if (!key) return []
  const got = modelTakeoffs?.[key] ?? {}
  return TAKEOFF_TYPES.filter((t) => !got[t.id]?.done)
}

/** Is this project's permit issued? (That's when missing takeoffs become a fire.)
 *  Keyed off the FINAL permit step of the (possibly owner-edited) list — same
 *  edit-safe rule as isPermitDone — so it survives renaming/replacing 'issued'. */
export function permitIssued(ps: ProjectState): boolean {
  const steps = permitSteps()
  return steps.length > 0 && Boolean(ps.steps.permit[steps[steps.length - 1].id]?.done)
}
