/**
 * permitHandoff.ts — drafts the "new permit package" email to Jennifer's
 * Permitting Service, our permitting agent for every NEW permit (projects we
 * already started permitting ourselves stay on the old process).
 *
 * Same recipe as vendors.ts / loadForm.ts: gather the live values, pour them
 * into the editable template (⚙️ Settings → Templates → "Permit package —
 * Jennifer"), return a ready-to-send mailto draft. Pure logic — no React.
 *
 * One honest limitation: a mailto: link is text-only, so the draft LISTS the
 * project's uploaded files (nothing gets forgotten) but can't physically
 * attach them — drag them in from the 📂 Files box before hitting send.
 */
import type { Project, ProjectState, TemplateOverride } from '../types'
import { JENNIFER, PERMIT_SUBS } from '../data/contacts'
import { septicSourceOf, septicSystemOf } from './nextAction'
import {
  DEFAULT_PERMIT_HANDOFF_BODY,
  DEFAULT_PERMIT_HANDOFF_SUBJECT,
  effectiveTemplate,
  renderTemplate,
} from './templates'

/** The live values the handoff template's {{tokens}} can use. */
export function permitHandoffVars(p: Project, ps: ProjectState): Record<string, string> {
  // The standard sub lineup, one bullet per trade (edit data/contacts.ts to change it).
  const subs = PERMIT_SUBS.map((s) => `    - ${s.trade}: ${s.company} — ${s.contact}`).join('\n')

  // Every file uploaded to this project — the email lists them so the
  // attachment step has a checklist. Loud placeholder when there are none.
  const docs = (ps.docs ?? []).map((d) => `    - ${d.name}`).join('\n')
    || '    - [NO FILES UPLOADED YET — add them in the 📂 Files box]'

  // Same wording the status report uses: 'Sewer', 'Septic', or 'Septic (ATU)'.
  const src = septicSourceOf(ps)
  const sys = septicSystemOf(ps)

  return {
    address: p.address,
    city: p.city,
    zip: p.zip,
    site: `${p.address}, ${p.city}, FL ${p.zip}`.trim(),
    parcel: p.parcel,
    permit: p.permit,
    model: p.model || '[model]',
    subs,
    docs,
    septic_type: src === 'Sewer' ? 'Sewer' : sys ? `Septic (${sys})` : 'Septic',
  }
}

/** Build the mailto: draft to Jennifer for one project. */
export function permitHandoffMailto(
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
): string {
  const t = effectiveTemplate(overrides, 'permit:handoff', {
    subject: DEFAULT_PERMIT_HANDOFF_SUBJECT,
    body: DEFAULT_PERMIT_HANDOFF_BODY,
  })
  const vars = permitHandoffVars(p, ps)
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)
  return `mailto:${JENNIFER.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
