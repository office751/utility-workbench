/**
 * exportList.ts — turn the project list into things you can SHARE:
 *   📊 a real Excel file (.xlsx) for the PM/GM
 *   🖨 a clean printable page (you pick which columns)
 *   📋 tab-separated text (pastes straight into Excel/Sheets or a message)
 *
 * One COLUMNS table drives all three, so they can never disagree. Pure logic —
 * no React in here.
 */
import type { Project, ProjectState } from '../types'
import {
  engineerOf,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  septicSourceOf,
  septicSystemOf,
  serviceTypeOf,
  utilityOf,
  waterSourceOf,
} from './nextAction'
import { permitExpiresOf } from './permitExpiry'
import { ordersSummary } from './orders'

/** One exportable column: an id, a header label, and how to compute the cell. */
export interface ColDef {
  id: string
  label: string
  get: (p: Project, ps: ProjectState) => string
  /** In the print chooser's default selection? (Excel always gets every column.) */
  printDefault?: boolean
}

const STATUS_LABEL: Record<string, string> = { CO: 'C.O.', Hold: 'ON HOLD' }

export const COLUMNS: ColDef[] = [
  { id: 'address', label: 'Address', get: (p) => p.address, printDefault: true },
  { id: 'city', label: 'City', get: (p) => p.city, printDefault: true },
  { id: 'zip', label: 'Zip', get: (p) => p.zip },
  { id: 'subdivision', label: 'Subdivision', get: (p) => p.subdivision, printDefault: true },
  { id: 'model', label: 'Model', get: (p) => p.model, printDefault: true },
  { id: 'parcel', label: 'Parcel', get: (p) => p.parcel },
  { id: 'permit', label: 'Permit #', get: (p) => p.permit, printDefault: true },
  { id: 'workOrder', label: 'WO#', get: (p) => p.workOrder },
  { id: 'status', label: 'Status', get: (p) => STATUS_LABEL[p.listStatus] ?? 'Active', printDefault: true },
  { id: 'utility', label: 'Utility', get: (p, ps) => utilityOf(p, ps), printDefault: true },
  { id: 'service', label: 'OH/UG', get: (p, ps) => serviceTypeOf(p, ps) },
  { id: 'engineer', label: 'Engineer', get: (p, ps) => engineerOf(p, ps) },
  { id: 'water', label: 'Water', get: (p, ps) => waterSourceOf(p, ps) },
  {
    id: 'septic',
    label: 'Septic/Sewer',
    get: (_p, ps) => {
      const src = septicSourceOf(ps)
      const sys = septicSystemOf(ps)
      return src === 'Sewer' ? 'Sewer' : sys ? `Septic (${sys})` : 'Septic'
    },
  },
  { id: 'electricNext', label: 'Electric — next', get: (p, ps) => nextElectricAction(p, ps).label, printDefault: true },
  { id: 'waterNext', label: 'Water — next', get: (p, ps) => nextWaterAction(p, ps).label },
  { id: 'septicNext', label: 'Septic — next', get: (_p, ps) => nextSepticAction(ps).label },
  { id: 'permitNext', label: 'Permit — next', get: (_p, ps) => nextPermitAction(ps).label },
  { id: 'permitExpires', label: 'Permit expires', get: (p, ps) => permitExpiresOf(p, ps) ?? '' },
  { id: 'materials', label: 'Materials', get: (_p, ps) => ordersSummary(ps) },
]

/** Remembered print-column choice (per device — it's a UI preference). */
const PRINT_COLS_KEY = 'isc_print_cols_v1'

export function loadPrintCols(): string[] {
  try {
    const raw = localStorage.getItem(PRINT_COLS_KEY)
    if (raw) {
      const ids = JSON.parse(raw) as string[]
      if (Array.isArray(ids) && ids.length) return ids.filter((id) => COLUMNS.some((c) => c.id === id))
    }
  } catch {
    /* fall through to defaults */
  }
  return COLUMNS.filter((c) => c.printDefault).map((c) => c.id)
}

export function savePrintCols(ids: string[]) {
  localStorage.setItem(PRINT_COLS_KEY, JSON.stringify(ids))
}

/** Compute the header row + one row per project for the given columns. */
function tableFor(
  projects: Project[],
  getPS: (id: number) => ProjectState,
  colIds: string[],
): { headers: string[]; rows: string[][] } {
  const cols = colIds.map((id) => COLUMNS.find((c) => c.id === id)!).filter(Boolean)
  return {
    headers: cols.map((c) => c.label),
    rows: projects.map((p) => {
      const ps = getPS(p.id)
      return cols.map((c) => c.get(p, ps))
    }),
  }
}

/** 📊 Download a real .xlsx. SheetJS is imported lazily so the main app bundle
 *  doesn't carry it — it only loads the first time someone exports. */
export async function downloadXlsx(projects: Project[], getPS: (id: number) => ProjectState) {
  const XLSX = await import('xlsx')
  const { headers, rows } = tableFor(projects, getPS, COLUMNS.map((c) => c.id))
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  // Reasonable column widths: header length vs longest cell, capped.
  ws['!cols'] = headers.map((h, i) => ({
    wch: Math.min(40, Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)) + 2),
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Projects')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Iron Shield Projects ${stamp}.xlsx`)
}

/** 📋 Tab-separated text — pastes cleanly into Excel/Sheets or a message. */
export async function copyAsText(projects: Project[], getPS: (id: number) => ProjectState, colIds: string[]) {
  const { headers, rows } = tableFor(projects, getPS, colIds)
  const text = [headers, ...rows].map((r) => r.join('\t')).join('\n')
  await navigator.clipboard.writeText(text)
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 🖨 Open a clean, print-ready page with just the chosen columns and print it. */
export function openPrintView(
  projects: Project[],
  getPS: (id: number) => ProjectState,
  colIds: string[],
  subtitle: string,
) {
  const { headers, rows } = tableFor(projects, getPS, colIds)
  const today = new Date().toLocaleDateString()
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Iron Shield — Project List</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.45 'Times New Roman', Times, Georgia, serif; color: #222; margin: 28px; }
  h1 { font-size: 17px; font-weight: 700; margin: 0; }
  .sub { color: #666; font-size: 11.5px; margin: 3px 0 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em;
       color: #555; border-bottom: 2px solid #b3541e; padding: 5px 7px; }
  td { padding: 5px 7px; border-bottom: 1px solid #e2ddd5; vertical-align: top; }
  tr:nth-child(even) td { background: #faf8f5; }
  .pill { font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 99px; color: #fff; }
  .pill.hold { background: #d9920a; } .pill.co { background: #2f6b2f; }
  @page { margin: 12mm; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>⚡ Iron Shield Construction — Project List</h1>
<div class="sub">${esc(subtitle)} · printed ${esc(today)}</div>
<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows
    .map(
      (r) =>
        `<tr>${r
          .map((cell) => {
            if (cell === 'ON HOLD') return '<td><span class="pill hold">ON HOLD</span></td>'
            if (cell === 'C.O.') return '<td><span class="pill co">C.O.</span></td>'
            return `<td>${esc(cell)}</td>`
          })
          .join('')}</tr>`,
    )
    .join('')}</tbody></table>
<script>window.onload = () => setTimeout(() => window.print(), 150)</script>
</body></html>`
  const win = window.open('', '_blank')
  if (!win) return alert('Pop-up blocked — allow pop-ups for this site to print.')
  win.document.write(html)
  win.document.close()
}
