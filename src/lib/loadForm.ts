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
import { COMPANY, DUKE_EMAIL, OFFICE_CC, SECO_EMAIL } from '../data/contacts'
import { serviceTypeOf, utilityOf } from './nextAction'
import {
  DEFAULT_APPLY_DUKE_BODY,
  DEFAULT_APPLY_DUKE_SUBJECT,
  DEFAULT_APPLY_SECO_BODY,
  DEFAULT_APPLY_SECO_SUBJECT,
  effectiveTemplate,
  renderTemplate,
} from './templates'

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
Portal: builderportal.duke-energy.app  ·  Form reply to: ${DUKE_EMAIL}
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
    packet,
  }
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)
  const to = u === 'SECO' ? SECO_EMAIL : DUKE_EMAIL

  const m = specFor(p.model)
  const warnings: string[] = []
  if (!m.sqft || !m.tons) warnings.push('model specs incomplete')
  if (u === 'SECO' && legalFor(p.parcel) === LEGAL_PLACEHOLDER) warnings.push('legal description needs lookup')
  if (!p.permit) warnings.push('no permit # yet')

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
