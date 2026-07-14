/**
 * nextAction.ts — pure logic, no UI.
 *
 * "Given a project and its saved progress, what's the situation?"
 * These little functions answer questions the components ask:
 *   which utility is it really?  does it still need territory verification?
 *   what's the next thing to do?
 *
 * Keeping logic out of components means we can reuse it everywhere
 * (sidebar hints, the detail banner, Milestone 4's dashboard buckets)
 * without copy-pasting.
 */
import type {
  PermitResponsible,
  Project,
  ProjectState,
  SepticSource,
  SepticSystem,
  ServiceType,
  Stream,
  Utility,
  WaterSource,
} from '../types'
import {
  type StepDef,
  closingSteps,
  electricSteps,
  isStepListCustomized,
  permitSteps,
  septicStepsFor,
  stepListKey,
  waterStepsFor,
} from '../data/lifecycles'

/** Edit-safe "done": the LAST step of a (possibly owner-edited) list is checked.
 *  For every built-in list the last step IS the old hard-coded done-step
 *  (power / cconn / sapproved / issued / wdrilled), so this matches today's
 *  behavior exactly — and keeps working when the owner adds/removes steps. */
function lastStepDone(steps: StepDef[], bucket: Record<string, { done?: boolean }>): boolean {
  if (steps.length === 0) return false
  return Boolean(bucket[steps[steps.length - 1].id]?.done)
}

/** Generic "first step not yet checked" walk. Used for electric/permit ONLY when
 *  the owner has customized that list — so the Next line follows their edits
 *  instead of the hand-coded default brain (which keys on built-in step ids). */
function firstPending(
  steps: StepDef[],
  bucket: Record<string, { done?: boolean }>,
  doneLabel: string,
): NextAction {
  for (const step of steps) if (!bucket[step.id]?.done) return { key: step.id, label: step.label }
  return { key: 'done', label: doneLabel }
}
import { PERMIT_PORTALS, PROJECT_FOLDERS } from '../data/sharepoint'
import { permitInfoOf } from '../data/permitDates'
import { shutoffFor } from './shutoff'

/**
 * Subdivisions where the electric territory is ambiguous and must be
 * verified before applying (same list as the original workbench).
 */
const VERIFY_RE = /silver springs|marion oaks|ocala waterway|coral ridge|hidden lake|woods & lakes/i

/** The effective utility: a user-set override wins over the roster value. */
export function utilityOf(p: Project, ps: ProjectState): Utility {
  return ps.electricCo ?? p.electricCo
}

/** OH/UG: override → roster → subdivision default (Rainbow Lakes is UG, Regal Park OH). */
export function serviceTypeOf(p: Project, ps: ProjectState): ServiceType {
  if (ps.serviceType) return ps.serviceType
  if (p.serviceType) return p.serviceType
  if (/rainbow lakes/i.test(p.subdivision)) return 'UG'
  if (/regal park/i.test(p.subdivision)) return 'OH'
  return ''
}

/** The effective engineer (override wins; ?? means "if not set, use..."). */
export function engineerOf(p: Project, ps: ProjectState): string {
  return ps.engineer ?? p.engineer
}

/** Utility confirmed = the user set one explicitly, or checked off "verify". */
export function confirmedUtility(ps: ProjectState): boolean {
  return Boolean(ps.electricCo || ps.steps.electric['verify']?.done)
}

/** Does this project still need its territory verified before applying? */
export function needsVerify(p: Project, ps: ProjectState): boolean {
  const ambiguous = VERIFY_RE.test(p.subdivision) || !utilityOf(p, ps)
  return ambiguous && !confirmedUtility(ps)
}

/** Lots that don't have a street number assigned yet ("TBD ..."). */
export function isTBD(p: Project): boolean {
  return /^tbd/i.test(p.address)
}

/** What a "next action" looks like: a machine key + a human label. */
export interface NextAction {
  key: string
  label: string
}

/* ==================== WHOSE COURT IS THE BALL IN? ==================== */

