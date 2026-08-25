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

/** Where a SECO new-construction application goes — one email, form + site
 *  plan attached up front. */
export const SECO_EMAIL = 'newconstruction@secoenergy.com'

/**
 * SECO's engineering team. Once the application is in and the account is set
 * up, the new-construction intake hands the job off to engineering — quotes
 * and status updates come from (and go to) here, not newconstruction@.
 */
export const SECO_ENGINEERING = {
  email: 'engineeringmsa@secoenergy.com',
  phone: '352-770-7326',
}

/**
 * Duke is different: you apply on the online Builder Portal FIRST, then Duke
 * emails you a Work Order # plus the blank load form, and you REPLY to that
 * email with the completed form + site plan. Which office writes you depends on
 * the job's territory — most Marion County jobs are Ocala, but the western /
 * Citrus side routes through Inverness. The reply must go back to whichever
 * office emailed you, and keep the "WO#…" in the subject (Duke explicitly warns
 * that removing it delays the response). Per-project office in ProjectState.dukeOffice.
 */
export const DUKE_EMAIL_OCALA = 'EDA-Ocala@duke-energy.com'
export const DUKE_EMAIL_INVERNESS = 'EDA-Inverness@duke-energy.com'
// (No single DUKE_EMAIL constant on purpose: a hardcoded default once let the
//  ✉️ Email Duke button silently misroute Inverness jobs to Ocala. Always pick
//  the office from ps.dukeOffice via dukeOfficeEmail() in lib/loadForm.ts.)

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

// (Jennifer's Permitting Service was removed Aug 2026 — permitting is 100%
//  in-house now; permits are submitted to the county ourselves.)

/** William Stiles — the licensed qualifier (CGC1533513); permit/utility
 *  filings ride his name. */
export const WILLIAM = { name: 'William Stiles', email: 'wfstiles@gmail.com' }

/** Preferred soil technician for septic soil tests. */
export const SOIL_TECH = {
  name: 'Craig Davis',
  company: 'Rapid Septic Consulting',
  email: 'RapidSepticConsulting@gmail.com',
}

/**
 * The standard subcontractor lineup that goes on every permit application —
 * when a sub changes, edit it HERE.
 *
 * `contactId` is the contact record ID in the Marion County permit portal
 * (EnerGov) — attach these existing contacts to new applications.
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
