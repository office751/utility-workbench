/**
 * inrbNotice.ts — fill the DEP "Notice" for an In-ground Nitrogen-Reducing
 * Biofilter (INRB) septic system (the recorded-notice step for INRB houses).
 *
 * The notice must be signed by the property owner, notarized, and RECORDED at
 * the courthouse; the stamped copy then goes to DEP (via Georges Plumbing) for
 * final approval. So we fill ONLY the property/permit fields and leave every
 * owner signature, date, print-name and notary line blank for wet ink.
 *
 * FORM VERSION: the DEP form dated 9-15-26 ("New INRB notice 9-15-26.pdf",
 * from Vicki at Georges Plumbing, Oct 29 2026). It replaced the old DOH form —
 * no lot / block / subdivision and no witness lines any more. Blank lives at
 * public/templates/INRB_NOTICE_DEP_BLANK.pdf (archived in OneDrive
 * Operations/Templates). scanner/inrb-notice.py is the CLI twin of this module
 * and uses the same coordinate table — keep them in sync.
 *
 * Spec: docs/BRAINS.md § inrbNotice.ts. Pure logic except fillInrbNotice(),
 * which fetches the template and lazy-loads pdf-lib (bundle size).
 */
import type { Project, ProjectState } from '../types'

/** The fields we fill. Everything else on the form (owner signatures, dates,
 *  print names, notary) is written by hand. */
export interface InrbValues {
  address: string // street address, city, FL zip
  parcel: string // county parcel # ("Parcel ID#")
  permit: string // DEP septic construction permit #, e.g. "42-S1-5167182"
  county: string // notary block "COUNTY OF ___" — Marion unless notarized elsewhere
}

/** Where each value gets typed (PDF points, origin bottom-left, US Letter).
 *  Measured from the label positions on the DEP 9-15-26 blank itself (no
 *  county-accepted filled example of this version exists yet) and checked
 *  against a render. Re-measure, don't nudge by eye. */
const FIELD_POS: Record<keyof InrbValues, { x: number; y: number; size: number; maxW: number }> = {
  address: { x: 122, y: 685, size: 11, maxW: 380 }, // Address ____ (line runs to x≈507)
  parcel: { x: 130, y: 660, size: 11, maxW: 375 }, // Parcel ID#____ (line runs to x≈510)
  permit: { x: 126, y: 498.5, size: 11, maxW: 140 }, // "…permit number for the system is ____."
  county: { x: 324, y: 217.5, size: 10, maxW: 46 }, // notary venue: COUNTY OF ____
}

/** "20073 SW Rainbow Lakes Blvd, Dunnellon, FL 34431" — blanks dropped. */
export function inrbAddressLine(p: Project): string {
  const stateZip = ['FL', (p.zip ?? '').trim()].filter(Boolean).join(' ')
  return [(p.address ?? '').trim(), (p.city ?? '').trim(), stateZip].filter(Boolean).join(', ')
}

/** Pre-fill the form from what the app already knows about the house. */
export function inrbDefaults(p: Project, ps: ProjectState): InrbValues {
  return {
    address: inrbAddressLine(p),
    parcel: (p.parcel ?? '').trim(),
    permit: (ps.septicPermit ?? '').trim(),
    county: 'Marion',
  }
}

/**
 * Fill the official blank and return the finished PDF's bytes.
 * Caller turns them into a Blob URL and opens it for printing.
 */
export async function fillInrbNotice(values: InrbValues): Promise<Uint8Array> {
  // Lazy import — pdf-lib is ~300KB and only needed the moment a notice is
  // generated (same rule as SheetJS: keep it out of the main bundle).
  const { PDFDocument, StandardFonts } = await import('pdf-lib')

  const res = await fetch('/templates/INRB_NOTICE_DEP_BLANK.pdf')
  if (!res.ok) throw new Error(`Couldn't load the blank INRB form (${res.status})`)
  const doc = await PDFDocument.load(await res.arrayBuffer())
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.getPage(0)

  for (const key of Object.keys(FIELD_POS) as (keyof InrbValues)[]) {
    const text = (values[key] ?? '').trim()
    if (!text) continue
    const pos = FIELD_POS[key]
    // Shrink long text down to 7pt rather than run past the blank line.
    let size = pos.size
    while (size > 7 && font.widthOfTextAtSize(text, size) > pos.maxW) size -= 0.5
    page.drawText(text, { x: pos.x, y: pos.y, size, font })
  }
  return doc.save()
}
