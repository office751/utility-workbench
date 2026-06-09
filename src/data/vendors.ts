/**
 * vendors.ts — the companies you order materials & site services from.
 *
 * Pure config (like orders.ts / lifecycles.ts). Each vendor gets a "Draft
 * email" button on a project's Materials view; clicking opens a pre-filled
 * email TO the vendor ABOUT that job site. Add a vendor = add a line here;
 * fill in `email` and the button becomes one-tap.
 *
 * Templates are intentionally BASIC for now — we'll tailor the wording per
 * vendor later. The body already drops in the job site + any of the project's
 * matching "to order" items, so it's useful out of the gate.
 */
import type { Project, ProjectState, TemplateOverride } from '../types'
import { DEFAULT_VENDOR_BODY, DEFAULT_VENDOR_SUBJECT, effectiveTemplate, renderTemplate } from '../lib/templates'

export interface Vendor {
  id: string
  name: string
  /** Leave '' until you have it — the button still drafts, just with no
   *  recipient filled in (you type it once). */
  email: string
  icon: string
  supplies: string // shown in the button's tooltip
  /** Order categories (see data/orders.ts) this vendor covers. Used to list the
   *  project's matching "to order" items in the draft. */
  categories?: string[]
}

export const VENDORS: Vendor[] = [
  {
    id: 'marion-masonry',
    name: 'Marion Masonry',
    email: '',
    icon: '🧱',
    supplies: 'Slab package · block · lintels · sand',
    categories: ['Slab package', 'Block', 'Lintels', 'Sand'],
  },
  {
    id: 'fgt',
    name: 'FGT',
    email: '',
    icon: '🗄️',
    supplies: 'Cabinets',
    categories: ['Cabinets'],
  },
  {
    id: 'dumpster',
    name: 'Dumpster service',
    email: '',
    icon: '🗑️',
    supplies: 'Dumpster delivery / swap-out',
    categories: ['Dumpster'],
  },
  {
    id: 'porta-potty',
    name: 'Porta-potty service',
    email: '',
    icon: '🚽',
    supplies: 'Porta-potty delivery / service',
    categories: ['Porta-potty'],
  },
]

/** The live values a vendor-email template's {{tokens}} can use. */
export function vendorTemplateVars(v: Vendor, p: Project, ps: ProjectState): Record<string, string> {
  const items = (ps.orders ?? [])
    .filter((o) => o.status === 'toOrder' && (!v.categories || v.categories.includes(o.category)))
    .map((o) => `  • ${o.category}`)
  return {
    vendor: v.name,
    address: p.address,
    city: p.city,
    zip: p.zip,
    site: `${p.address}, ${p.city}, FL ${p.zip}`.trim(),
    parcel: p.parcel,
    permit: p.permit,
    model: p.model,
    items: items.length ? items.join('\n') : '  • ',
  }
}

/**
 * Build the mailto: draft for one vendor + project. Wording comes from the
 * editable template (⚙️ Settings → Templates); your overrides win, defaults
 * otherwise. Includes the job site + the project's matching "to order" items.
 */
export function vendorMailto(
  v: Vendor,
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
): string {
  const t = effectiveTemplate(overrides, `vendor:${v.id}`, {
    subject: DEFAULT_VENDOR_SUBJECT,
    body: DEFAULT_VENDOR_BODY,
  })
  const vars = vendorTemplateVars(v, p, ps)
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)
  return `mailto:${v.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
