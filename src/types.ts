/**
 * types.ts — the shared "vocabulary" of the app.
 *
 * TypeScript types describe the SHAPE of our data. They don't exist when the
 * app runs — they're a safety net while coding: if you typo `project.adress`,
 * the editor underlines it in red instead of the app silently breaking.
 *
 * The big idea in this app — data lives in two places:
 *   1. FIXED FACTS  → the Project type, stored in src/data/projects.ts
 *      (address, parcel, which utility... things that don't change)
 *   2. PROGRESS     → the ProjectState type, stored in localStorage
 *      (checked-off steps, notes... things that change as you work)
 */

/** The workstreams every house has. */
export type Stream = 'electric' | 'water' | 'septic' | 'permit'

/** Who's handling the building permit — tracked even when it isn't us. */
export type PermitResponsible = 'Us' | 'Owner' | 'GC' | ''

/** Electric utility companies we deal with. '' = not known/verified yet. */
export type Utility = 'SECO' | 'DUKE' | 'CLAY' | ''

/** Overhead or underground electric service. */
export type ServiceType = 'OH' | 'UG' | ''

/** Where the house gets water. CityWM = city water + water-main extension. */
export type WaterSource = 'Well' | 'City' | 'CityWM' | ''

/** Septic (DEP onsite) or city sewer. */
export type SepticSource = 'Septic' | 'Sewer'

/** Septic system type — only INRB requires the recorded-notice step. */
export type SepticSystem = 'INRB' | 'ATU' | 'NA' | ''

/** Status carried over from the original list — used only to seed progress. */
export type ListStatus =
  | 'NotApplied'
  | 'Applied'
  | 'Scheduled'
  | 'MeterSet'
  | 'PowerOn'
  | 'InProgress'

/** One house. The fixed facts — see src/data/projects.ts. */
export interface Project {
  id: number
  address: string
  city: string
  zip: string
  model: string // floor plan, e.g. "F-LH"
  parcel: string // county parcel number
  subdivision: string
  electricCo: Utility
  permit: string // building permit #
  workOrder: string // Duke work-order #, when there is one
  serviceType: ServiceType
  listStatus: ListStatus | string
  engineer: string // assigned utility engineer, if known
  waterSource: WaterSource
}

/** One checklist step's saved state: checked or not, when, optional note. */
export interface StepState {
  done: boolean
  date?: string // when it was checked off (display string)
  note?: string
}

/**
 * One attached document. NOTE: for now we store only the file's NAME (not its
 * contents) — a placeholder until file storage is restructured. The upload UI
 * is real; the bytes aren't kept yet.
 */
export interface ProjectDoc {
  name: string
  addedAt: string // display date it was added to the list
}

/**
 * Everything that CHANGES for one project — this is what localStorage holds.
 * Fields marked `?` are optional overrides: e.g. if `electricCo` is set here,
 * it wins over the roster value (you verified/changed the utility).
 */
export interface ProjectState {
  electricCo?: Utility
  serviceType?: ServiceType
  engineer?: string
  waterSource?: WaterSource
  septicSource?: SepticSource
  septicSystem?: SepticSystem
  closingDate?: string // YYYY-MM-DD; drives the shut-off reminder
  transferred?: boolean // electric account transferred after sale

  // --- permit tab ---
  permitResponsible?: PermitResponsible // who's handling it (Us / Owner / GC)
  sharepointUrl?: string // link to this project's SharePoint folder
  permitUrl?: string // link to the county permit record/page
  permitDocs?: ProjectDoc[] // attached document names (placeholder storage)

  /** Checked-off steps, per stream, keyed by step id (e.g. "meter", "snrb"). */
  steps: Record<Stream, Record<string, StepState>>

  /** Free-text notes, one per stream. */
  notes: Record<Stream, string>
}

/** The whole saved blob. */
export interface WorkbenchState {
  /**
   * The roster itself — every house, fixed facts included. It STARTS as a
   * copy of src/data/projects.ts (seeded on first run), but once saved,
   * localStorage is the source of truth: the "+ Add project" form appends
   * here, so new houses survive refreshes and ride along with Export.
   */
  roster: Project[]
  /** Progress per project id (checked steps, notes, overrides). */
  projects: Record<number, ProjectState>
}
