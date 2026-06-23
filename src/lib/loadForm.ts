/**
 * loadForm.ts — builds the SECO / Duke new-construction electric application
 * for one house, pre-filled from everything the app knows: project facts,
 * per-model HVAC specs (data/models.ts), parcel legal descriptions
 * (data/legal.ts), and company info (data/contacts.ts).
 *
 * Ported line-for-line from the original Electric Applications Workbench's
 * secoPacket()/dukePacket() — the same text Adam has been hand-sending. Pure
 * logic: no React in here.
 */
import type { Project, ProjectState, TemplateOverride } from '../types'
import { specFor } from '../data/models'
import { legalFor, LEGAL_PLACEHOLDER } from '../data/legal'
import { COMPANY, DUKE_EMAIL_INVERNESS, DUKE_EMAIL_OCALA, OFFICE_CC, SECO_EMAIL, SECO_ENGINEERING } from '../data/contacts'
import { septicSourceOf, serviceTypeOf, utilityOf } from './nextAction'
import {
  DEFAULT_APPLY_DUKE_BODY,
  DEFAULT_APPLY_DUKE_SUBJECT,
  DEFAULT_APPLY_SECO_BODY,
  DEFAULT_APPLY_SECO_SUBJECT,
  DEFAULT_METERNOTIFY_BODY,
  DEFAULT_METERNOTIFY_SUBJECT,
  effectiveTemplate,
  renderTemplate,
} from './templates'

/**
 * The Duke EDA office this project's email goes to (defaults to Ocala — the
 * western/Citrus side is Inverness; set per project in ⚙️ Settings).
 *
 * This is the ONE place that maps ps.dukeOffice → an address. Every Duke email
 * the app builds (the Batch Apply load form + meter-notify here, and the
 * quick ✉️ Email Duke button in ContactLinks) must route through this helper so
 * they can never disagree about which office a house belongs to.
 */
export function dukeOfficeEmail(ps: ProjectState): string {
  return ps.dukeOffice === 'Inverness' ? DUKE_EMAIL_INVERNESS : DUKE_EMAIL_OCALA
}

/** The SECO single-site notification, filled in for one house. */
export function buildSecoPacket(p: Project, ps: ProjectState): string {
  const m = specFor(p.model)
  const legal = legalFor(p.parcel)
  const t = serviceTypeOf(p, ps) || 'UG'
  return `SECO — Single-Site Residential Notification of New Construction

DESCRIPTION: Single Family
LOCATION
  Address: ${p.address}
  City/State/Zip: ${p.city}, FL ${p.zip}
  Parcel ID#: ${p.parcel}
  Legal (Lot/Block/Sec/Twp/Rge): ${legal}
  Permit #: ${p.permit || '[n/a]'}    County: Marion
CONTACT
  Account Holder: ${COMPANY.name}  (Contractor)
  Email: ${COMPANY.email}
  Mailing: ${COMPANY.mailing}    Phone: ${COMPANY.phone}
  Electrical Contractor: ${COMPANY.electrician}
  Preferred contact: E-mail
CONSTRUCTION OPTIONS
  Permanent Service: ${t === 'OH' ? 'Overhead (30-ft easement)' : 'Underground (20-ft easement)'}
  Underground wire to be run? Yes
REQUIRED INFO
  Total HVAC square footage: ${m.sqft || '[confirm sqft]'}
  A/C Units: 1   Size: ${m.tons || '[confirm]'} Tons
  Heat Strip: 8KW/50AMPS    Main Panel: 200 AMPS    Motor: N/A
  Voltage: 120/240V 1ph
  (Sign + date before sending)`
}

/** The Duke builder-portal / service-information form, filled in for one house. */
export function buildDukePacket(p: Project, ps: ProjectState): string {
  const m = specFor(p.model)
  const t = serviceTypeOf(p, ps) || 'OH'
  const lotMatch = legalFor(p.parcel).match(/Lots? ([0-9 &]+)/)
  return `DUKE — Builder Portal / Residential Service Information Form
Portal: builderportal.duke-energy.app  ·  Form reply to: ${dukeOfficeEmail(ps)}
${p.workOrder ? 'Work Order: WO#' + p.workOrder : ''}
SERVICE ADDRESS / STRUCTURE
  Address: ${p.address}, ${p.city}, FL ${p.zip}
  Parcel: ${p.parcel}   Subdivision: ${p.subdivision}
  Zoning: Residential   Type of Structure: Single Family
  Lot (portal = single value): ${lotMatch ? lotMatch[1].split('&')[0].trim() : '[lot]'}   (full lot info in Directions box)
  Total Sq Ft of Home: ${m.sqft || '[confirm sqft]'}
LOAD (portal: whole-number tonnage)
  A/C Unit(s): 1 · ${m.tons || '[confirm]'} Ton · Gas NO
  Heat Strips: 1 · 8KW/50 AMPS · Gas NO
  Water Heater: 1 · 50 GAL · Gas NO
  Pool Heater / Tankless / Misc / Motor / EV: N/A
  Size of Main: 200 AMPS
  Permanent Service Entrance: ${t === 'UG' ? 'UG' : 'Overhead (OH)'}
CONTACT
  Account Billing: ${COMPANY.legalName}
  Site Contact: ${COMPANY.siteContact} · ${COMPANY.phone} · ${COMPANY.email}
  Electrician: ${COMPANY.electrician}
  Attach site plan.`
}

