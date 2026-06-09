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

/** A template's effective subject+body: your override where set, default otherwise. */
export function effectiveTemplate(
  overrides: Record<string, TemplateOverride> | undefined,
  id: string,
  defaults: { subject: string; body: string },
): { subject: string; body: string } {
  const o = overrides?.[id]
  return { subject: o?.subject ?? defaults.subject, body: o?.body ?? defaults.body }
}
