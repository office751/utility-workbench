/**
 * contacts.ts — every phone number and email address in one place.
 * (All values carried over from the original workbench.)
 */
import type { Utility } from '../types'

/** Utility office phone numbers (electric tab call button). */
export const UTILITY_PHONES: Partial<Record<Utility, string>> = {
  SECO: '352-569-9594',
  DUKE: '352-239-5698',
  CLAY: '1-800-224-4917',
}

/** Where new-construction electric applications go. */
export const SECO_EMAIL = 'newconstruction@secoenergy.com'
export const DUKE_EMAIL = 'EDA-Ocala@duke-energy.com'

/** Marion County Utilities (city water + sewer). */
export const MCU = {
  name: 'Marion County Utilities',
  contact: 'Dawn Cook',
  phone: '352-307-6000',
  email: 'Dawn.Cook@marionfl.org',
}

/** The septic contractor / private provider. */
export const GEORGES = {
  name: 'Georges Plumbing & Excavating',
  contact: 'Vicki Kirby',
  phone: '352-406-1524',
  email: 'vicki@georgesplumbingflorida.com',
}

/** Marion County permitting / Building Safety office. */
export const MARION_PERMITTING = {
  name: 'Marion County Building Safety',
  phone: '352-438-2400',
  address: '2710 E. Silver Springs Blvd, Ocala, FL 34470',
}

/**
 * Jennifer's Permitting Service — our permitting agent. Every NEW permit
 * (anything we haven't already started permitting ourselves) gets handed off
 * to her via the 📨 button on a project's Permit tab. $400 per residential
 * new home; she obtains whatever documents we don't send.
 */
export const JENNIFER = {
  name: "Jennifer's Permitting Service, LLC",
  contact: 'Jennifer M. Privateer',
  phone: '352-817-4988',
  email: 'jenniferpermitting@yahoo.com',
}

/**
 * The standard subcontractor lineup that goes on every permit application.
 * This is the list Jennifer files with the county — when a sub changes,
 * edit it HERE and every future handoff email follows.
 *
 * `contactId` is the contact record ID in the Marion County permit portal
 * (EnerGov) — Jennifer attaches these existing contacts to new applications,
 * so the handoff email passes ID + email along with each name.
 * (Georges Plumbing is intentionally NOT in this list — they're our septic
 * contractor above, not the permitted plumbing sub.)
 */
export const PERMIT_SUBS = [
  { trade: 'Electrical', company: 'Iron Shield Electric Co.', contact: 'Dale Nadboralski', contactId: '21298', email: 'Mindywisenbaker@ironshieldelectric.com' },
  { trade: 'Mechanical (HVAC)', company: 'Iron Shield Heating & Air LLC', contact: 'Victor Oquendo', contactId: '22089', email: 'victor@ironshieldheatingandair.com' },
  { trade: 'Plumbing', company: 'Iron Shield Plumbing LLC', contact: 'Loren Nelson', contactId: '23046', email: 'wfstiles@gmail.com' },
  { trade: 'Roofing', company: 'Southern Pro Roofing LLC', contact: 'Bryan Hudson', contactId: '21603', email: 'southernproroofingllc@gmail.com' },
]

/** CC'd on outgoing application emails. */
export const OFFICE_CC = 'office@ironshieldconstruction.com'

/** Iron Shield's own info, as it appears on utility applications. */
export const COMPANY = {
  name: 'Iron Shield Construction',
  legalName: 'Iron Shield Construction LLC',
  mailing: 'PO Box 5651, Ocala, FL 34478',
  phone: '352-809-3235',
  email: 'office@ironshieldconstruction.com',
  electrician: 'Iron Shield Electric — 352-492-3470',
  siteContact: 'Adam Stiles',
}

// (No SIGNATURE constant anymore, on purpose: Adam's mail client appends his
// real signature to every draft, so app-added sign-offs were duplicates he
// had to delete each time. Drafts end at their content.)
