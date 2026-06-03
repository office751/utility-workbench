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
  Project,
  ProjectState,
  SepticSource,
  SepticSystem,
  ServiceType,
  Utility,
  WaterSource,
} from '../types'
import { septicStepsFor, waterStepsFor } from '../data/lifecycles'
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

/**
 * The electric brain: walk the lifecycle in order and report the first
 * thing that hasn't happened yet. Mirrors the original tool exactly.
 */
export function nextElectricAction(p: Project, ps: ProjectState): NextAction {
  const done = ps.steps.electric
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
  if (!done['meter']?.done) return { key: 'field', label: 'Awaiting field work / meter set' }
  if (!done['power']?.done) return { key: 'power', label: 'Awaiting power on' }
  return { key: 'done', label: 'Complete' }
}

/** Fully done = power is on AND the account was transferred after sale. */
export function isElectricDone(ps: ProjectState): boolean {
  return Boolean(ps.steps.electric['power']?.done && ps.transferred)
}

/**
 * "Needs action" = the ball is in OUR court (verify / apply / pay / notify),
 * or a shut-off deadline is 10 days out or closer. Waiting on the utility
 * (engineer, field work) does NOT count — nothing for us to do there.
 */
export function electricNeedsAction(p: Project, ps: ProjectState): boolean {
  const key = nextElectricAction(p, ps).key
  const so = shutoffFor(ps)
  return (
    ['verify', 'apply', 'addr', 'deposit', 'rough'].includes(key) ||
    Boolean(so && so.daysLeft <= 10)
  )
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

/** Water is "done" at well-drilled (wells) or connected (city). */
export function isWaterDone(p: Project, ps: ProjectState): boolean {
  const source = waterSourceOf(p, ps)
  if (source === 'Well') return Boolean(ps.steps.water['wdrilled']?.done)
  if (source === 'City' || source === 'CityWM') return Boolean(ps.steps.water['cconn']?.done)
  return false
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
  return septicSourceOf(ps) === 'Sewer'
    ? Boolean(ps.steps.septic['swerconn']?.done)
    : Boolean(ps.steps.septic['sapproved']?.done)
}

export function septicNeedsAction(ps: ProjectState): boolean {
  return nextSepticAction(ps).key !== 'done'
}
