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

/**
 * Water/sewer DISCONNECT (closeout) email. Drafted by "✉️ Draft MCU disconnect"
 * on a project's 💧 Water tab once the home has sold. Marion County Utilities
 * wants a completed disconnection request form + proof of sale (a notarized
 * warranty deed) ATTACHED — the body says so, and the button reminds you to
 * attach them, because a mailto can't. Routes to Utilities@MarionFL.org (the
 * county's closeout inbox), CC office. */
export const DEFAULT_DISCONNECT_WATER_SUBJECT = 'Disconnect Water/Sewer Service – {{site}}'
export const DEFAULT_DISCONNECT_WATER_BODY = [
  'Hello,',
  '',
  'This home has sold and closed. Please schedule disconnection of the Marion County Utilities water/sewer account currently held by Iron Shield Construction LLC for the property below.',
  '',
  'Service address: {{site}}',
  'Parcel ID: {{parcel}}',
  'Effective / closing date: {{closing}}',
  '',
  'Attached: the completed disconnection request form and the notarized warranty deed (proof of sale).',
  '',
  'Please confirm the final bill amount and the scheduled disconnection date.',
].join('\n')
// ^ No sign-off — the mail client appends Adam's real signature.

// (The permit-package handoff template to Jennifer's Permitting Service was
//  removed Aug 2026 — permitting is 100% in-house now. Any saved override
//  under 'permit:handoff' in the blob is simply never read again.)

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

/**
 * Construction-loan DRAW REQUEST email — drafted by "📨 Request draw" on a
 * project's 💵 Draws tab. Wording matched to Adam's real sends ("5th Draw
 * Request - 4 Fisher Lane Trak, Ocklawaha", Jan 2025–Jul 2026): subject =
 * "<Nth> Draw Request - <address>, <city>", body = the "official draw request"
 * line with the amount, plus what's completed (lenders bounce requests that
 * arrive without the supporting info — the evidence list is the fix). */
export const DEFAULT_DRAW_REQUEST_SUBJECT = '{{label}} Request - {{address}}, {{city}}'
export const DEFAULT_DRAW_REQUEST_BODY = [
  'Good morning,',
  '',
  'Here is my official draw request for:',
  '',
  '{{amount}} as the {{label}} on {{site}}.',
  '{{loan_line}}',
  'Completed for this draw:',
  '{{evidence}}',
  '',
  'Supporting documents are attached. Please let me know if you need anything else to process it, thank you!',
].join('\n')
// ^ No sign-off — the mail client appends Adam's real signature.
// ^ {{loan_line}} renders "Loan #126863" + newline only when the project has
//   a loan number (FACO-style), so other lenders never see an empty line.

/** A template's effective subject+body: your override where set, default otherwise. */
export function effectiveTemplate(
  overrides: Record<string, TemplateOverride> | undefined,
  id: string,
  defaults: { subject: string; body: string },
): { subject: string; body: string } {
  const o = overrides?.[id]
  return { subject: o?.subject ?? defaults.subject, body: o?.body ?? defaults.body }
}
