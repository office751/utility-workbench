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

/** CC'd on outgoing application emails. */
export const OFFICE_CC = 'office@ironshieldconstruction.com'

/** Standard email signature. */
export const SIGNATURE = 'Thank you,\nAdam Stiles\nIron Shield Construction LLC\n352-809-3235'
