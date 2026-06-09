/**
 * takeoffs.ts (lib) — which takeoffs are still MISSING for a model, and how
 * urgent that is for a given project. Pure logic.
 */
import type { ProjectState, WorkbenchState } from '../types'
import { TAKEOFF_TYPES, type TakeoffType } from '../data/takeoffs'
import { modelKey } from '../data/models'

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

/** Is this project's permit issued? (That's when missing takeoffs become a fire.) */
export function permitIssued(ps: ProjectState): boolean {
  return !!ps.steps.permit.issued?.done
}
