/**
 * inrbNotice.ts — fill the Marion County DOH "In-ground Nitrogen-Reducing
 * Biofilter" written notice (the recorded-notice step for INRB septic systems).
 *
 * The notice must be signed by the property owner + two witnesses, notarized,
 * and RECORDED at the courthouse before DOH grants final approval — so we fill
 * ONLY the six data fields and leave every signature line blank for wet ink.
 *
 * We type onto the OFFICIAL blank form (public/templates/INRB_NOTICE_BLANK.pdf)
 * at the exact positions measured from a county-accepted filled example
 * (INRB_NOTICE_42-S1-5167182.pdf in the Construction Archive), so the printout
 * matches what has already worked. scanner/inrb-notice.py is the CLI twin of
 * this module and uses the same coordinate table — keep them in sync.
 *
 * Spec: docs/BRAINS.md § inrbNotice.ts. Pure logic except fillInrbNotice(),
 * which fetches the template and lazy-loads pdf-lib (bundle size).
 */
import type { Project, ProjectState } from '../types'

/** The six fields we fill. Everything else on the form is signature/notary. */
export interface InrbValues {
  permit: string // DOH septic construction permit #, e.g. "42-S1-5167182"
  propertyId: string // county parcel #
  lot: string
  block: string
  subdivision: string
  owner: string // property owner's PRINTED name (they still sign by hand)
}

/** Where each value gets typed (PDF points, origin bottom-left, US Letter).
 *  Measured from the county-accepted example — don't nudge these by eye. */
const FIELD_POS: Record<keyof InrbValues, { x: number; y: number; size: number; maxW: number }> = {
  propertyId: { x: 142.1, y: 638.5, size: 10, maxW: 135 }, // PROPERTY ID: ___ (stops at LOT:)
  lot: { x: 311.8, y: 638.2, size: 11, maxW: 38 },
  block: { x: 400.8, y: 638.2, size: 11, maxW: 55 },
  subdivision: { x: 140.2, y: 623.8, size: 10, maxW: 405 },
  permit: { x: 160.7, y: 607.2, size: 10, maxW: 385 },
  owner: { x: 155.6, y: 348.4, size: 12, maxW: 390 },
}

export const DEFAULT_OWNER = 'Iron Shield Construction LLC'

/**
 * Marion platted-subdivision parcels read SECTION-BLOCK-LOT
 * (1801-015-006 → block 15, lot 6; 9024-0545-28 → block 545, lot 28).
 * A PRE-FILL GUESS for the form — the UI labels it "check against the plat",
 * never gospel: a wrong lot/block would get RECORDED at the courthouse.
 */
export function lotBlockFromParcel(parcel: string | undefined): { lot: string; block: string } | null {
  const m = /^\d{4,5}-(\d{3,4})-(\d{2,4})$/.exec((parcel ?? '').trim())
  if (!m) return null
  // String(Number(…)) strips leading zeros: "015" → "15", "006" → "6".
  return { lot: String(Number(m[2])), block: String(Number(m[1])) }
}

/** Pre-fill the form from what the app already knows about the house. */
export function inrbDefaults(p: Project, ps: ProjectState): InrbValues {
  const lb = lotBlockFromParcel(p.parcel)
  return {
    permit: (ps.septicPermit ?? '').trim(),
    propertyId: (p.parcel ?? '').trim(),
    lot: lb?.lot ?? '',
    block: lb?.block ?? '',
    subdivision: (p.subdivision ?? '').trim(),
    // Blank ownerName = our own spec build (same convention as everywhere else).
    owner: (ps.ownerName ?? '').trim() || DEFAULT_OWNER,
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

  const res = await fetch('/templates/INRB_NOTICE_BLANK.pdf')
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
