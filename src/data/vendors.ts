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
   *  recipient filled in (you type it once, then ADD IT HERE). */
  email: string
  /** Extra recipients CC'd on every order (e.g. Tibbetts: email Tina, CC Mark). */
  cc?: string
  /** First name for the greeting ("Hi Tina,") — falls back to the company name. */
  contact?: string
  icon: string
  supplies: string // shown in the button's tooltip
  /** Order categories (see data/orders.ts) this vendor covers. Used to list the
   *  project's matching "to order" items in the draft AND to pick the right
   *  vendor for an order row's one-click ✉️ Order button. */
  categories?: string[]
}

export const VENDORS: Vendor[] = [
  {
    id: 'tibbetts',
    name: 'Tibbetts Lumber',
    email: 'tina.soucia@tibbettslumber.com',
    cc: 'Mark.Turenne@tibbettslumber.com', // Adam's rule: email Tina, CC Mark
    contact: 'Tina',
    icon: '🪵',
    supplies: 'Truss & framing packages',
    categories: ['Trusses', 'Framing package'],
  },
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

/** The live values a vendor-email template's {{tokens}} can use. When the
 *  model has a saved order list for a category (⚙️ Settings → Takeoffs), the
 *  list's contents ride along under that item. Pass `onlyCategory` to scope
 *  the draft to ONE order (the order row's ✉️ button). */
export function vendorTemplateVars(
  v: Vendor,
  p: Project,
  ps: ProjectState,
  modelLists?: Record<string, string>,
  onlyCategory?: string,
): Record<string, string> {
  const items = (ps.orders ?? [])
    .filter((o) => o.status === 'toOrder' && (!v.categories || v.categories.includes(o.category)))
    .filter((o) => !onlyCategory || o.category === onlyCategory)
    .map((o) => {
      const list = modelLists?.[o.category]
      if (!list) return `  • ${o.category}`
      const detail = list
        .split('\n')
        .map((l) => `      ${l}`)
        .join('\n')
      return `  • ${o.category}:\n${detail}`
    })
  return {
    vendor: v.name,
    contact: v.contact || v.name,
    address: p.address,
    city: p.city,
    zip: p.zip,
    site: `${p.address}, ${p.city}, FL ${p.zip}`.trim(),
    parcel: p.parcel,
    permit: p.permit,
    model: p.model,
    category: onlyCategory ?? '',
    items: items.length ? items.join('\n') : `  • ${onlyCategory ?? ''}`,
  }
}

/** mailto with TO + optional CC, shared by both draft flavors below. */
function vendorDraftUrl(v: Vendor, subject: string, body: string): string {
  const cc = v.cc ? `cc=${encodeURIComponent(v.cc)}&` : ''
  return `mailto:${v.email}?${cc}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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
  modelLists?: Record<string, string>,
): string {
  const t = effectiveTemplate(overrides, `vendor:${v.id}`, {
    subject: DEFAULT_VENDOR_SUBJECT,
    body: DEFAULT_VENDOR_BODY,
  })
  const vars = vendorTemplateVars(v, p, ps, modelLists)
  return vendorDraftUrl(v, renderTemplate(t.subject, vars), renderTemplate(t.body, vars))
}

/**
 * The one-click ✉️ Order draft for a SINGLE order row: picks the vendor that
 * covers the order's category, addresses it (TO + CC), writes a
 * material-specific subject, and scopes the body to just that item (with the
 * model's saved order list when there is one). The only thing left is Send.
 *
 * Returns null when no vendor covers the category — the row then has no
 * button (add the category to a vendor in VENDORS above to light it up).
 */
export function orderMailto(
  category: string,
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
  modelLists?: Record<string, string>,
): { href: string; vendor: Vendor } | null {
  const v = VENDORS.find((x) => x.categories?.includes(category))
  if (!v) return null
  const t = effectiveTemplate(overrides, `vendor:${v.id}`, {
    subject: DEFAULT_VENDOR_SUBJECT,
    body: DEFAULT_VENDOR_BODY,
  })
  const vars = vendorTemplateVars(v, p, ps, modelLists, category)
  // Material-specific subject (the template's subject serves the all-items
  // vendor button; a single order reads better with the category up front).
  const subject = `${category} order — ${p.address}, ${p.city}`
  return { href: vendorDraftUrl(v, subject, renderTemplate(t.body, vars)), vendor: v }
}