/**
 * Which "next action" keys mean the ball is in OUR court — something we can act
 * on right now, versus waiting on a utility, the county, or an installer.
 * This is THE single source for that judgment: lib/actionCenter.ts (the Today
 * command center) and electricNeedsAction (the project-list dots) both read it,
 * so the two screens can never disagree about whose move it is.
 */
export const OUR_COURT: Record<Stream, Set<string>> = {
  electric: new Set(['verify', 'apply', 'addr', 'deposit', 'rough', 'meternotify']),
  // water: set the source, confirm availability, apply, and the main-extension
  // agreement are ours; the tap/connect/well-drill are the utility/driller.
  water: new Set(['wsrc', 'cavail', 'capply', 'cwmagree']),
  // septic AND sewer (a Sewer lot resolves to SEWER_STEPS): eval/apply/county/
  // INRB-notice for septic, and confirm-availability/apply/pay-fees for sewer
  // are ours; final approval and the physical connection are not.
  septic: new Set(['seval', 'sapplied', 'scounty', 'snrb', 'sweravail', 'swerapply', 'swertap']),
  permit: new Set(['submitted', 'approved']), // submit it / go pick it up
  materials: new Set(), // handled via the order count instead
}

/** Is this stream's pending next-action something WE act on (vs. waiting on a
 *  utility/installer)? For built-in lists we use the curated OUR_COURT keys;
 *  once the owner CUSTOMIZES a list we can't know, so any pending custom step
 *  counts as our move (better surfaced than silently dropped). */
export function isOurCourtKey(stream: Stream, key: string, p: Project, ps: ProjectState): boolean {
  if (key === 'done') return false
  return OUR_COURT[stream].has(key) || isStepListCustomized(stepListKey(stream, p, ps))
}

/**
 * The electric brain: walk the lifecycle in order and report the first
 * thing that hasn't happened yet. Mirrors the original tool exactly.
 */
export function nextElectricAction(p: Project, ps: ProjectState): NextAction {
  const done = ps.steps.electric
  // Owner edited the electric checklist → follow their list, not the default brain.
  if (isStepListCustomized('electric')) return firstPending(electricSteps(), done, 'Complete')
  const u = utilityOf(p, ps)

  if (u === 'CLAY') return { key: 'clay', label: 'Clay Electric — outside SECO/Duke' }
  if (needsVerify(p, ps)) return { key: 'verify', label: 'Verify utility (territory)' }
  if (!done['submit']?.done) {
    return isTBD(p)
      ? { key: 'addr', label: 'Needs a house # before applying' }
      : { key: 'apply', label: 'Ready to apply' }
  }
  if (!done['deposit']?.done) return { key: 'deposit', label: 'Pay deposit / fees' }
  if (!done['engineer']?.done) return { key: 'eng', label: 'Awaiting engineer' }
  if (!done['rough']?.done) return { key: 'rough', label: 'Notify utility when rough plumbing passes' }
  if (!done['meternotify']?.done)
    return { key: 'meternotify', label: 'Notify utility ready for meter — send photos (green tag, downpipe, sweep, straps, clear path)' }
  if (!done['meter']?.done) return { key: 'field', label: 'Awaiting field work / meter set' }
  if (!done['power']?.done) return { key: 'power', label: 'Awaiting power on' }
  return { key: 'done', label: 'Complete' }
}

/** Fully done = the final electric step (power on) is checked. The account
 *  transfer used to be required here too, but it belongs to the SALE, not the
 *  build — since July 2026 it lives on the closing checklist, so a powered-up
 *  house finally reads Complete. */
export function isElectricDone(ps: ProjectState): boolean {
  return lastStepDone(electricSteps(), ps.steps.electric)
}

/**
 * "Needs action" = the ball is in OUR court (verify / apply / pay / notify).
 * Waiting on the utility (engineer, field work) does NOT count — nothing for
 * us to do there. Uses the shared OUR_COURT judgment so the list dots and
 * Today always agree (a hand-copied key list here once drifted from the
 * command center's). The shut-off-due nudge that used to live here moved to
 * closingNeedsAction — it's sale workflow now.
 */
export function electricNeedsAction(p: Project, ps: ProjectState): boolean {
  const key = nextElectricAction(p, ps).key
  return isOurCourtKey('electric', key, p, ps)
}

