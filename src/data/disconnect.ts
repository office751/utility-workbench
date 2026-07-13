/**
 * disconnect.ts — how to CLOSE OUT a job's utility accounts when the home
 * sells. The mirror image of the "apply / start service" flows: once a spec
 * home closes, the electric + water accounts Iron Shield opened during the
 * build have to be STOPPED (or transferred to the buyer) so we stop getting
 * billed. Each utility handles this differently, so each gets the right kind
 * of button on its tab (wired up in Detail.tsx):
 *
 *   • link       → just open the utility's stop-service page in a new tab
 *                  (Duke, SECO — the request itself happens on their site).
 *   • form+email → draft the request email; a form + proof-of-sale must be
 *                  ATTACHED by hand first, because a mailto can't carry files
 *                  (Marion County Utilities water/sewer).
 *
 * These built-in defaults live here the same way the START-service contacts
 * live in contacts.ts — the URLs/addresses are hardcoded; only the email
 * WORDING is editable (🛠 Settings → Templates, id 'water:disconnect'). If one
 * of these pages/addresses ever changes, edit it HERE and every project
 * follows. (Clay + owner-added custom companies are phone-only for now, so
 * they simply don't get a disconnect button yet — a deliberate gap.)
 */
import type { Project, ProjectState, TemplateOverride } from '../types'
import { OFFICE_CC } from './contacts'
import {
  DEFAULT_DISCONNECT_WATER_BODY,
  DEFAULT_DISCONNECT_WATER_SUBJECT,
  effectiveTemplate,
  renderTemplate,
} from '../lib/templates'

/** A utility whose disconnect is just a web page you open. */
export interface DisconnectLink {
  /** Opens in a new tab — the utility's own stop-service page/form. */
  url: string
  /** Backup phone, when the online flow doesn't fit (or you'd rather call). */
  phone?: string
  /** One-line caption shown under the button (advance notice, login needed…). */
  note?: string
}

/**
 * Electric disconnect, keyed by the same code utilityOf() returns (SECO/DUKE).
 * Both are "open the utility's stop-service page" links — SECO has a public
 * online form; Duke's lives behind the Iron Shield My Account login.
 */
export const ELECTRIC_DISCONNECT: Record<string, DisconnectLink> = {
  SECO: {
    url: 'https://secoenergy.com/form/stop-service-form',
    phone: '352-793-3801',
    note: "SECO's online Stop Service form — allow ~1 business day. Only the member of record (Iron Shield) can stop service.",
  },
  DUKE: {
    url: 'https://www.duke-energy.com/my-account/stop-service',
    phone: '800-777-9898',
    note: "Opens Duke's Stop Service page — sign in to the Iron Shield My Account, or call the number.",
  },
}

/**
 * Marion County Utilities (water/sewer) disconnect — a completed disconnection
 * request form + proof of sale, emailed to the county's utilities inbox. This
 * is deliberately a DIFFERENT contact than start-of-service (Dawn Cook in
 * contacts.ts): closeouts route to the general Utilities@ inbox.
 */
export const MCU_WATER_DISCONNECT = {
  /** Where the blank disconnection request form lives (open → download → fill). */
  formUrl: 'https://utilities.marionfl.org/customer-service/customer-service',
  /** Where the completed form + deed get emailed. */
  email: 'Utilities@MarionFL.org',
  phone: '352-307-6000',
  /** What must be ATTACHED before sending — a mailto can't attach for you, so
   *  these are shown as a checklist and repeated in the confirm dialog. */
  attachments: [
    'Completed MCU disconnection request form',
    'Notarized warranty deed (proof of sale)',
  ],
  note: 'Marion County allows 2–3 business days to process. Attach the completed form + the notarized warranty deed before sending.',
} as const

/** Everything the MCU water/sewer disconnect email needs. */
export interface WaterDisconnectDraft {
  to: string
  subject: string
  body: string
  mailto: string
  /** Files to attach by hand (shown as a checklist + in the confirm dialog). */
  attachments: string[]
}

/**
 * Draft the MCU water/sewer disconnect email for one house. Wording comes from
 * the editable 'water:disconnect' template; the routing (Utilities@MarionFL.org,
 * office CC) is fixed. mailto only — no project data is mutated, and the form +
 * deed still have to be attached by hand before it's sent.
 */
export function waterDisconnectDraft(
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
): WaterDisconnectDraft {
  const t = effectiveTemplate(overrides, 'water:disconnect', {
    subject: DEFAULT_DISCONNECT_WATER_SUBJECT,
    body: DEFAULT_DISCONNECT_WATER_BODY,
  })
  const vars: Record<string, string> = {
    address: p.address,
    site: `${p.address}, ${p.city}, FL ${p.zip}`,
    parcel: p.parcel,
    permit: p.permit,
    // A closing date makes the request concrete; fall back to a clear
    // placeholder so the draft never ships an empty "effective date" line.
    closing: ps.closingDate || '[closing date]',
  }
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)
  const to = MCU_WATER_DISCONNECT.email
  return {
    to,
    subject,
    body,
    attachments: [...MCU_WATER_DISCONNECT.attachments],
    mailto: `mailto:${to}?cc=${encodeURIComponent(OFFICE_CC)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  }
}
