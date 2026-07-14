/**
 * draws.ts — the pure logic behind the 💵 Draws tab (construction-loan draw
 * tracking). No React, no fetch — everything here is unit-tested.
 *
 * The model: a project's `financials.draws` is that CONTRACT's own copy of a
 * draw schedule (copied from a data/drawTemplates.ts template when tracking
 * starts, then tuned per contract). Each draw has a checklist of what must be
 * true before requesting; "Request draw" drafts the lender email in Adam's
 * real wording (see the 'draw:request' template) and stamps requestedOn.
 *
 * Rules (see docs/BRAINS.md "Draws"):
 *  - A draw's status is derived, never stored: funded > requested > ready
 *    (every checklist item done) > upcoming. An EMPTY checklist stays
 *    'upcoming' — no items means we can't tell it's ready ("can't tell"
 *    beats guessing), but nothing HARD-blocks requesting (fail open: the
 *    button always works; the status is advice, not a gate).
 *  - The draft never ships an empty blank: a missing amount/recipient becomes
 *    a loud [FILL IN — …] marker (same convention as the permit handoff).
 */
import type { Project, ProjectDraw, ProjectFinancials, TemplateOverride } from '../types'
import type { DrawTemplate } from '../data/drawTemplates'
import { OFFICE_CC } from '../data/contacts'
import {
  DEFAULT_DRAW_REQUEST_BODY,
  DEFAULT_DRAW_REQUEST_SUBJECT,
  effectiveTemplate,
  renderTemplate,
} from './templates'

/** Where a draw stands. Derived from its fields — never stored. */
export type DrawStatus = 'upcoming' | 'ready' | 'requested' | 'funded'

export function drawStatus(d: ProjectDraw): DrawStatus {
  if (d.fundedOn) return 'funded'
  if (d.requestedOn) return 'requested'
  if (d.items.length > 0 && d.items.every((i) => i.done)) return 'ready'
  return 'upcoming'
}

/** Status chip copy + tone, one place (the UI renders exactly this). */
export const DRAW_STATUS_LABEL: Record<DrawStatus, string> = {
  upcoming: 'Upcoming',
  ready: 'Ready to request',
  requested: 'Requested',
  funded: 'Funded',
}

/** ids must be unique per PROJECT copy (template stage ids repeat across
 *  projects) — crypto.randomUUID with a Math.random fallback for old WebViews. */
const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`

/** Copy a template's stages onto a project as fresh, independently-editable
 *  draws (fresh ids so nothing aliases the template or another project). */
export function instantiateDraws(t: DrawTemplate): ProjectDraw[] {
  return t.stages.map((s) => ({
    id: newId('draw'),
    label: s.label,
    amount: s.amount,
    items: s.items.map((text) => ({ id: newId('di'), text })),
  }))
}

/** A blank draw for the "＋ Add draw" button (custom stages mid-contract). */
export function blankDraw(): ProjectDraw {
  return { id: newId('draw'), label: '', items: [] }
}

/** The draw the house is working toward: first one not yet requested/funded.
 *  Null once everything is at least requested (nothing left to chase). */
export function nextDraw(fin: ProjectFinancials): ProjectDraw | null {
  return fin.draws.find((d) => !d.requestedOn && !d.fundedOn) ?? null
}

/** One-line schedule summary for the header card: "3 of 7 funded · next: 4th Draw". */
export function drawsSummary(fin: ProjectFinancials): string {
  const funded = fin.draws.filter((d) => drawStatus(d) === 'funded').length
  const nxt = nextDraw(fin)
  const head = `${funded} of ${fin.draws.length} funded`
  return nxt ? `${head} · next: ${nxt.label || '(unnamed draw)'}` : head
}

/** Everything the "📨 Request draw" button needs. */
export interface DrawRequestDraft {
  to: string
  subject: string
  body: string
  mailto: string
}

/**
 * Draft the official draw-request email for one draw. Wording comes from the
 * editable 'draw:request' template; the recipient is the project's lender
 * email. mailto only — marking the draw requested is a separate updater call,
 * and any proof (inspection approvals, the C.O.) still has to be attached by
 * hand, because a mailto can't carry files.
 */
export function drawRequestDraft(
  p: Project,
  fin: ProjectFinancials,
  draw: ProjectDraw,
  overrides?: Record<string, TemplateOverride>,
): DrawRequestDraft {
  const t = effectiveTemplate(overrides, 'draw:request', {
    subject: DEFAULT_DRAW_REQUEST_SUBJECT,
    body: DEFAULT_DRAW_REQUEST_BODY,
  })
  const done = draw.items.filter((i) => i.done)
  const vars: Record<string, string> = {
    label: draw.label || '[draw name]',
    // Loud markers over silent blanks — an empty amount line reads as done.
    amount: draw.amount || '[FILL IN — amount]',
    address: p.address,
    city: p.city,
    site: `${p.address}, ${p.city}, FL ${p.zip}`,
    parcel: p.parcel,
    // Renders as its own line only when the loan has a number (FACO style).
    loan_line: fin.loanNumber ? `Loan #${fin.loanNumber}\n` : '',
    evidence: done.length ? done.map((i) => `• ${i.text}`).join('\n') : '• [what was completed]',
  }
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)
  const to = fin.lenderEmail || ''
  return {
    to,
    subject,
    body,
    mailto: `mailto:${to}?cc=${encodeURIComponent(OFFICE_CC)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  }
}
