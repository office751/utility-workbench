/**
 * selectionsReport.ts — turn a project's homeowner selections into a shareable
 * package: a plain-text summary you can Copy, Print, or Email to the finish
 * trades. Pure logic — no React. (Same family as lib/statusReport.ts.)
 *
 * The body is GENERATED (not a {{token}} template) because the line items are
 * dynamic — one per chosen category out of the ~39 in data/selections.ts — so
 * a fixed template can't iterate them. We read labels straight from the catalog
 * so the export always matches what the tab shows.
 */
import type { Project, ProjectState, SelectionChoice, SelectionSection } from '../types'
import { defaultSelections } from '../data/selections'

export interface SelectionsReport {
  subject: string
  body: string
  /** What the Copy button puts on the clipboard (same as body here). */
  fullText: string
  /** How many categories actually have a choice (0 = nothing picked yet). */
  count: number
}

/** Combine an option pick + a write-in into one readable value. */
function valueOf(c: SelectionChoice): string {
  const parts: string[] = []
  if (c.option) parts.push(c.option)
  if (c.writeIn) parts.push(c.writeIn)
  return parts.join(' — ')
}

/** Friendly local date from an ISO string, blank-safe. */
function dateOf(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

/** Build the selections package for one project. `sections` is the EFFECTIVE
 *  catalog for this project's model (resolveSelectionSections) so the export
 *  matches exactly what the tab shows. */
export function buildSelectionsReport(
  p: Project,
  ps: ProjectState,
  sections: SelectionSection[],
): SelectionsReport {
  const sel = ps.selections ?? defaultSelections()
  const lines: string[] = []
  lines.push(`Homeowner Selections — ${p.address}`)
  lines.push(
    `${p.city}, FL ${p.zip} · ${p.model || '—'} · parcel ${p.parcel}` +
      (p.permit ? ` · permit ${p.permit}` : ''),
  )

  let count = 0
  for (const section of sections) {
    const rows: string[] = []
    for (const cat of section.categories) {
      const v = valueOf(sel[section.id][cat.id] ?? {})
      if (v) {
        rows.push(`  ${cat.label}: ${v}`)
        count++
      }
    }
    if (rows.length) {
      lines.push('')
      lines.push(section.label.toUpperCase())
      lines.push(...rows)
    }
  }

  if (sel.additionalRequests?.trim()) {
    lines.push('')
    lines.push('ADDITIONAL REQUESTS')
    lines.push(`  ${sel.additionalRequests.trim()}`)
  }

  lines.push('')
  if (sel.lock?.locked) {
    const who = sel.lock.signature || '—'
    const printed = sel.lock.printedName ? ` (${sel.lock.printedName})` : ''
    const when = dateOf(sel.lock.lockedAt) ? ` on ${dateOf(sel.lock.lockedAt)}` : ''
    lines.push(`Signed & locked by ${who}${printed}${when}.`)
  } else {
    lines.push('NOTE: These selections are NOT locked yet — subject to change until the client signs off.')
  }

  const subject = `Selections — ${p.address}, ${p.city}`
  const body = lines.join('\n')
  return { subject, body, fullText: body, count }
}

/**
 * A mailto: draft for the selections package. `to` is the recipient list
 * (finish-trade vendor emails), `cc` is optional (e.g. the office). Encodes
 * each field exactly like the vendor/status drafts so subjects/bodies don't
 * garble. Blank emails are dropped.
 */
export function selectionsMailto(report: SelectionsReport, to: string[], cc: string[] = []): string {
  const toList = to.filter(Boolean).join(',')
  const ccList = cc.filter(Boolean).join(',')
  const ccPart = ccList ? `cc=${encodeURIComponent(ccList)}&` : ''
  return `mailto:${toList}?${ccPart}subject=${encodeURIComponent(report.subject)}&body=${encodeURIComponent(report.body)}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** 🖨 Open a clean, print-ready page of the selections and print it. Mirrors
 *  openStatusPrint — call it SYNCHRONOUSLY from the click handler (no await
 *  before window.open) or the pop-up gets blocked. */
export function openSelectionsPrint(report: SelectionsReport, p: Project) {
  const today = new Date().toLocaleDateString()
  // The print window is about:blank, so root-relative URLs won't resolve —
  // use an absolute URL to the public/ logo asset (served at the app origin).
  const logoUrl = `${window.location.origin}/iron-shield-logo.png`
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(report.subject)}</title>
<style>
  body { font: 13px/1.5 'Times New Roman', Times, Georgia, serif; color: #222; margin: 32px; }
  .hdr { display: flex; align-items: center; gap: 14px; margin: 0 0 18px; }
  .logo { height: 54px; width: auto; }
  h1 { font-size: 17px; font-weight: 700; margin: 0 0 2px; color: #b3541e; }
  .sub { color: #666; font-size: 11.5px; margin: 0; }
  pre { font: inherit; white-space: pre-wrap; margin: 0; }
  @page { margin: 14mm; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="hdr">
  <img class="logo" src="${esc(logoUrl)}" alt="" onerror="this.style.display='none'">
  <div>
    <h1>Iron Shield Construction — Client Selections</h1>
    <div class="sub">${esc(p.address)}, ${esc(p.city)}, FL ${esc(p.zip)} · ${esc(today)}</div>
  </div>
</div>
<pre>${esc(report.body)}</pre>
<script>window.onload = () => setTimeout(() => window.print(), 150)</script>
</body></html>`
  const win = window.open('', '_blank')
  if (!win) return alert('Pop-up blocked — allow pop-ups for this site to print.')
  win.document.write(html)
  win.document.close()
}
