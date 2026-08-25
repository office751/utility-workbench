/**
 * nocForm.ts — fill Marion County's Notice of Commencement (PMT 5, Rev
 * 9-20-22) for the Permit tab's "NOC — fill & print" card.
 *
 * The NOC must be recorded (and posted on the job site) BEFORE the first
 * inspection — FS 713.13. We type ONLY the informational fields; the
 * signature, date, title and the whole notary block stay blank for wet ink
 * (William signs as Owner, then it gets notarized and recorded).
 *
 * Field positions were measured from the official blank's own text layout
 * and visually verified against a recorded example
 * (NOC_1801-015-012.pdf, Book 8701/Page 1536). Template:
 * public/templates/NOC_BLANK.pdf.
 *
 * Prefill decisions (Adam, Aug 25 2026):
 *  - Owner 3a: the county PA's DEEDED owner (data/paProperty.ts). When
 *    that's Iron Shield → the Belleview office address. Anything else
 *    (investor, Mr Ocala Buys Houses, …) shows verbatim with a
 *    "verify on Sunbiz / check for a recent deed" nudge — the PA record
 *    can lag a closing by weeks, so the field stays editable.
 *  - Legal (line 1): the PA's FULL legal (plat book and all) + street
 *    address. Falls back to the compact legal, then a look-it-up
 *    placeholder — never silently blank.
 *  - Lender (6): always N/A (financed houses get their NOC from the
 *    lender/title company).
 *
 * Spec: docs/BRAINS.md § nocForm.ts.
 */
import type { Project, ProjectState } from '../types'
import { LEGAL_PLACEHOLDER, legalFor } from '../data/legal'
import { PA_OWNER, PA_RAW_LEGAL } from '../data/paProperty'

export interface NocValues {
  permit: string // county building permit #
  parcel: string // "Tax folio/Parcel ID"
  legal: string // full legal description + street address (line 1)
  improvement: string // "New Construction SFR"
  owner: string // 3a — name AND address, one line
  interest: string // 3b — "100%"
  feeSimple: string // 3c — "N/A"
  contractor: string // 4  — "Iron Shield Construction, LLC"
  contractorAddr: string // 4a — qualifier name + address
  contractorPhone: string // 4b
  surety: string // 5 — "N/A"
  bond: string // 5c — "N/A"
  lender: string // 6 — "N/A" (see header)
  designated: string // 7 — "N/A"
  designee: string // 8 "owner designates ___"
  designeeOf: string // 8 "of ___"
  designeePhone: string // 8 "phone ___"
  expiration: string // 9 — "N/A" (1 year by default)
}

export const NOC_OWNER_IRON_SHIELD =
  'Iron Shield Construction LLC, 4709 SE 102nd Pl, Unit 7, Belleview, FL 34420'

/** The contractor block, exactly as the recorded example had it. */
const CONTRACTOR = 'Iron Shield Construction, LLC'
const CONTRACTOR_ADDR = 'William Stiles PO BOX 5651, Ocala FL, 34478'
const CONTRACTOR_PHONE = '352-342-2206'

/** Line 1: the PA's full legal + the street address. */
export function nocLegalLine(p: Project): string {
  const legal = PA_RAW_LEGAL[p.parcel] ?? (legalFor(p.parcel) !== LEGAL_PLACEHOLDER ? legalFor(p.parcel) : '')
  const addr = [p.address, p.city ? `${p.city} FL` : '', p.zip].filter(Boolean).join(', ')
  return legal ? `${legal} — ${addr}` : `${LEGAL_PLACEHOLDER} — ${addr}`
}

/** 3a: deeded owner per the PA record; Iron Shield lots use the office
 *  address Adam picked. Returns [value, fromPa] — fromPa drives the
 *  "verify on Sunbiz" nudge in the UI. */
