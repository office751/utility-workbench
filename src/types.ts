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
  orderedOn?: string // YYYY-MM-DD — the date YOU placed the order
  neededBy?: string // YYYY-MM-DD — when it must be ON SITE; with the category's lead time (data/orders.ts) it drives the "order by" pill + Today's Order-NOW alerts (lib/leadTimes.ts)
  note?: string
  createdAt: string // display date it was captured
}

/** Who's handling the building permit — tracked even when it isn't us. */
export type PermitResponsible = 'Us' | 'Owner' | 'GC' | ''

/**
 * Electric utility "code" for a project. '' = not known/verified yet.
 * 'SECO' / 'DUKE' / 'CLAY' remain the three BUILT-IN codes that drive special
 * automated behavior (SECO's pre-filled PDF load form, Duke's web-portal
 * apply flow + office routing, Clay's phone-only contact card). Loosened from
 * a closed union to `string` so Adam can also store the id of a custom roster
 * entry from Settings → Utility companies setup (data/utilities.ts) — any
 * value that isn't SECO/DUKE/CLAY/'' is treated as contact-only: a name/phone
 * /email you call or email by hand, same as Clay today, just no bespoke
 * automation behind it.
 */
export type Utility = string

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
 * One inspection/review RESULT pulled off the county portal by the nightly
 * scanner. These are reference info — something you go LOOK at (🔍
 * Inspections tab + the project's Permit tab), deliberately NOT tasks:
 * inspection results were flooding the task list (June 2026).
 */
export interface InspectionItem {
  sourceKey: string // stable id from the scanner; "portal:<permit>:rej:<desc>"
  desc: string // e.g. "Foundation Pre-Pour"
  status: string // e.g. "Disapproved - no fees", "Partial Approval - Repeat Inspection"
  date?: string // the portal's inspection date (M/D/YYYY)
  noticedAt?: string // when the scanner first saw it
  // Mirrors PermitNote.dismissed: set true to HIDE this from the UI without
  // deleting it. We tombstone instead of removing because the nightly scanner
  // re-reconciles by sourceKey — a hard delete would just get re-added on the
  // next run, but a dismissed:true row is preserved (the scanner only refreshes
  // desc/status/date on an existing key, see scanner/scan.mjs).
  dismissed?: boolean
}

/**
 * One homeowner finish choice for a single category (paint color, flooring,
 * roof shingle…). Mirrors the printed Selections form: the client either picks
 * a common `option` OR writes their own under `writeIn` (or both — e.g. pick
 * "Quartz" and write the exact color). Both optional: an untouched category
 * just has no entry at all.
 */
export interface SelectionChoice {
  /** The picked option from the category's list (see data/selections.ts). */
  option?: string
  /** The client's own write-in, for anything not in the option list. */
  writeIn?: string
}

/**
 * The sign-off that LOCKS a project's selections. Once `locked` is true the
 * Selections tab goes read-only (an admin can unlock). Captures who signed and
 * when, mirroring the form's signature + date line.
 */
export interface SelectionLock {
  locked: boolean
  /** The client's typed signature. */
  signature?: string
  /** Printed name (the form has both a signature and a printed-name line). */
  printedName?: string
  /** ISO timestamp stamped the moment it was locked (new Date().toISOString()). */
  lockedAt?: string
}

/**
 * A project's full set of design-finish selections — the in-app version of the
 * printed Selections form. `interior` and `exterior` are keyed by the category
 * ids in data/selections.ts (e.g. interior['wallPaint'] = { option: '…' }).
 */
export interface ProjectSelections {
  /** Interior choices, keyed by SELECTION_CATEGORIES.interior[].id */
  interior: Record<string, SelectionChoice>
  /** Exterior choices, keyed by SELECTION_CATEGORIES.exterior[].id */
  exterior: Record<string, SelectionChoice>
  /** The form's free-text "Additional Requests" box. */
  additionalRequests?: string
  /** The sign-off lock (absent/unlocked until the client signs). */
  lock?: SelectionLock
}

/**
 * THE SELECTIONS CATALOG (what choices exist) — distinct from a project's
 * chosen values above. This is owner-editable in Settings and stored in the
 * cloud blob (WorkbenchState.selectionsCatalog), seeded from the code defaults
 * in data/selections.ts on first run.
 */

/** One selectable category. `id` is the STABLE storage key for saved choices —
 *  rename the label freely, but don't change an id once choices are saved. */
export interface SelectionCategory {
  id: string
  label: string
  options: string[]
  /** Placeholder for the write-in box (e.g. "Brand, color, size"). */
  hint?: string
  /** A direct "browse options online" link; overrides the vendor's website. */
  url?: string
  /** A finish-vendor id (data/vendors.ts) whose website is the default link. */
  vendorId?: string
  /** Hidden everywhere (kept for history; not shown on the tab or required). */
  hidden?: boolean
  /**
   * Per-option photos, keyed by the option's label → an image URL. Each value
   * is either an uploaded image's public URL (the 'selection-images' bucket) or
   * a pasted link. When a category has any, the tab shows clickable swatches
   * instead of a dropdown.
   */
  optionImages?: Record<string, string>
}

/** A section of the catalog (Interior / Exterior). */
export interface SelectionSection {
  id: 'interior' | 'exterior'
  label: string
  icon: string
  categories: SelectionCategory[]
}

/** Per-model tweaks to the shared catalog (the "per-model" part of
 *  shared-base-plus-tweaks). */
export interface ModelSelectionTweaks {
  /** Category ids hidden for this model. */
  hidden?: string[]
  /** Per-category option-list overrides for this model (replaces the base list). */
  options?: Record<string, string[]>
}

/** The whole owner-editable catalog: a shared base + per-model tweaks. */
export interface SelectionsCatalog {
  sections: SelectionSection[]
  /** Per-model tweaks, keyed by model key (data/models.ts modelKey). */
  perModel?: Record<string, ModelSelectionTweaks>
}

/**
 * Everything that CHANGES for one project — this is what localStorage holds.
 * Fields marked `?` are optional overrides: e.g. if `electricCo` is set here,
 * it wins over the roster value (you verified/changed the utility).
 */
export interface ProjectState {
  electricCo?: Utility
  serviceType?: ServiceType
  /** Duke only: which EDA office emailed the Work Order (Ocala vs Inverness),
   *  so the load-form reply goes back to the right place. Defaults to Ocala. */
  dukeOffice?: 'Ocala' | 'Inverness'
  engineer?: string
  waterSource?: WaterSource
  /** Overrides the default water contact (Marion County Utilities) with a
   *  data/utilities.ts roster entry id (kind 'water'). Leaving it unset
   *  preserves today's behavior exactly — MCU stays the contact shown. */
  waterCompanyId?: string
  septicSource?: SepticSource
  septicSystem?: SepticSystem
  /** Overrides the default septic/sewer contact (Georges Plumbing / Marion
   *  County Utilities) with a data/utilities.ts roster entry id (kind
   *  'sewer'). Leaving it unset preserves today's behavior exactly. */
  sewerCompanyId?: string
  closingDate?: string // YYYY-MM-DD; drives the shut-off reminder
  transferred?: boolean // electric account transferred after sale

  // --- closing (the sale workflow, July 2026) ---
  /** Set by the "Mark under contract" button — from then on the Closing card
   *  shows on this house's Overview and the UNDER CONTRACT pill on its row. */
  underContract?: boolean
  /**
   * The closing checklist's saved state (data/lifecycles.ts CLOSING_STEPS,
   * owner-editable under override key 'closing'). Deliberately its OWN bucket,
   * not a sixth stream — the five construction streams stay untouched. The
   * 'xfer' step is NOT stored here: it mirrors `transferred` above (one source
   * of truth for the shut-off math), written via useProjects.setClosingStep.
   */
  closingSteps?: Record<string, StepState>

  // --- ownership (who this house belongs to) ---
  /** Who owns the home. Blank = our own spec build (implied Iron Shield). */
  ownerName?: string
  /** True when this is an investor's project (not our own spec home). */
  isInvestorProject?: boolean
  /** The investor's name/company — pick an existing investor or type a new
   *  one. Just a label here; the actual portal LOGIN + access is the grant in
   *  investor_project_access (see lib/investor.ts). */
  investorName?: string

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

  /** Inspection/review results from the county portal (see InspectionItem). */
  inspections?: InspectionItem[]

  /** Material orders for this project (trusses, slab, cabinets, …). */
  orders?: OrderItem[]

  /** Homeowner design-finish selections (Interior/Exterior/Additional + sign-off
   *  lock). Optional: most houses predate this, so always read with a fallback
   *  (`ps.selections ?? defaultSelections()`). */
  selections?: ProjectSelections

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
  /**
   * Which operator owns this to-do — a person's display name, matching their
   * login name (app_users.display_name / myRole().name). Blank/undefined =
   * UNASSIGNED, the shared pile: an unassigned task shows in EVERYONE's queue
   * (fail-open) so nothing can vanish from both people's lists. Distinct from
   * ProjectState.ownerName (the HOMEOWNER) and waitingOn (who's blocked on you).
   * NOTE: stored as a name string to match waitingOn/ownerName — if a login is
   * renamed in 👥 People, re-assign affected tasks (no id back-reference).
   */
  assignedTo?: string
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

/**
 * Your edits to one workflow template (e.g. a vendor order email). Only the
 * fields you've changed are stored — anything unset falls back to the built-in
 * default, so new default improvements still reach untouched templates.
 */
export interface TemplateOverride {
  subject?: string
  body?: string
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
  /**
   * One-time marker: scanner-made inspection-result TASKS have been moved
   * into per-project `inspections` (they were flooding the task list).
   */
  inspectionsMigrated?: boolean
  /**
   * One-time marker: saved vendors have had their `catalog` (the company's
   * order menu) backfilled from the code defaults — so Florida Express, which
   * predates the field, gets its deliver/swap/remove menu. See migrate().
   */
  vendorCatalogsSeeded?: boolean
  /**
   * Custom wording for workflow templates (vendor order emails, and future
   * ones like the load form), keyed by template id — editable in ⚙️ Settings.
   */
  templates?: Record<string, TemplateOverride>
  /**
   * The owner-editable Selections catalog (what finish choices exist), with
   * per-model tweaks. Seeded from data/selections.ts defaults on first run;
   * after that the blob owns it (edited in Settings → Selections setup).
   */
  selectionsCatalog?: SelectionsCatalog
  /**
   * Which takeoffs have been GATHERED per house model (truss engineering,
   * framing package, …), keyed by model key → takeoff id. A model missing
   * takeoffs whose permit is already issued becomes a top-priority item.
   */
  modelTakeoffs?: Record<string, Record<string, { done: boolean; date?: string }>>
  /**
   * Per-model material order lists (the actual takeoff contents — e.g. Model
   * A's block count), keyed by model key → order category. When present, the
   * vendor order email includes the list under that item.
   */
  modelOrderLists?: Record<string, Record<string, string>>
  /**
   * Owner-added custom material categories for the Materials tab's
   * "＋ Add an order" picker. Built-in categories live in data/orders.ts;
   * when you add an order with a brand-new category (the composer's
   * "➕ Custom material…" option), addOrder remembers the name here so it
   * appears in the picker on every project afterward. Absent = none yet.
   */
  customOrderCategories?: string[]
  /**
   * The MODEL LIBRARY (📐 Models tab), keyed by model key ('A'…'E2'…).
   * Each model gets a shareable plans locker (same signed-link mechanics as
   * project files) plus editable facts the roster can't hold.
   */
  models?: Record<string, ModelState>
  /**
   * Owner-edited checklist steps, replacing the code defaults for a given
   * step-list (keyed by a stable list key like 'septic:Septic', 'water:Well',
   * 'electric', 'permit'). Absent key = use the built-in default list. Lets the
   * owner add/remove/rename/reorder steps in-app without code changes; applies
   * to every house. Shape mirrors lifecycles.ts StepDef (inlined to avoid an
   * import cycle).
   */
  stepOverrides?: Record<string, { id: string; label: string; wmOnly?: boolean }[]>
  /**
   * The team's names you can assign tasks to — edited in ⚙️ Settings, feeds the
   * "Assign to" dropdown on the Tasks tab. Just labels (matched to a person by
   * name); a name need not have a login. Your greeting + "my queue" still come
   * from your login's display_name (set in 👥 People), not from this list.
   */
  assignees?: string[]
  /**
   * The owner-editable Vendors directory (suppliers + their order-email info).
   * Seeded from data/vendors.ts defaults on first run; after that the blob owns
   * it (edited in 🛠 Settings → Vendor setup). Same pattern as selectionsCatalog.
   * Typed via an inline import so types.ts stays free of a runtime import cycle.
   */
  vendors?: import('./data/vendors').Vendor[]
  /**
   * Owner-editable EXTRA utility companies (Electric/Water/Sewer), for
   * territories not covered by the built-in SECO/Duke/Clay/Marion County
   * Utilities/Georges Plumbing. Seeded from data/utilities.ts defaults (an
   * empty list) on first run; after that the blob owns it (edited in 🛠
   * Settings → Utility companies setup). Same pattern as `vendors` above.
   */
  utilities?: import('./data/utilities').UtilityCompany[]
  /**
   * Heartbeat from the nightly permit scanner: scanner/scan.mjs (--write)
   * stamps this on every successful sync. 🏠 Today turns a stale stamp into a
   * "scanner has gone quiet" alert (logic in lib/scanHealth.ts) — added after
   * the June 2026 outage where the scan job died silently for 19 days.
   */
  scanMeta?: {
    lastScanAt?: string
    permitsRead?: number
    /**
     * Set by the 🔄 "Scan now" button on 🏠 Today. The office Mac's watcher
     * (scanner/watch-scan-request.mjs, launchd every 2 min) sees a request
     * newer than lastScanAt and runs the scan; the completed scan's
     * lastScanAt stamp is what clears the pending state on every device.
     */
    requestedAt?: string
  }
  /**
   * LIVE county permit dates, recorded by the nightly scanner (scan.mjs
   * --write) from each permit's portal summary: status / issue date / expire
   * date, keyed by permit number. The app reads these through
   * data/permitDates.ts `permitInfoOf()` (live over the baked snapshot,
   * field-wise non-empty-wins), so an EXTENSION approved at the county moves
   * the expiry countdown by itself. The scanner also compares each night's
   * expire date against the last known one and raises a permit notification
   * when it changes (sourceKey prefix "portal-evt:" — event history, never
   * pruned). Like scanMeta/assignees: MUST be carried through migrate() or
   * every app save strips what the scanner recorded (the blob-clobber
   * failure mode).
   */
  portalDates?: Record<
    string,
    { status?: string; issued?: string; expires?: string; checkedAt?: string }
  >
}

/** One model's library page: its plan files + editable facts. */
export interface ModelState {
  /** Plan files (PDFs, calcs, zips) — bytes live in Supabase Storage under
   *  models/<key>/, these are the pointers (same shape as project docs). */
  docs?: ProjectDoc[]
  /** Master-filed with the county: plans are on file, so permits reference
   *  the master file and energy calcs ride along (E2 is; see Jennifer flow). */
  masterFiled?: boolean
  /** Free-form notable info — revisions, engineer notes, quirks. */
  notes?: string
}
