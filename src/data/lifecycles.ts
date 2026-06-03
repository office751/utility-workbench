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
import type { Project, ProjectState } from '../types'

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
export const WATER_STEPS_WELL: StepDef[] = [
  { id: 'wpermit', label: 'Well permit applied' },
  { id: 'wissued', label: 'Well permit issued' },
  { id: 'wdrilled', label: 'Well drilled / installed' },
  { id: 'wpump', label: 'Pump set & passed inspection' },
]

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

/**
 * Which water steps apply to a project? Depends on its source:
 *   Well → the well steps; City → city steps minus the WM-extension ones;
 *   CityWM → all city steps; unknown → none (must pick a source first).
 */
export function waterStepsFor(p: Project, ps: ProjectState): StepDef[] {
  const source = ps.waterSource ?? p.waterSource
  if (source === 'Well') return WATER_STEPS_WELL
  if (source === 'City') return WATER_STEPS_CITY.filter((s) => !s.wmOnly)
  if (source === 'CityWM') return WATER_STEPS_CITY
  return []
}

/**
 * Which septic steps apply? Sewer lots get the sewer list; septic lots get
 * the septic list, minus the INRB-notice step unless the system is INRB.
 */
export function septicStepsFor(ps: ProjectState): StepDef[] {
  if (ps.septicSource === 'Sewer') return SEWER_STEPS
  if (ps.septicSystem === 'INRB') return SEPTIC_STEPS
  return SEPTIC_STEPS.filter((s) => s.id !== 'snrb')
}
