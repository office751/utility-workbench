/**
 * lifecycles.ts — the checklist DEFINITIONS for every workstream.
 *
 * This is pure configuration: plain arrays of {id, label}. No component
 * hard-codes a checklist — they all render whatever this file says. So when
 * a process changes (utility adds a step, DEP renames something), you edit
 * ONE array here and every project updates.
 *
 * The `id` strings are the same vocabulary the original HTML workbench used
 * (verify, deposit, meter, cavail, snrb, ...) — that's what seed.ts keys on.
 */
import type { Project, ProjectState, Stream } from '../types'

/** One step in a checklist. */
export interface StepDef {
  id: string
  label: string
  /** Water only: step applies just to water-main-extension (CityWM) lots. */
  wmOnly?: boolean
}

/* ------------------------- ELECTRIC ------------------------- */
export const ELECTRIC_STEPS: StepDef[] = [
  { id: 'verify', label: 'Utility verified (territory confirmed)' },
  { id: 'submit', label: 'Application submitted to utility' },
  { id: 'deposit', label: 'Deposit / fee invoice paid' },
  { id: 'engineer', label: 'Engineer assigned / contacted' },
  { id: 'rough', label: 'Rough plumbing passed — notified utility' },
  { id: 'fieldsched', label: 'Field work scheduled' },
  { id: 'fielddone', label: 'Field work complete — notified utility' },
  { id: 'meter', label: 'Meter set / county inspection passed' },
  { id: 'power', label: 'Power ON' },
]

/* -------------------------- WATER --------------------------- */
// Well lots: the only thing Adam tracks here is whether the well is in the
// ground. (Permit/pump steps were dropped per his request — `isWaterDone` and
// `nextWaterAction` already key off `wdrilled`, so done-state is unchanged.)
export const WATER_STEPS_WELL: StepDef[] = [{ id: 'wdrilled', label: 'Well drilled & installed' }]

export const WATER_STEPS_CITY: StepDef[] = [
  { id: 'cavail', label: 'Water availability confirmed (Marion County Utilities)' },
  { id: 'capply', label: 'City water application submitted' },
  { id: 'cwmagree', label: 'Water-main extension — agreement & fees', wmOnly: true },
  { id: 'cwmbuilt', label: 'Water-main extension constructed', wmOnly: true },
  { id: 'ctap', label: 'Tap / meter set' },
  { id: 'cconn', label: 'Water connected' },
]

/* ---------------------- SEPTIC / SEWER ---------------------- */
export const SEPTIC_STEPS: StepDef[] = [
  { id: 'seval', label: 'Site / soil evaluation' },
  { id: 'sapplied', label: 'DEP Construction Permit — applied' },
  { id: 'sissued', label: 'DEP Construction Permit — issued' },
  { id: 'scounty', label: 'Septic permit submitted to County (applicant = property owner)' },
  { id: 'snrb', label: 'Recorded INRB notice sent to Georges Plumbing (INRB systems only)' },
  { id: 'sinstalled', label: 'System installed (tank + drainfield)' },
  { id: 'snwell', label: 'Notified Vicki — well installed' },
  { id: 'snwater', label: 'Notified Vicki — water line hooked up' },
  { id: 'snsod', label: 'Notified Vicki — SOD laid' },
  { id: 'sapproved', label: 'Final inspection / DEP approval' },
]

export const SEWER_STEPS: StepDef[] = [
  { id: 'sweravail', label: 'Sewer availability confirmed (Marion County Utilities)' },
  { id: 'swerapply', label: 'Sewer service application submitted' },
  { id: 'swertap', label: 'Sewer tap / connection fees paid' },
  { id: 'swerconn', label: 'Connected to public sewer' },
]

/* ------------------------- PERMITTING ----------------------- */
/* The building permit lifecycle. Same steps for every project, so there's
   no branching helper like water/septic have. */
export const PERMIT_STEPS: StepDef[] = [
  { id: 'submitted', label: 'Permit application submitted to county' },
  { id: 'review', label: 'Under review by county' },
  { id: 'corrections', label: 'Corrections requested / resubmitted (if any)' },
  { id: 'approved', label: 'Permit approved' },
  { id: 'issued', label: 'Permit issued / picked up' },
]

/* ===================================================================
   OWNER STEP OVERRIDES
   The lists above are the built-in DEFAULTS. The owner can edit any of them
   in-app (add/remove/rename/reorder); those edits live in the saved blob
   (WorkbenchState.stepOverrides) keyed by a stable "list key", and apply to
   EVERY house. We keep a module-level copy here so the pure step getters —
   called all over (Detail, nextAction, staleness, the investor snapshot) —
   can see the overrides without threading state through every signature.
   App.tsx calls applyStepOverrides() each render, before children compute.
   =================================================================== */
type StepOverrides = Record<string, StepDef[]>
let OVERRIDES: StepOverrides = {}

/** Sync the module copy from saved state. Call before anything reads steps. */
export function applyStepOverrides(o: StepOverrides | undefined): void {
  OVERRIDES = o ?? {}
}

/** Has the owner customized this list key (vs. using the built-in default)? */
export function isStepListCustomized(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(OVERRIDES, key)
}

/** The stable key for the step list a given stream/variant resolves to. The
 *  editor edits exactly the list the open tab shows. */
export function stepListKey(stream: Stream, p: Project, ps: ProjectState): string {
  if (stream === 'water') return 'water:' + (ps.waterSource ?? p.waterSource ?? 'unset')
  if (stream === 'septic') {
    if (ps.septicSource === 'Sewer') return 'septic:Sewer'
    return ps.septicSystem === 'INRB' ? 'septic:Septic-INRB' : 'septic:Septic'
  }
  return stream // 'electric' | 'permit'
}

/** The built-in default list for a stream/variant (ignores overrides). Used to
 *  seed the editor and to power "Reset to default". */
export function defaultStepsFor(stream: Stream, p: Project, ps: ProjectState): StepDef[] {
  if (stream === 'electric') return ELECTRIC_STEPS
  if (stream === 'permit') return PERMIT_STEPS
  if (stream === 'water') {
    const source = ps.waterSource ?? p.waterSource
    if (source === 'Well') return WATER_STEPS_WELL
    if (source === 'City') return WATER_STEPS_CITY.filter((s) => !s.wmOnly)
    if (source === 'CityWM') return WATER_STEPS_CITY
    return []
  }
  // septic
  if (ps.septicSource === 'Sewer') return SEWER_STEPS
  if (ps.septicSystem === 'INRB') return SEPTIC_STEPS
  return SEPTIC_STEPS.filter((s) => s.id !== 'snrb')
}

/** The EFFECTIVE step list for a stream/variant: the owner's override if any,
 *  else the built-in default. This is the single source every consumer uses. */
export function stepsFor(stream: Stream, p: Project, ps: ProjectState): StepDef[] {
  return OVERRIDES[stepListKey(stream, p, ps)] ?? defaultStepsFor(stream, p, ps)
}

// Convenience wrappers (same names callers already use; now override-aware).
export function waterStepsFor(p: Project, ps: ProjectState): StepDef[] {
  return stepsFor('water', p, ps)
}
export function septicStepsFor(ps: ProjectState): StepDef[] {
  // septic doesn't use Project fields; pass a stub for the shared resolver.
  return stepsFor('septic', { } as Project, ps)
}
/** Electric/permit have no project-dependent variant. */
export function electricSteps(): StepDef[] {
  return OVERRIDES['electric'] ?? ELECTRIC_STEPS
}
export function permitSteps(): StepDef[] {
  return OVERRIDES['permit'] ?? PERMIT_STEPS
}
