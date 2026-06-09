/**
 * templates.ts (data) — the REGISTRY of every editable workflow template,
 * shown in ⚙️ Settings → Templates.
 *
 * Pure config (same spirit as vendors.ts / lifecycles.ts). Each entry says:
 * what the template is for, which {{tokens}} it understands, and its default
 * wording. Adding a future workflow (load form, utility follow-up, …) = add
 * entries here and the settings page picks them up automatically.
 */
import { VENDORS } from './vendors'
import { DEFAULT_VENDOR_BODY, DEFAULT_VENDOR_SUBJECT } from '../lib/templates'

export interface TemplateVar {
  token: string // e.g. '{{address}}'
  desc: string
}

export interface TemplateSpec {
  id: string // stable key, e.g. 'vendor:marion-masonry'
  group: string // section heading on the settings page
  icon: string
  name: string
  description: string
  vars: TemplateVar[]
  /** Default wording (used until you customize it). */
  subject: string
  body: string
}

const VENDOR_VARS: TemplateVar[] = [
  { token: '{{vendor}}', desc: 'the company name' },
  { token: '{{address}}', desc: 'street address' },
  { token: '{{site}}', desc: 'full site line — address, city, FL zip' },
  { token: '{{parcel}}', desc: 'parcel number' },
  { token: '{{permit}}', desc: 'permit number' },
  { token: '{{model}}', desc: 'house model' },
  { token: '{{items}}', desc: "bulleted list of this vendor's to-order items" },
]

/** Every editable template, grouped. (Future: load-form + other workflows.) */
export function templateSpecs(): TemplateSpec[] {
  return VENDORS.map((v) => ({
    id: `vendor:${v.id}`,
    group: 'Vendor order emails',
    icon: v.icon,
    name: v.name,
    description: `Drafted by the "${v.icon} ${v.name}" button on a project's Materials tab (${v.supplies}).`,
    vars: VENDOR_VARS,
    subject: DEFAULT_VENDOR_SUBJECT,
    body: DEFAULT_VENDOR_BODY,
  }))
}