export function nocOwner(p: Project): { owner: string; fromPa: boolean } {
  const pa = (PA_OWNER[p.parcel] ?? '').trim()
  if (/IRON SHIELD/i.test(pa) || !pa) return { owner: NOC_OWNER_IRON_SHIELD, fromPa: false }
  return { owner: pa, fromPa: true }
}

export function nocDefaults(p: Project, _ps: ProjectState): NocValues {
  return {
    permit: (p.permit ?? '').trim(),
    parcel: (p.parcel ?? '').trim(),
    legal: nocLegalLine(p),
    improvement: 'New Construction SFR',
    owner: nocOwner(p).owner,
    interest: '100%',
    feeSimple: 'N/A',
    contractor: CONTRACTOR,
    contractorAddr: CONTRACTOR_ADDR,
    contractorPhone: CONTRACTOR_PHONE,
    surety: 'N/A',
    bond: 'N/A',
    lender: 'N/A',
    designated: 'N/A',
    designee: 'N/A',
    designeeOf: 'N/A',
    designeePhone: 'N/A',
    expiration: 'N/A',
  }
}

/** Where each value gets typed (PDF points, origin bottom-left, US Letter).
 *  Derived from the blank's own label coordinates; visually verified against
 *  the recorded example. Don't nudge by eye — re-measure. */
const FIELD_POS: Record<keyof NocValues, { x: number; y: number; size: number; maxW: number }> = {
  permit: { x: 97, y: 604, size: 10, maxW: 185 },
  parcel: { x: 392, y: 604, size: 10, maxW: 180 },
  legal: { x: 52, y: 550.5, size: 9, maxW: 522 }, // the full-width ruled line under item 1
  improvement: { x: 205, y: 534.5, size: 9, maxW: 365 },
  owner: { x: 140, y: 507, size: 9, maxW: 430 },
  interest: { x: 137, y: 495.5, size: 9, maxW: 380 },
  feeSimple: { x: 386, y: 483.5, size: 9, maxW: 185 },
  contractor: { x: 143, y: 461, size: 9, maxW: 425 },
  contractorAddr: { x: 155, y: 450.8, size: 9, maxW: 415 },
  contractorPhone: { x: 182, y: 440.4, size: 9, maxW: 385 },
  surety: { x: 392, y: 430, size: 9, maxW: 180 },
  bond: { x: 455, y: 419.7, size: 9, maxW: 115 },
  lender: { x: 228, y: 409.4, size: 9, maxW: 340 },
  designated: { x: 460, y: 385.6, size: 9, maxW: 110 },
  designee: { x: 268, y: 361.7, size: 9, maxW: 145 },
  designeeOf: { x: 440, y: 361.7, size: 9, maxW: 130 },
  designeePhone: { x: 105, y: 341.1, size: 9, maxW: 260 },
  expiration: { x: 99, y: 315.1, size: 9, maxW: 470 },
}

/** Fill the official blank and return the finished PDF's bytes. */
export async function fillNoc(values: NocValues): Promise<Uint8Array> {
  // Lazy import — same rule as SheetJS / the INRB notice.
  const { PDFDocument, StandardFonts } = await import('pdf-lib')

  const res = await fetch('/templates/NOC_BLANK.pdf')
  if (!res.ok) throw new Error(`Couldn't load the blank NOC form (${res.status})`)
  const doc = await PDFDocument.load(await res.arrayBuffer())
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.getPage(0)

  for (const key of Object.keys(FIELD_POS) as (keyof NocValues)[]) {
    const text = (values[key] ?? '').trim()
    if (!text) continue
    const pos = FIELD_POS[key]
    // Shrink to fit (legal descriptions get LONG) — floor of 6pt; past that
    // the text just runs long and the user shortens it in the form.
    let size = pos.size
    while (size > 6 && font.widthOfTextAtSize(text, size) > pos.maxW) size -= 0.5
    page.drawText(text, { x: pos.x, y: pos.y, size, font })
  }
  return doc.save()
}