/* ================== CLOSING (the sale workflow) ================== */

/**
 * Is ONE closing step done? Everything reads this instead of poking the
 * bucket directly, because 'xfer' is special: it MIRRORS ps.transferred (the
 * field the shut-off deadline math reads) rather than being stored in
 * closingSteps — one source of truth, no drift.
 */
export function closingStepDone(ps: ProjectState, stepId: string): boolean {
  if (stepId === 'xfer') return Boolean(ps.transferred)
  return Boolean(ps.closingSteps?.[stepId]?.done)
}

/** Checked/total across the EFFECTIVE closing list (owner override aware) —
 *  powers the "3/8" progress on the Closing card and header pill. */
export function closingProgress(ps: ProjectState): { done: number; total: number } {
  const steps = closingSteps()
  return { done: steps.filter((s) => closingStepDone(ps, s.id)).length, total: steps.length }
}

/** Under contract with closing steps still unchecked — the working state. */
export function closingPending(ps: ProjectState): boolean {
  if (!ps.underContract) return false
  const { done, total } = closingProgress(ps)
  return done < total
}

/**
 * The closing FIRE: the electric shut-off deadline (2 business days after
 * closing) is 10 days out or closer and the account hasn't moved. Same
 * threshold the electric stream used before this became sale workflow.
 */
export function closingNeedsAction(ps: ProjectState): boolean {
  const so = shutoffFor(ps)
  return Boolean(so && so.daysLeft <= 10)
}

/* ======================== WATER ======================== */

/** The effective water source (user override wins over the roster). */
export function waterSourceOf(p: Project, ps: ProjectState): WaterSource {
  return ps.waterSource ?? p.waterSource
}

/** Walk the water checklist in order; report the first unchecked step. */
export function nextWaterAction(p: Project, ps: ProjectState): NextAction {
  const source = waterSourceOf(p, ps)
  if (!source) return { key: 'wsrc', label: 'Set water source' }
  for (const step of waterStepsFor(p, ps)) {
    if (!ps.steps.water[step.id]?.done) return { key: step.id, label: step.label }
  }
  return {
    key: 'done',
    label: source === 'Well' ? 'Well installed ✓' : 'Water connected ✓',
  }
}

/** Water is "done" when the final step of its resolved list is checked
 *  (well-drilled for wells, connected for city). No source set → not done. */
export function isWaterDone(p: Project, ps: ProjectState): boolean {
  if (!waterSourceOf(p, ps)) return false
  return lastStepDone(waterStepsFor(p, ps), ps.steps.water)
}

export function waterNeedsAction(p: Project, ps: ProjectState): boolean {
  return nextWaterAction(p, ps).key !== 'done'
}

/* ==================== SEPTIC / SEWER ==================== */

/** Most ISC lots are septic — that's the default until set otherwise. */
export function septicSourceOf(ps: ProjectState): SepticSource {
  return ps.septicSource ?? 'Septic'
}

export function septicSystemOf(ps: ProjectState): SepticSystem {
  return ps.septicSystem ?? ''
}

export function nextSepticAction(ps: ProjectState): NextAction {
  for (const step of septicStepsFor(ps)) {
    if (!ps.steps.septic[step.id]?.done) return { key: step.id, label: step.label }
  }
  return {
    key: 'done',
    label: septicSourceOf(ps) === 'Sewer' ? 'Sewer connected ✓' : 'DEP approved ✓',
  }
}

export function isSepticDone(ps: ProjectState): boolean {
  return lastStepDone(septicStepsFor(ps), ps.steps.septic)
}

export function septicNeedsAction(ps: ProjectState): boolean {
  return nextSepticAction(ps).key !== 'done'
}

/* ====================== PERMITTING ====================== */

/** Who's handling the permit (defaults to Us until set otherwise). */
export function permitResponsibleOf(ps: ProjectState): PermitResponsible {
  return ps.permitResponsible ?? 'Us'
}

/** The SharePoint folder: a typed-in URL wins over the CSV default (by permit#). */
export function sharepointFolderOf(p: Project, ps: ProjectState): string {
  return ps.sharepointUrl ?? PROJECT_FOLDERS[p.permit] ?? ''
}

