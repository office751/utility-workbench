/**
 * dukeForm.ts — build Duke's "Residential Service Information Form" (the load
 * form you reply to Duke's Work-Order email with), pre-filled from everything
 * the app already knows about a house.
 *
 * Why we DRAW this from scratch instead of filling a blank (the way secoForm.ts
 * fills the bundled SECO AcroForm): Duke doesn't publish a fillable PDF. Duke
 * emails a plain Word form and, until now, the app could only copy the data for
 * you to retype into it. So here we generate the finished form directly — same
 * layout and values as the ones Adam has been sending by hand — and hand back
 * PDF bytes the caller downloads.
 *
 * pdf-lib is heavy, so (like secoForm.ts / xlsx) it's lazy-imported inside the
 * function — this module only lands in the bundle when someone downloads a form.
 *
 * Pure logic: no React. Values come from data/models.ts (per-model sqft/tons),
 * data/contacts.ts (company + Duke office), and the project's service type.
 */
import type { Project, ProjectState } from '../types'
import { COMPANY, UTILITY_PHONES } from '../data/contacts'
import { specFor } from '../data/models'
import { serviceTypeOf } from './nextAction'
import { dukeOfficeEmail } from './loadForm'

/** One row of Duke's equipment table. Empty cells stay visually blank. */
interface EquipRow {
  label: string
  qty: string
  tonGal: string // "Ton/GAL" column
  kwAmps: string // "kW/Amps" column
  gas: string // "Largest Gas Appliance (YES or NO)"
}

/**
 * Build the equipment-table rows for one house. The A/C tonnage and total sqft
 * are the only project-specific numbers; the rest are Iron Shield's standard
 * spec (matches buildDukePacket() in loadForm.ts and every past Duke form).
 */
function equipRows(p: Project): EquipRow[] {
  const spec = specFor(p.model)
  const tons = spec.tons ? String(spec.tons) : '' // Adam confirms if blank
  return [
    { label: 'A/C Unit(s)', qty: '1', tonGal: tons, kwAmps: '', gas: 'NO' },
    { label: 'Heat Strips', qty: '1', tonGal: '', kwAmps: '8KW/50 AMPS', gas: 'NO' },
    { label: 'Electric Pool Heater', qty: 'N/A', tonGal: '', kwAmps: '', gas: 'NO' },
    { label: 'Water Heater', qty: '1', tonGal: '50 GAL', kwAmps: '', gas: 'NO' },
    { label: 'Tankless Water Heater', qty: 'N/A', tonGal: '', kwAmps: '', gas: 'NO' },
    { label: 'Misc. Equipment', qty: 'N/A', tonGal: '', kwAmps: '', gas: 'NO' },
    { label: 'Motor', qty: 'N/A', tonGal: '', kwAmps: '', gas: 'NO' },
    { label: 'EV Charger', qty: 'N/A', tonGal: '', kwAmps: '', gas: 'NO' },
  ]
}

/**
 * Generate the filled Duke Residential Service Information Form and return the
 * PDF bytes. One US-Letter page, drawn to mirror the form Duke sends.
 */
