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
import type { Project, ProjectState } from '../types'

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

/**
 * Build the mailto: draft for one vendor + project. Includes the job site and
 * any of the project's "to order" items that match the vendor's categories.
 */
export function vendorMailto(v: Vendor, p: Project, ps: ProjectState): string {
  const site = `${p.address}, ${p.city}, FL ${p.zip}`.trim()
  const items = (ps.orders ?? [])
    .filter((o) => o.status === 'toOrder' && (!v.categories || v.categories.includes(o.category)))
    .map((o) => `  • ${o.category}`)
  const subject = `${v.name} — ${p.address}`
  const body = [
    `Hi ${v.name},`,
    ``,
    `Request for our job site:`,
    `Site: ${site}`,
    ...(p.parcel ? [`Parcel: ${p.parcel}`] : []),
    ``,
    `Item(s):`,
    ...(items.length ? items : ['  • ']),
    ``,
    `Thanks,`,
    `Adam Stiles`,
    `Iron Shield Construction`,
  ].join('\n')
  return `mailto:${v.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
