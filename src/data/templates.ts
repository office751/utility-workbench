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
import {
  DEFAULT_APPLY_DUKE_BODY,
  DEFAULT_APPLY_DUKE_SUBJECT,
  DEFAULT_APPLY_SECO_BODY,
  DEFAULT_APPLY_SECO_SUBJECT,
  DEFAULT_PERMIT_HANDOFF_BODY,
  DEFAULT_PERMIT_HANDOFF_SUBJECT,
  DEFAULT_STATUS_DETAILED_BODY,
  DEFAULT_STATUS_SIMPLE_BODY,
  DEFAULT_STATUS_SUBJECT,
  DEFAULT_VENDOR_BODY,
  DEFAULT_VENDOR_SUBJECT,
} from '../lib/templates'

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

const APPLY_VARS: TemplateVar[] = [
  { token: '{{address}}', desc: 'street address' },
  { token: '{{site}}', desc: 'full site line — address, city, FL zip' },
  { token: '{{parcel}}', desc: 'parcel number' },
  { token: '{{permit}}', desc: 'permit number' },
  { token: '{{model}}', desc: 'house model' },
  { token: '{{packet}}', desc: 'the fully-filled application form (auto-generated)' },
]

// The SUBJECT line understands these (whole-report); the BODY is one block per
// house and understands the project tokens below it.
const STATUS_SUBJECT_VARS: TemplateVar[] = [
  { token: '{{date}}', desc: "today's date" },
  { token: '{{count}}', desc: 'number of projects in the report' },
  { token: '{{scope}}', desc: 'what was selected (e.g. "all active")' },
]
const STATUS_BODY_VARS: TemplateVar[] = [
  { token: '{{address}}', desc: 'street address' },
  { token: '{{city}}', desc: 'city' },
  { token: '{{model}}', desc: 'house model' },
  { token: '{{subdivision}}', desc: 'subdivision' },
  { token: '{{permit}}', desc: 'permit number (or —)' },
  { token: '{{status}}', desc: 'Active / ON HOLD / C.O.' },
  { token: '{{utility}}', desc: 'electric utility (SECO/Duke/Clay)' },
  { token: '{{water_source}}', desc: 'water source' },
  { token: '{{septic_type}}', desc: 'septic or sewer' },
  { token: '{{electric}}', desc: 'electric status / next step' },
  { token: '{{water}}', desc: 'water status / next step' },
  { token: '{{septic}}', desc: 'septic status / next step' },
  { token: '{{permit_status}}', desc: 'permit status / next step' },
  { token: '{{materials}}', desc: 'materials summary' },
  { token: '{{expires}}', desc: 'permit expiry date (if any)' },
  { token: '{{nextAction}}', desc: "the project's #1 priority (same as Today)" },
]

// What the permit-handoff email to Jennifer can auto-fill. Job cost and
// financing are deliberately NOT tokens — the app doesn't know them, so the
// default body carries [FILL IN — …] markers instead.
const PERMIT_HANDOFF_VARS: TemplateVar[] = [
  { token: '{{address}}', desc: 'street address' },
  { token: '{{site}}', desc: 'full site line — address, city, FL zip' },
  { token: '{{parcel}}', desc: 'parcel number' },
  { token: '{{model}}', desc: 'house model' },
  { token: '{{subs}}', desc: 'the standard subcontractor lineup (data/contacts.ts)' },
  { token: '{{docs}}', desc: 'the whole documents section — its own header + each uploaded file with its ~1-year download link (names only if links fail)' },
  { token: '{{septic_type}}', desc: 'Sewer / Septic / Septic (ATU…)' },
]

/** Every editable template, grouped. (Future: more workflows register here.) */
export function templateSpecs(): TemplateSpec[] {
  return [
    {
      id: 'permit:handoff',
      group: 'Permitting',
      icon: '📨',
      name: 'Permit package — Jennifer',
      description:
        'Drafted by "📨 Email Jennifer" on a project\'s Permit tab — the new-permit handoff to Jennifer\'s Permitting Service. Project files ride along as download links (no heavy attachments); just fill the [FILL IN] blanks (job cost, financing) before sending.',
      vars: PERMIT_HANDOFF_VARS,
      subject: DEFAULT_PERMIT_HANDOFF_SUBJECT,
      body: DEFAULT_PERMIT_HANDOFF_BODY,
    },
    {
      id: 'status:simple',
      group: 'Status reports',
      icon: '📋',
      name: 'Status report — simple overview',
      description:
        'One line per house in 📋 Status report (Simple). The SUBJECT frames the whole report; the BODY is repeated once per project.',
      vars: [...STATUS_SUBJECT_VARS, ...STATUS_BODY_VARS],
      subject: DEFAULT_STATUS_SUBJECT,
      body: DEFAULT_STATUS_SIMPLE_BODY,
    },
    {
      id: 'status:detailed',
      group: 'Status reports',
      icon: '📋',
      name: 'Status report — detailed',
      description:
        'A full block per house in 📋 Status report (Detailed) — every stream. Edit the BODY to change exactly what each update includes.',
      vars: [...STATUS_SUBJECT_VARS, ...STATUS_BODY_VARS],
      subject: DEFAULT_STATUS_SUBJECT,
      body: DEFAULT_STATUS_DETAILED_BODY,
    },
    {
      id: 'apply:SECO',
      group: 'Electric application emails',
      icon: '⚡',
      name: 'SECO application',
      description: 'Drafted by ⚡ Batch Apply (and the Electric tab) for SECO houses — sent to newconstruction@secoenergy.com.',
      vars: APPLY_VARS,
      subject: DEFAULT_APPLY_SECO_SUBJECT,
      body: DEFAULT_APPLY_SECO_BODY,
    },
    {
      id: 'apply:DUKE',
      group: 'Electric application emails',
      icon: '⚡',
      name: 'Duke application',
      description: 'Drafted by ⚡ Batch Apply (and the Electric tab) for Duke houses — sent to EDA-Ocala@duke-energy.com.',
      vars: APPLY_VARS,
      subject: DEFAULT_APPLY_DUKE_SUBJECT,
      body: DEFAULT_APPLY_DUKE_BODY,
    },
    ...VENDORS.map((v) => ({
      id: `vendor:${v.id}`,
      group: 'Vendor order emails',
      icon: v.icon,
      name: v.name,
      description: `Drafted by the "${v.icon} ${v.name}" button on a project's Materials tab (${v.supplies}).`,
      vars: VENDOR_VARS,
      subject: DEFAULT_VENDOR_SUBJECT,
      body: DEFAULT_VENDOR_BODY,
    })),
  ]
}
