/**
 * catchup.ts — the "catch up" affordance's brain.
 *
 * Many houses predate the app: their real-world work is long done but the
 * per-stream checklists were never ticked, so every first-unchecked-step
 * consumer (nextAction, staleness, the Today moves list) reads years-old work
 * as "still pending". The fix is a one-click backfill: when a LATER step is
 * checked while EARLIER steps aren't, offer to mark the earlier ones done too.
 *
 * This module is only the pure decision — "which steps would a catch-up
 * tick?". The state write is useProjects.catchUpSteps (one setState); the
 * row the user clicks is rendered by Checklist.tsx.
 */
import type { StepState, Stream } from '../types'
import type { StepDef } from '../data/lifecycles'

export interface CatchUpPlan {
  /** The LAST checked step — the strongest evidence of real-world progress.
   *  Everything unchecked before it "must have happened". */
  anchor: StepDef
  /** The unchecked steps BEFORE the anchor that a catch-up would tick,
   *  in list order. Always at least one (else the plan is null). */
  targets: StepDef[]
}

/**
 * Is there a checklist "gap" worth offering to close?
 *
 * - anchor = the LAST checked step of the effective (possibly owner-edited)
 *   list. A house progressing normally — checked prefix, unchecked tail —
 *   has no gap, so the affordance never nags it.
 * - targets = every unchecked step before the anchor, EXCEPT the permit
 *   stream's 'corrections' step: it's an optional aside ("if any"), and
 *   bulk-ticking it would claim corrections happened that maybe never did.
 *   (Same special case staleness.ts applies — corrections is never the
 *   waited-on step.)
 * - Nothing checked, or nothing unchecked before the anchor → null.
 */
export function catchUpPlan(
  steps: StepDef[],
  bucket: Record<string, StepState>,
  stream: Stream,
): CatchUpPlan | null {
  let anchorIdx = -1
  for (let i = steps.length - 1; i >= 0; i--) {
    if (bucket[steps[i].id]?.done) {
      anchorIdx = i
      break
    }
  }
  if (anchorIdx <= 0) return null // nothing checked, or only the first step is

  const targets = steps
    .slice(0, anchorIdx)
    .filter((s) => !bucket[s.id]?.done)
    .filter((s) => !(stream === 'permit' && s.id === 'corrections'))
  if (targets.length === 0) return null

  return { anchor: steps[anchorIdx], targets }
}

/**
 * The sentinel display "date" a caught-up step carries — joins the family of
 * '(county)' / '(inferred)' / '(from list)' markers. Two properties matter:
 *
 * 1. NOT a parseable date, on purpose: backfillDoneAt (useProjects) won't
 *    mint a doneAt from it, so staleness never times a caught-up step — we
 *    know the work is behind us, not WHEN it happened (BRAINS invariant 3:
 *    "can't tell" beats guessing).
 * 2. It DOES count as a manual edit to hasManualPermitEdits (anything other
 *    than '(county)'/'(inferred)' does) — right, because a human decided to
 *    catch the list up, so the county auto-re-derive must keep its hands off.
 */
export const CAUGHT_UP_DATE = '(caught up)'
