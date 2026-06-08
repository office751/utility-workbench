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

/** The tabs/workstreams. 'materials' is the odd one out — see OrderItem. */
export type Stream = 'electric' | 'water' | 'septic' | 'permit' | 'materials'

/** Where a material order is in its little lifecycle. */
export type OrderStatus = 'toOrder' | 'ordered' | 'delivered' | 'installed'

/**
 * One material order for a project. Unlike the other streams (one lifecycle
 * per project), a project has a LIST of these — trusses, slab, cabinets, etc.
 */
export interface OrderItem {
  id: string // unique (crypto.randomUUID)
  category: string // 'Trusses', 'Slab package', … (from data/orders.ts, but free-form ok)
  status: OrderStatus
  vendor?: string
  neededBy?: string // YYYY-MM-DD — optional; powers lead-time hints later
  note?: string
  createdAt: string // display date it was captured
}

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
  | 'CO' // Certificate of Occupancy — house finished / closed out
  | 'Hold' // paused per the Construction Job List

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
  date?: string // when it was checked off — a friendly DISPLAY string ("6/3/2026")
  // when it was checked off — a machine ISO timestamp ("2026-06-03T14:05:00.000Z").
  // Unlike `date`, this is exact and sortable, so the stale-status math can ask
  // "how many days has this project been parked at its current stage?"
  doneAt?: string
  note?: string
}

/**
 * One attached file. The bytes live in Supabase Storage (the 'project-files'
 * bucket — see lib/files.ts); this is just the pointer we keep in saved state.
 */
export interface ProjectDoc {
  name: string
  addedAt: string // display date it was added to the list
  /**
   * Where the real file lives in the storage bucket. ABSENT on legacy entries
   * that were saved name-only (before real uploads existed) — those still show
   * in the list but can't be opened or shared.
   */
  path?: string
  size?: number // bytes — powers the "1.2 MB" hint
  type?: string // MIME type (e.g. "application/pdf"), when the browser knows it
}

/**
 * One per-permit portal NOTIFICATION — an FYI status note pulled from the county
 * portal by the scanner (e.g. "DEP construction permit received"). Dismissible,
 * but kept in history under the 🔔; the badge counts the undismissed ones.
 */
export interface PermitNote {
  sourceKey: string // stable id from the scanner (de-dupe); e.g. "portal:<permit>:fyi:<name>:<date>"
  text: string
  date?: string
  dismissed?: boolean
  createdAt?: string
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
  permitIssuedDate?: string // YYYY-MM-DD the permit was issued
  permitExpiresDate?: string // YYYY-MM-DD the permit expires (drives the alert)
  sharepointUrl?: string // link to this project's SharePoint folder
  permitUrl?: string // link to the county permit record/page
  permitDocs?: ProjectDoc[] // LEGACY: old name-only list, migrated into `docs`

  /**
   * Files attached to this project — usable from ANY stream, not just permit.
   * The bytes live in Supabase Storage; this holds only the pointers. Each one
   * can be shared by text/email via a signed link (see lib/files.ts).
   */
  docs?: ProjectDoc[]

  /**
   * Per-permit portal notifications (FYI notes from the county scan). Shown
   * under the 🔔 on the permit; dismissible but kept in history.
   */
  notifications?: PermitNote[]

  /** Material orders for this project (trusses, slab, cabinets, …). */
  orders?: OrderItem[]

  /** Checked-off steps, per stream, keyed by step id (e.g. "meter", "snrb"). */
  steps: Record<Stream, Record<string, StepState>>

  /** Free-text notes, one per stream. */
  notes: Record<Stream, string>
}

/**
 * A free-form to-do that ISN'T tied to one project's lifecycle — your IT,
 * office-manager, supply-ordering, and research work, across any company.
 * This is what turns the app from a construction tracker into a whole-day
 * command center.
 */
export interface Task {
  id: string
  text: string // what needs doing
  category: string // a "hat" id from data/hats.ts ('it', 'office', 'supplies'…)
  company?: string // which company it's for (free text), optional
  dueDate?: string // YYYY-MM-DD, optional — drives urgency
  waitingOn?: string // who's blocked waiting on you, optional — also drives urgency
  focus?: boolean // starred into "Today's Focus" (your daily Top few)
  done?: boolean
  doneAt?: string // ISO timestamp when completed
  createdAt: string // ISO timestamp when captured
  /**
   * Links this task to a project/permit — e.g. a county-portal hold or
   * plan-review rejection surfaced on that permit. Absent = free-standing task.
   */
  projectId?: number
  /**
   * Stable id for de-duping AUTO-created items so a re-scan updates instead of
   * duplicating (the permit scanner sets it, e.g. "portal:<permit>:<holdId>").
   * Absent for hand-entered tasks.
   */
  sourceKey?: string
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
  /** Free-form cross-role tasks (IT, office, supplies…) — not project-bound. */
  tasks: Task[]
  /**
   * One-time marker: the C.O./Hold homes from the Construction Job List have
   * been merged into the roster. Stays true so they're never re-added — that
   * way if you delete one, it stays deleted.
   */
  extrasSeeded?: boolean
}
