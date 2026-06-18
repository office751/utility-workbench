/**
 * templates.ts — the tiny engine behind editable workflow templates.
 *
 * A template is plain text with {{placeholders}}. renderTemplate() swaps each
 * {{token}} for its live value (unknown tokens become '' so a typo can't leak
 * "{{adress}}" into a real email). Your custom wording is stored in
 * WorkbenchState.templates (cloud-synced) and merged over the defaults here.
 *
 * Defaults for the vendor order email live in THIS file (not data/templates.ts)
 * so vendors.ts can use them without an import cycle.
 */
import type { TemplateOverride } from '../types'

/** Replace every {{token}} with its value ('' when missing). */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '')
}

/** Default wording for a vendor order email (same for every vendor until
 *  edited). {{contact}} greets the PERSON when the vendor has one configured
 *  ("Hi Tina,"), the company name otherwise. */
export const DEFAULT_VENDOR_SUBJECT = '{{vendor}} — {{address}}'
export const DEFAULT_VENDOR_BODY = [
  'Hi {{contact}},',
  '',
  'We would like to place the following order for our job site:',
  'Site: {{site}}',
  'Parcel: {{parcel}}',
  'Model: {{model}}',
  '',
  'Item(s):',
  '{{items}}',
  '',
  'Please confirm pricing and the earliest delivery date.',
].join('\n')
// ^ No sign-off — the mail client appends Adam's real signature.

/* ---- Electric application emails ----
 * The two utilities work DIFFERENTLY, and these templates now match what Adam
 * actually sends (verified against his real mail, June 2026):
 *
 *  • SECO is email-FIRST — one email to newconstruction@secoenergy.com with the
 *    completed load form + site plan ATTACHED (PDFs). The body is short: the
 *    form IS the attachment, not pasted text. The filled packet is still on tap
 *    via "Copy form" to transcribe onto the SECO load-form PDF.
 *
 *  • Duke is portal-FIRST — you apply on the Builder Portal, then Duke emails
 *    you a Work Order # and the blank load form. This template is that REPLY:
 *    you send the completed form + site plan back, keeping "WO#…" in the subject
 *    (Duke warns that removing it delays the response). So it leads with the WO#
 *    and reads as a reply, NOT a fresh "we'd like to apply".
 */
export const DEFAULT_APPLY_SECO_SUBJECT = 'New Construction Application – {{site}}'
export const DEFAULT_APPLY_SECO_BODY = [
  'Hello,',
  '',
  "We'd like to apply for new construction electric service at {{site}} (parcel {{parcel}}). The completed load form and site plan are attached.",
].join('\n')
// ^ No sign-off — the mail client appends Adam's real signature.

export const DEFAULT_APPLY_DUKE_SUBJECT = 'WO#{{workOrder}} — {{site}}'
export const DEFAULT_APPLY_DUKE_BODY = [
  'Hi,',
  '',
  'Attached is the completed load form for {{address}}, along with the site plan{{septic_clause}}.',
  '',
  'Please let me know if you need anything else to proceed.',
].join('\n')
// ^ No sign-off — the mail client appends Adam's real signature.
// ^ {{septic_clause}} = " showing the septic location" for septic lots (Duke
//   asks for the septic on the site plan); blank for sewer lots.

/**
 * "Ready for meter — notify utility" email. Drafted by the 📸 button on a
 * project's Electric tab once the home green-tags. SECO explicitly asks for
 * these photos before a meter set (and notes the county doesn't always tell
 * them), so we send them directly. The recipient is chosen by the builder
 * (SECO Engineering vs the Duke EDA office), not the body — so the wording
 * stays utility-neutral and works for both. */
export const DEFAULT_METERNOTIFY_SUBJECT = 'Ready for meter set — {{site}}'
export const DEFAULT_METERNOTIFY_BODY = [
  'Hello,',
  '',
  'The home at {{site}} has passed its electrical inspection and is ready for the meter set.',
  '',
  'Attached photos:',
  '- Passed inspection / green tag',
  '- Downpipe (weatherhead)',
  '- Sweep',
  '- Straps',
  '- Clear path to the meter can',
  '',
  "Please note the county doesn't always notify you when a home is ready, so we're letting you know directly. Let me know if you need anything else to schedule the meter set.",
].join('\n')
// ^ No sign-off — the mail client appends Adam's real signature.