export async function fillDukeLoadForm(p: Project, ps: ProjectState): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  // US Letter, 1-inch margins. y counts UP from the bottom in pdf-lib, so we
  // track a running `y` and subtract as we move down the page.
  const page = doc.addPage([612, 792])
  const margin = 54
  const right = 612 - margin
  const ink = rgb(0, 0, 0)
  let y = 792 - margin

  // Small helpers so the layout below reads like the form, not like geometry.
  const text = (s: string, x: number, size = 10, f = font) =>
    page.drawText(s, { x, y, size, font: f, color: ink })
  const line = (x1: number, x2: number, yy: number, thickness = 0.75) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color: ink })
  const down = (n: number) => (y -= n)

  const spec = specFor(p.model)
  const service = serviceTypeOf(p, ps) || 'OH' // default OH, same as the packet
  const isUG = service === 'UG'
  const returnEmail = dukeOfficeEmail(ps)
  const officePhone = UTILITY_PHONES.DUKE ?? ''

  // ── Title ──────────────────────────────────────────────────────────────
  const title = 'RESIDENTIAL SERVICE INFORMATION FORM'
  page.drawText(title, {
    x: (612 - bold.widthOfTextAtSize(title, 14)) / 2,
    y,
    size: 14,
    font: bold,
    color: ink,
  })
  down(22)
  {
    const s = 'Before Duke Energy can proceed with your project design, application for'
    const s2 = 'new construction service is required.'
    text(s, margin, 9)
    down(12)
    text(s2, margin, 9)
  }
  down(24)

  // ── Address / contact block ────────────────────────────────────────────
  const fieldLabel = (label: string, value: string) => {
    text(label, margin, 10, bold)
    const lx = margin + bold.widthOfTextAtSize(label + '  ', 10)
    text(value, lx, 10)
    line(lx, right, y - 2, 0.5) // underline under the value, form-style
    down(20)
  }
  fieldLabel('Service Address:', `${p.address}, ${p.city}, FL ${p.zip}`)
  text('(Please include the full address with City, State, and Zip Code)', margin, 8)
  down(20)
  fieldLabel('Account Billing Name:', COMPANY.legalName)
  fieldLabel('Site Contact Name:', COMPANY.siteContact)
  fieldLabel('Site Contact Number:', COMPANY.phone)
  fieldLabel('Email (responsible party for construction charges):', COMPANY.email)
  down(6)
  text('The following information is required before Duke can proceed with your design:', margin, 9, bold)
  down(20)

  // ── Equipment table ────────────────────────────────────────────────────
  // Column x-positions and the header labels. The first column is wide (equip
  // names); the rest are even.
  const cols = [margin, margin + 150, margin + 245, margin + 330, margin + 440]
  const headers = ['', 'Quantity', 'Ton/GAL', 'kW/Amps', 'Gas Appl. (Y/N)']
  const rowH = 20
  const tableTop = y

  // Header row.
  headers.forEach((h, i) => page.drawText(h, { x: cols[i] + 3, y: y - 14, size: 9, font: bold, color: ink }))
  down(rowH)

  const rows = equipRows(p)
  rows.forEach((r) => {
    const cells = [r.label, r.qty, r.tonGal, r.kwAmps, r.gas]
    cells.forEach((c, i) =>
      page.drawText(c, { x: cols[i] + 3, y: y - 14, size: 9, font: i === 0 ? bold : font, color: ink }),
    )
    down(rowH)
  })
  const tableBottom = y

  // Grid lines: verticals between columns + right edge, horizontals per row.
  ;[...cols.slice(1), right].forEach((x) =>
    page.drawLine({ start: { x, y: tableTop }, end: { x, y: tableBottom }, thickness: 0.5, color: ink }),
  )
  page.drawLine({ start: { x: margin, y: tableTop }, end: { x: margin, y: tableBottom }, thickness: 0.5, color: ink })
  for (let gy = tableTop; gy >= tableBottom - 0.1; gy -= rowH) line(margin, right, gy, 0.5)

  down(24)

  // ── Totals + service entrance ──────────────────────────────────────────
  fieldLabel('Total Sq. Ft. of Home:', spec.sqft ? String(spec.sqft) : '')
  fieldLabel('Size of Main:', '200 AMPS')

  // Permanent Service Entrance: OH / UG with an X in the box that matches this
  // house's service type (serviceTypeOf). The other stays empty.
  text('Permanent Service Entrance:', margin, 10, bold)
  let sx = margin + bold.widthOfTextAtSize('Permanent Service Entrance:  ', 10)
  text('OH', sx, 10)
  text(isUG ? '____' : '_X__', sx + 20, 10)
  sx += 70
  text('UG', sx, 10)
  text(isUG ? '_X__' : '____', sx + 20, 10)
  down(20)

  fieldLabel('Electrician:', COMPANY.electrician)
  down(2)
  text('REMARKS:', margin, 10, bold)
  line(margin + 55, right, y - 2, 0.5)
  down(24)

  // ── Footer instructions ────────────────────────────────────────────────
  text('IMPORTANT!! PLEASE PROVIDE A COPY OF THE SITE PLAN.', margin, 9, bold)
  down(13)
  text('PLEASE NOTIFY DUKE ENERGY IMMEDIATELY IF ANY CHANGES ARE MADE.', margin, 9, bold)
  down(16)
  text(`Once completed, please return this form via email to ${returnEmail}.`, margin, 9)
  down(13)
  if (officePhone) text(`For any questions, please call ${officePhone}.`, margin, 9)

  return doc.save()
}