/** Everything the Batch Apply screen needs to draft one application. */
export interface ApplicationDraft {
  utility: 'SECO' | 'DUKE'
  to: string
  subject: string
  body: string
  packet: string
  mailto: string
  /** Data gaps worth flagging before sending. */
  warnings: string[]
}

/**
 * Build the ready-to-send application email for a project (SECO or Duke,
 * decided by its verified utility). Wording comes from the editable templates
 * (⚙️ Settings); the {{packet}} token injects the filled form above.
 */
export function applicationDraft(
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
): ApplicationDraft | null {
  const u = utilityOf(p, ps)
  if (u !== 'SECO' && u !== 'DUKE') return null

  const packet = u === 'SECO' ? buildSecoPacket(p, ps) : buildDukePacket(p, ps)
  const t = effectiveTemplate(
    overrides,
    `apply:${u}`,
    u === 'SECO'
      ? { subject: DEFAULT_APPLY_SECO_SUBJECT, body: DEFAULT_APPLY_SECO_BODY }
      : { subject: DEFAULT_APPLY_DUKE_SUBJECT, body: DEFAULT_APPLY_DUKE_BODY },
  )
  const vars: Record<string, string> = {
    address: p.address,
    site: `${p.address}, ${p.city}, FL ${p.zip}`,
    parcel: p.parcel,
    permit: p.permit,
    model: p.model,
    // Duke reply tokens: the WO# from Duke's email (loud placeholder until set),
    // and the septic clause that mirrors Adam's real wording on the site plan.
    workOrder: p.workOrder || '[paste WO# from Duke]',
    septic_clause: u === 'DUKE' && septicSourceOf(ps) !== 'Sewer' ? ' showing the septic location' : '',
    packet,
  }
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)
  const to = u === 'SECO' ? SECO_EMAIL : dukeOfficeEmail(ps)

  const m = specFor(p.model)
  const warnings: string[] = []
  if (!m.sqft || !m.tons) warnings.push('model specs incomplete')
  if (u === 'SECO' && legalFor(p.parcel) === LEGAL_PLACEHOLDER) warnings.push('legal description needs lookup')
  if (!p.permit) warnings.push('no permit # yet')
  // Duke is portal-first: you can't reply with the load form until Duke has
  // emailed you the Work Order #. Flag it loudly so a reply can't go out blind.
  if (u === 'DUKE' && !p.workOrder)
    warnings.push('no Duke WO# yet — apply on the portal first; Duke emails the WO# (~next day), then reply')

  return {
    utility: u,
    to,
    subject,
    body,
    packet,
    warnings,
    mailto: `mailto:${to}?cc=${encodeURIComponent(OFFICE_CC)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  }
}

/** Everything the "ready for meter" notification email needs. */
export interface MeterNotifyDraft {
  utility: 'SECO' | 'DUKE'
  to: string
  subject: string
  body: string
  mailto: string
  warnings: string[]
}

/**
 * Draft the "ready for meter — please set the meter" email for one house.
 * SECO routes to its engineering team (engineeringmsa@); Duke routes to the EDA
 * office that owns the territory (Ocala/Inverness, per ps.dukeOffice). Wording
 * comes from the editable 'electric:meternotify' template; the photo checklist
 * SECO asks for lives in the default body. Returns null for non-SECO/Duke
 * utilities (Clay/unknown) so the calling button can hide itself.
 */
export function meterNotifyDraft(
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
): MeterNotifyDraft | null {
  const u = utilityOf(p, ps)
  if (u !== 'SECO' && u !== 'DUKE') return null

  const to = u === 'SECO' ? SECO_ENGINEERING.email : dukeOfficeEmail(ps)
  const t = effectiveTemplate(overrides, 'electric:meternotify', {
    subject: DEFAULT_METERNOTIFY_SUBJECT,
    body: DEFAULT_METERNOTIFY_BODY,
  })
  const vars: Record<string, string> = {
    site: `${p.address}, ${p.city}, FL ${p.zip}`,
    utility: u === 'SECO' ? 'SECO' : 'Duke',
  }
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)

  return {
    utility: u,
    to,
    subject,
    body,
    warnings: [],
    mailto: `mailto:${to}?cc=${encodeURIComponent(OFFICE_CC)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  }
}