/** Default wording for the permit-package handoff email to Jennifer's
 *  Permitting Service ("📨 Email Jennifer" on the Permit tab). Built from her
 *  own checklist (her email, May 13 2026): location, job cost, subs, AC/energy
 *  docs, septic, and cash-vs-lender for the Notice of Commencement.
 *
 *  Two things the app can't know — JOB COST and FINANCING — appear as loud
 *  [FILL IN — …] markers so they can't sneak out unfinished. Everything else
 *  ({{subs}}, {{docs}}, {{septic_line}}, site facts) fills itself in.
 *  Jennifer prepares and records the Notice of Commencement, so the financing
 *  line exists to hand her the lender details the NOC form needs.
 *
 *  NOTE: {{docs}} fills with its OWN header + content and changes shape with
 *  reality: a [PASTE HERE] marker when clickable links are on the clipboard,
 *  a plain name list when links couldn't be minted, a loud warning when no
 *  files are uploaded. Don't add a second header above it. */
export const DEFAULT_PERMIT_HANDOFF_SUBJECT = '{{address}} — New Permit Package (Parcel {{parcel}})'
export const DEFAULT_PERMIT_HANDOFF_BODY = [
  'Hi Jennifer,',
  '',
  'We have a new project ready for permitting. Per your checklist:',
  '',
  '• Location: {{site}} (Parcel {{parcel}}) — model {{model}}, new single-family residence',
  '• Job cost: [FILL IN — contract $ amount]',
  '• Subcontractors:',
  '{{subs}}',
  '• Energy calcs: attached — this is a master-filed model',
  '• Authorization form: attached (signed)',
  '• Septic: {{septic_line}}',
  '• Financing: [FILL IN — cash, or lender name & address] — please prepare and record the Notice of Commencement',
  '',
  '{{docs}}',
  '',
  'Let me know if you need anything else to get this submitted.',
].join('\n')
// ^ Wording matched to Adam's first real send (June 10 2026): no company
//   prefix in the subject, the authorization-form bullet (it got forgotten
//   once — never again), and the soil-test instruction rides inside
//   {{septic_line}} for septic projects.
// ^ No sign-off here on purpose: the mail client appends the real signature.
//   Adding one in the template means deleting a duplicate from every draft.

/** Default wording for the status report. The SUBJECT is the whole report's
 *  subject ({{date}}/{{count}}/{{scope}}); the BODY is a PER-PROJECT block
 *  ({{address}}, {{electric}}, …) that's rendered once for each house. Edit
 *  these to change exactly what a status update includes. */
export const DEFAULT_STATUS_SUBJECT = 'Iron Shield Construction — Status Update ({{date}})'

export const DEFAULT_STATUS_SIMPLE_BODY = [
  '• {{address}} ({{model}}) — {{status}}',
  '    Next: {{nextAction}}',
].join('\n')

export const DEFAULT_STATUS_DETAILED_BODY = [
  '📍 {{address}} — {{model}}  ·  {{status}}',
  '   Permit: {{permit}}     Utility: {{utility}}',
  '   ⚡ Electric:  {{electric}}',
  '   💧 Water:     {{water}}',
  '   🚽 Septic:    {{septic}}',
  '   📋 Permit:    {{permit_status}}',
  '   🛒 Materials: {{materials}}',
  '   ➡  Next:      {{nextAction}}',
].join('\n')

/** A template's effective subject+body: your override where set, default otherwise. */
export function effectiveTemplate(
  overrides: Record<string, TemplateOverride> | undefined,
  id: string,
  defaults: { subject: string; body: string },
): { subject: string; body: string } {
  const o = overrides?.[id]
  return { subject: o?.subject ?? defaults.subject, body: o?.body ?? defaults.body }
}
