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

/** Default wording for a vendor order email (same for every vendor until edited). */
export const DEFAULT_VENDOR_SUBJECT = '{{vendor}} — {{address}}'
export const DEFAULT_VENDOR_BODY = [
  'Hi {{vendor}},',
  '',
  'Request for our job site:',
  'Site: {{site}}',
  'Parcel: {{parcel}}',
  '',
  'Item(s):',
  '{{items}}',
  '',
  'Thanks,',
  'Adam Stiles',
  'Iron Shield Construction',
].join('\n')

/** Default wording for the SECO / Duke electric application emails.
 *  {{packet}} injects the fully-filled notification/service form. */
export const DEFAULT_APPLY_SECO_SUBJECT = 'New Construction Electric Service — {{address}}'
export const DEFAULT_APPLY_SECO_BODY = [
  'Good morning,',
  '',
  'We would like to apply for new construction electric service at {{address}} ({{parcel}}).',
  'The completed notification details are below; the signed form and site plan are attached.',
  '',
  '{{packet}}',
  '',
  'Thank you,',
  'Adam Stiles',
  'Iron Shield Construction LLC',
  '352-809-3235',
].join('\n')

export const DEFAULT_APPLY_DUKE_SUBJECT = 'New Service - {{address}}'
export const DEFAULT_APPLY_DUKE_BODY = [
  'Good morning,',
  '',
  'We would like to apply for new construction electric service at {{address}} ({{parcel}}).',
  'The service information is below; site plan attached.',
  '',
  '{{packet}}',
  '',
  'Thank you,',
  'Adam Stiles',
  'Iron Shield Construction LLC',
  '352-809-3235',
].join('\n')

/** Default wording for the permit-package handoff email to Jennifer's
 *  Permitting Service ("📨 Email Jennifer" on the Permit tab). Built from her
 *  own checklist (her email, May 13 2026): location, job cost, subs, AC/energy
 *  docs, septic, and cash-vs-lender for the Notice of Commencement.
 *
 *  Two things the app can't know — JOB COST and FINANCING — appear as loud
 *  [FILL IN — …] markers so they can't sneak out unfinished. Everything else
 *  ({{subs}}, {{docs}}, {{septic_type}}, site facts) fills itself in. */
export const DEFAULT_PERMIT_HANDOFF_SUBJECT = 'Iron Shield: {{address}} — New Permit Package (Parcel {{parcel}})'
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
  '• Septic: {{septic_type}} — please apply for the septic permit if required',
  '• Financing: [FILL IN — cash, or bank + lender name] (so you know who handles the Notice of Commencement)',
  '',
  'Project documents attached:',
  '{{docs}}',
  '',
  'Let me know if you need anything else to get this submitted.',
  '',
  'Thank you,',
  'Adam Stiles',
  'Iron Shield Construction LLC',
  '352-809-3235',
].join('\n')

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