/** The county permit-portal page: a typed-in URL wins over the CSV default. */
export function permitPortalOf(p: Project, ps: ProjectState): string {
  return ps.permitUrl ?? PERMIT_PORTALS[p.permit] ?? ''
}

/** The effective issued date: a typed-in value wins over the county data
 *  (live scanner record over the baked snapshot — see permitInfoOf). */
export function permitIssuedOf(p: Project, ps: ProjectState): string {
  return ps.permitIssuedDate ?? permitInfoOf(p.permit)?.issued ?? ''
}

/** The county's authoritative status string (e.g. "Issued", "In Review"), if known. */
export function permitCountyStatusOf(p: Project): string {
  return permitInfoOf(p.permit)?.status ?? ''
}

/** Report the next REQUIRED permit milestone. */
export function nextPermitAction(ps: ProjectState): NextAction {
  // Owner edited the permit checklist → follow their list, not the default brain.
  if (isStepListCustomized('permit')) return firstPending(permitSteps(), ps.steps.permit, 'Permit issued ✓')
  if (isPermitDone(ps)) return { key: 'done', label: 'Permit issued ✓' }
  // No steps done yet → it hasn't been submitted.
  if (!ps.steps.permit['submitted']?.done) return { key: 'submitted', label: 'Not submitted' }
  // "corrections" is an OPTIONAL aside (only when the county requests them),
  // so it never counts as the thing you're waiting on — skip it here.
  for (const step of permitSteps()) {
    if (step.id === 'corrections') continue
    if (!ps.steps.permit[step.id]?.done) return { key: step.id, label: step.label }
  }
  return { key: 'done', label: 'Permit issued ✓' }
}

/** Permit is done when the final permit step is checked. */
export function isPermitDone(ps: ProjectState): boolean {
  return lastStepDone(permitSteps(), ps.steps.permit)
}

/**
 * "Needs my action" = not issued yet AND we're the ones handling it.
 * If the owner or a GC is responsible, we still track it but it's not on us.
 */
export function permitNeedsAction(ps: ProjectState): boolean {
  if (isPermitDone(ps)) return false
  const who = permitResponsibleOf(ps)
  return who !== 'Owner' && who !== 'GC'
}

/**
 * Where the building permit stands, as ONE coarse bucket — powers the Projects
 * list's permit filter chips and each row's status pill.
 *
 * Deliberately fail-open toward the county's data: most of the roster predates
 * this app, so checklists were never ticked — but a county issued date or a
 * permit number on file is proof enough of where things really stand. Order:
 *   1. C.O. house           → 'co'         (closed out; outranks everything)
 *   2. issued               → 'issued'     (final step checked, a typed/county
 *                                           issued date — believe the county)
 *   3. Owner/GC responsible → 'not-ours'   (tracked, but not ours to push)
 *   4. any evidence of an application — a checked step, a county record, or a
 *      permit # on file (the county assigns numbers AT application)
 *                           → 'in-review'
 *   5. otherwise            → 'not-applied'
 */
export type PermitStatus = 'co' | 'issued' | 'not-ours' | 'in-review' | 'not-applied'

/** Display labels for the buckets (chips + row pills use these verbatim). */
export const PERMIT_STATUS_LABEL: Record<PermitStatus, string> = {
  co: 'C.O.',
  issued: 'Issued',
  'not-ours': 'Owner/GC',
  'in-review': 'In review',
  'not-applied': 'Not applied',
}

export function permitStatus(p: Project, ps: ProjectState): PermitStatus {
  if (p.listStatus === 'CO') return 'co'
  if (isPermitDone(ps) || permitIssuedOf(p, ps) !== '') return 'issued'
  const who = permitResponsibleOf(ps)
  if (who === 'Owner' || who === 'GC') return 'not-ours'
  const anyStepDone = Object.values(ps.steps.permit).some((s) => s?.done)
  if (anyStepDone || p.permit !== '' || permitInfoOf(p.permit)) return 'in-review'
  return 'not-applied'
}
