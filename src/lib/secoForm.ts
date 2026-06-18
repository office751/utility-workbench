/**
 * secoForm.ts — pre-fill the SECO "Single-Site Residential Notification of New
 * Construction" PDF from everything the app already knows, so the only things
 * left for Adam are the few radio buttons (Single Family / service type /
 * preferred contact) and his signature.
 *
 * The blank form is a real fillable AcroForm bundled at public/forms/ (41 named
 * fields). We fill the TEXT fields + the voltage dropdown only — the radio
 * buttons use non-semantic indices ('/0'../'/5') in this PDF, so auto-selecting
 * one risks silently picking "Multiple Family" over "Single Family". Three
 * clicks + a signature is safer than a wrong box.
 *
 * pdf-lib is heavy, so it's lazy-imported here (same rule as xlsx) — this module
 * is only pulled into the bundle when someone actually downloads a SECO form.
 */
import type { Project, ProjectState } from '../types'
import { COMPANY } from '../data/contacts'
import { LEGAL_PLACEHOLDER, legalFor } from '../data/legal'
import { specFor } from '../data/models'

/** The bundled blank form, served as a static asset. */
export const SECO_BLANK_FORM_URL = '/forms/SECO_Load_Form_BLANK.pdf'

/**
 * Parse a legal-description string into the SECO form's location fields.
 * "Sec 34 / Twp 15 / Rge 18 · Blk 8 · Lot 9" → {section, township, range,
 * block, lot}. Complex metes-and-bounds legals won't match Blk/Lot — those
 * fields stay blank (Adam fills them), which is the right failure mode.
 */
function parseLegal(legal: string) {
  const grab = (re: RegExp) => legal.match(re)?.[1]?.trim() ?? ''
  return {
    section: grab(/Sec\s+([0-9A-Za-z]+)/i),
    township: grab(/Twp\s+([0-9A-Za-z]+)/i),
    range: grab(/Rge\s+([0-9A-Za-z]+)/i),
    block: grab(/Blk\s+([0-9A-Za-z]+)/i),
    lot: grab(/Lots?\s+([0-9][0-9 &]*)/i),
  }
}

/** Split the combined "Iron Shield Electric — 352-492-3470" contact string. */
function electrician() {
  const [name, phone] = COMPANY.electrician.split('—').map((s) => s.trim())
  return { name: name ?? '', phone: phone ?? '' }
}

/**
 * Fill the SECO load form's text fields + voltage from a project and return the
 * filled PDF bytes. Takes the blank PDF bytes as input (the caller fetches
 * SECO_BLANK_FORM_URL) so this stays unit-testable without a browser.
 */
export async function fillSecoLoadForm(
  blank: ArrayBuffer | Uint8Array,
  p: Project,
  ps: ProjectState,
): Promise<Uint8Array> {
  void ps // reserved (service type drives a radio we leave for the human)
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(blank)
  const form = doc.getForm()

  const spec = specFor(p.model)
  const legal = legalFor(p.parcel)
  const loc =
    legal === LEGAL_PLACEHOLDER
      ? { section: '', township: '', range: '', block: '', lot: '' }
      : parseLegal(legal)
  const elec = electrician()
  // COMPANY.mailing = "PO Box 5651, Ocala, FL 34478" → street + "city, state zip"
  const [mailStreet, ...mailRest] = COMPANY.mailing.split(',')
  const mailCityStateZip = mailRest.join(',').trim()

  // SECO field name → value. Only non-empty values are written; a missing field
  // (form revved) is skipped, never fatal.
  const text: Record<string, string> = {
    Address: p.address,
    'City State': `${p.city}, FL`,
    Zip: p.zip,
    Parcel: p.parcel,
    County: 'Marion',
    'Permit Number': p.permit,
    Lot: loc.lot,
    Block: loc.block,
    Section: loc.section,
    Township: loc.township,
    Range: loc.range,
    'HVAC footage': spec.sqft ? String(spec.sqft) : '',
    tons: spec.tons ? String(spec.tons) : '',
    'AC size': spec.tons ? '1' : '', // number of A/C units
    KW: '8', // standard heat-strip
    Amps: '200', // main panel
    'Motor size': 'N/A',
    'Account Holder Name': COMPANY.name,
    email1: COMPANY.email,
    'mailing address': mailStreet.trim(),
    'city state zip': mailCityStateZip,
    telephone: COMPANY.phone,
    'Contractor name': elec.name, // Electrical Contractor Name
    'contractor phone': elec.phone,
  }

  for (const [name, value] of Object.entries(text)) {
    if (!value) continue
    try {
      form.getTextField(name).setText(value)
    } catch {
      // field missing/renamed in a future form revision — skip, don't break.
    }
  }

  // Voltage is a dropdown with a clean "120/240V 1ph" option.
  try {
    form.getDropdown('Voltage').select('120/240V 1ph')
  } catch {
    // option/field changed — leave it for the human.
  }

  return doc.save()
}
