/**
 * statusReport.ts — turn any set of projects into a shareable status update.
 *
 * Two shapes, both editable in 🛠 Settings → Templates:
 *   • simple   — one line per house (address · model · status · next step)
 *   • detailed — a block per house with every stream's status
 *
 * The body templates are per-PROJECT blocks ({{address}}, {{electric}}, …).
 * buildStatusReport renders the chosen block once per project, stacks them, and
 * frames the whole thing with a subject + signature. The "next step" headline
 * comes from the SAME prioritization as the Today screen, so a status email
 * never disagrees with the command center. Pure logic — no React.
 */
import type { Project, ProjectState, TemplateOverride, WorkbenchState } from '../types'
import {
  isElectricDone,
  isPermitDone,
  isSepticDone,
  isWaterDone,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  septicSourceOf,
  septicSystemOf,
  utilityOf,
  waterSourceOf,
} from './nextAction'
import { isMaterialsDone, ordersSummary } from './orders'
import { permitExpiresOf } from './permitExpiry'
import { buildActionCenter } from './actionCenter'
import {
  DEFAULT_STATUS_DETAILED_BODY,
  DEFAULT_STATUS_SIMPLE_BODY,
  DEFAULT_STATUS_SUBJECT,
  effectiveTemplate,
  renderTemplate,
} from './templates'

const STATUS_WORD: Record<string, string> = { CO: 'C.O.', Hold: 'ON HOLD' }

/** done → "✓ Complete", otherwise the next action's label. */
function line(done: boolean, next: string): string {
  return done ? '✓ Complete' : next || '—'
}

/**
 * The single headline for a project — the same item Today would float to the
 * top for it (a fire, else the top move, else "on track").
 */
function headlineFor(
  p: Project,
  getPS: (id: number) => ProjectState,
  modelTakeoffs?: WorkbenchState['modelTakeoffs'],
): string {
  const ac = buildActionCenter([p], getPS, modelTakeoffs)
  const item = ac.attention[0] ?? ac.moves[0]
  if (!item) return '✓ On track — nothing open'
  return `${item.icon} ${item.text}${item.detail ? ` (${item.detail})` : ''}`
}

/** Every {{token}} a status block can use, for one project. */
export function projectStatusVars(
  p: Project,
  ps: ProjectState,
  getPS: (id: number) => ProjectState,
  modelTakeoffs?: WorkbenchState['modelTakeoffs'],
): Record<string, string> {
  const src = septicSourceOf(ps)
  const sys = septicSystemOf(ps)
  return {
    address: p.address,
    city: p.city,
    zip: p.zip,
    model: p.model || '—',
    subdivision: p.subdivision || '—',
    parcel: p.parcel,
    permit: p.permit || '—',
    status: STATUS_WORD[p.listStatus as string] ?? 'Active',
    utility: utilityOf(p, ps) || '—',
    water_source: waterSourceOf(p, ps) || '—',
    septic_type: src === 'Sewer' ? 'Sewer' : sys ? `Septic (${sys})` : 'Septic',
    electric: line(isElectricDone(ps), nextElectricAction(p, ps).label),
    water: line(isWaterDone(p, ps), nextWaterAction(p, ps).label),
    septic: line(isSepticDone(ps), nextSepticAction(ps).label),
    permit_status: line(isPermitDone(ps), nextPermitAction(ps).label),
    materials: isMaterialsDone(ps) ? '✓ All in' : ordersSummary(ps) || 'none yet',
    expires: permitExpiresOf(p, ps) || '',
    nextAction: headlineFor(p, getPS, modelTakeoffs),
  }
}

export interface StatusReportOptions {
  detailed: boolean
  overrides?: Record<string, TemplateOverride>
  modelTakeoffs?: WorkbenchState['modelTakeoffs']
  /** A short note prepended above the project blocks (e.g. "Hi Mickey, …"). */
  note?: string
  /** Describes the selection, used in the subject ({{scope}}). */
  scope?: string
}

export interface StatusReport {
  subject: string
  body: string
  /** Subject + body together — what the Copy button puts on the clipboard. */
  fullText: string
  mailto: string
  count: number
}

/** Assemble a status report for the chosen projects. */
export function buildStatusReport(
  projects: Project[],
  getPS: (id: number) => ProjectState,
  opts: StatusReportOptions,
): StatusReport {
  const templateId = opts.detailed ? 'status:detailed' : 'status:simple'
  const t = effectiveTemplate(opts.overrides, templateId, {
    subject: DEFAULT_STATUS_SUBJECT,
    body: opts.detailed ? DEFAULT_STATUS_DETAILED_BODY : DEFAULT_STATUS_SIMPLE_BODY,
  })

  const stamp = new Date().toLocaleDateString()
  const subject = renderTemplate(t.subject, {
    date: stamp,
    count: String(projects.length),
    scope: opts.scope ?? '',
  })

  const blocks = projects.map((p) =>
    renderTemplate(t.body, projectStatusVars(p, getPS(p.id), getPS, opts.modelTakeoffs)),
  )
  const sep = opts.detailed ? '\n\n' : '\n'

  const parts: string[] = []
  if (opts.note?.trim()) parts.push(opts.note.trim())
  parts.push(blocks.join(sep) || '(no projects selected)')
  // No sign-off — the mail client appends Adam's real signature.
  const body = parts.join('\n\n')

  const fullText = `${subject}\n${'='.repeat(Math.min(subject.length, 50))}\n\n${body}`
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return { subject, body, fullText, mailto, count: projects.length }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 🖨 Open a clean, print-ready page of the report and print it. */
export function openStatusPrint(report: StatusReport) {
  const today = new Date().toLocaleDateString()
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(report.subject)}</title>
<style>
  body { font: 13px/1.5 'Times New Roman', Times, Georgia, serif; color: #222; margin: 32px; }
  h1 { font-size: 17px; font-weight: 700; margin: 0 0 2px; color: #b3541e; }
  .sub { color: #666; font-size: 11.5px; margin: 0 0 18px; }
  pre { font: inherit; white-space: pre-wrap; margin: 0; }
  @page { margin: 14mm; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>⚡ Iron Shield Construction</h1>
<div class="sub">${esc(report.subject)} · ${esc(today)} · ${report.count} project${report.count === 1 ? '' : 's'}</div>
<pre>${esc(report.body)}</pre>
<script>window.onload = () => setTimeout(() => window.print(), 150)</script>
</body></html>`
  const win = window.open('', '_blank')
  if (!win) return alert('Pop-up blocked — allow pop-ups for this site to print.')
  win.document.write(html)
  win.document.close()
}
