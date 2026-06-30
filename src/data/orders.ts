/**
 * orders.ts — config for the Materials/Orders tab.
 *
 * Pure data, like lifecycles.ts: the categories you order, the order
 * statuses, and the keyword→category map the Quick-Add bar uses to turn a
 * text like "slab's ready at Almond Pass" into a Slab order. Add a new
 * material = add a line here.
 */
import type { OrderStatus } from '../types'

/** The things you order. Edit freely — the dropdown reads this list. */
export const ORDER_CATEGORIES: string[] = [
  'Trusses',
  'Framing package',
  'Slab package',
  'Block',
  'Lintels', // sand ships bundled IN the lintels package — no separate Sand order
  'Flooring',
  'Cabinets',
  'Lighting package',
  'Bathroom tile',
  'Garage door',
  // site services Josh/Mickey report on:
  'Dumpster',
  'Porta-potty',
]

/** Just the materials — the manual "add an order" picker lists these in one
 *  group and the site-service actions below in another. (ORDER_CATEGORIES
 *  keeps the bare Dumpster/Porta-potty for the text-scan quick-add + model
 *  order lists.) */
export const MATERIAL_CATEGORIES: string[] = ORDER_CATEGORIES.filter(
  (c) => c !== 'Dumpster' && c !== 'Porta-potty',
)

/** Florida Express site-service actions — what you can actually request:
 *  deliver, swap, or remove a dumpster and/or porta-potty. The action IS the
 *  order's category, so the order email reads correctly for each one. */
export const SITE_SERVICES: string[] = [
  'Deliver dumpster',
  'Deliver porta-potty',
  'Deliver dumpster + porta-potty',
  'Swap out dumpster',
  'Remove dumpster',
  'Remove porta-potty',
  'Remove dumpster + porta-potty',
]

/** The order lifecycle (in order). */
export const ORDER_STATUSES: { key: OrderStatus; label: string }[] = [
  { key: 'toOrder', label: 'To order' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'installed', label: 'Installed' },
]

/**
 * Keyword → category for the Quick-Add parser. Keys are lowercase substrings
 * we look for in the captured text (so "trusses" matches "truss"). Several
 * keywords can point at the same category.
 */
export const CATEGORY_KEYWORDS: Record<string, string> = {
  truss: 'Trusses',
  framing: 'Framing package',
  frame: 'Framing package',
  slab: 'Slab package',
  slap: 'Slab package', // common typo
  block: 'Block',
  lintel: 'Lintels',
  lentil: 'Lintels', // common spelling
  sand: 'Lintels', // sand ships WITH the lintels package, so map it there (no standalone Sand category)
  floor: 'Flooring',
  cabinet: 'Cabinets',
  light: 'Lighting package',
  tile: 'Bathroom tile',
  'garage door': 'Garage door',
  dumpster: 'Dumpster',
  porta: 'Porta-potty',
  'ports potty': 'Porta-potty',
}
