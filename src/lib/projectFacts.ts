/**
 * projectFacts.ts — the PURE logic behind "edit a house's fixed facts"
 * (⚙️ Project settings → 🏠 Project details).
 *
 * Editing a roster fact looks trivial ("just change the string"), but one of
 * them — the PERMIT NUMBER — is a KEY other systems look things up by:
 *
 *   - the county-portal + SharePoint links (data/sharepoint.ts maps are keyed
 *     by permit #),
 *   - the nightly permit scanner's project matching,
 *   - the *inferred* permit checklist (data/seed.ts inferPermitSteps reads
 *     county data keyed by permit #, else guesses from the number's format).
 *
 * So when the permit # changes we re-derive that project's permit checklist —
 * exactly the way migrate() in useProjects does on every load — but ONLY while
 * the checklist is still machine-derived. If you've hand-toggled a step, your
 * edits win and we leave the checklist alone.
 *
 * Everything here is a pure function (state in → new state out, no React, no
 * storage) so it can be unit-tested — see projectFacts.test.ts.
 */
import type { Project, StepState, WorkbenchState } from '../types'
import { emptyProjectState, inferPermitSteps } from '../data/seed'

/**
 * Has the user MANUALLY touched this project's permit checklist?
 *
 * Machine-derived steps carry sentinel "dates" — '(county)' from portal data,
 * '(inferred)' from the permit-number format. A REAL date (stamped by
 * toggleStep when you click a checkbox) — or any other marker, like the
 * '(C.O.)' on finished homes — means a human decided, so auto-re-derivation
 * must keep its hands off.
 *
 * This is the SAME test migrate() uses on load; it lives here so the two
 * callers can never drift apart.
 */
export function hasManualPermitEdits(permitSteps: Record<string, StepState>): boolean {
  return Object.values(permitSteps).some(
    (s) => s.date && s.date !== '(inferred)' && s.date !== '(county)',
  )
}

/**
 * The whole decision in one testable place: re-derive the permit checklist
 * only when the permit # ACTUALLY changed AND the checklist is still
 * machine-derived (no manual edits to protect).
 */
export function shouldRederivePermitSteps(
  oldPermit: string,
  newPermit: string | undefined, // undefined = the patch didn't touch the permit
  permitSteps: Record<string, StepState>,
): boolean {
  if (newPermit === undefined || newPermit === oldPermit) return false
  return !hasManualPermitEdits(permitSteps)
}

/**
 * Apply a facts patch to the whole app state. This is the body of the
 * useProjects `updateProjectFacts` updater, kept pure so it's testable:
 *
 *   1. TRIM every string in the patch (a pasted permit # often drags a
 *      trailing space along — that would silently break the portal-link and
 *      scanner lookups, which match the string exactly).
 *   2. NO-OP GUARD: if nothing actually differs from the saved facts, return
 *      `prev` UNCHANGED — same object identity, so React skips the re-render
 *      and the debounced cloud save never fires.
 *   3. PERMIT WIRING: if the permit # changed, re-derive the permit checklist
 *      (see shouldRederivePermitSteps above).
 *
 * Note this returns ONE new state — the roster edit and the checklist
 * re-derive land together, honoring the app's "one setState per user action"
 * rule (two separate updates would clobber each other; see CLAUDE.md).
 */
export function applyFactsPatch(
  prev: WorkbenchState,
  id: number,
  patch: Partial<Project>,
): WorkbenchState {
  const cur = prev.roster.find((p) => p.id === id)
  if (!cur) return prev // unknown project — nothing to do

  // 1) Trim the strings; drop `id` if a caller ever passes it (a project's id
  //    is its identity — changing it would orphan all its saved progress).
  const clean = Object.fromEntries(
    Object.entries(patch)
      .filter(([k]) => k !== 'id')
      .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
  ) as Partial<Project>

  // 2) No-op guard: does ANY cleaned value differ from what's saved?
  const changed = (Object.keys(clean) as (keyof Project)[]).some((k) => clean[k] !== cur[k])
  if (!changed) return prev

  const next: WorkbenchState = {
    ...prev,
    roster: prev.roster.map((p) => (p.id === id ? { ...p, ...clean } : p)),
  }

  // 3) Permit-number wiring: keep the inferred checklist in sync with the new
  //    number — unless the user has hand-toggled steps (their edits win).
  const ps = prev.projects[id] ?? emptyProjectState()
  if (shouldRederivePermitSteps(cur.permit, clean.permit, ps.steps.permit)) {
    next.projects = {
      ...prev.projects,
      [id]: { ...ps, steps: { ...ps.steps, permit: inferPermitSteps(clean.permit ?? '') } },
    }
  }

  return next
}
