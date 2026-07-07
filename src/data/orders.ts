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
  'Windows', // installed at dry-in; a common long-lead item (see LEAD_TIME_DAYS)
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

/**
 * LEAD TIMES — how many days ahead each material must be ORDERED so it lands
 * on site by its needed-by date. This powers the "order by <date>" pill on an
 * order row and the "Order NOW" alerts on 🏠 Today (see lib/leadTimes.ts).
 *
 * TUNE THESE: they're sensible starting guesses, not gospel. When a vendor's
 * real turnaround differs (Tibbetts quotes 3 weeks on trusses, FGT quotes 4+
 * on cabinets…), just change the number here — everything downstream follows.
 * Keys must match ORDER_CATEGORIES above.
 */
export const LEAD_TIME_DAYS: Record<string, number> = {
  Trusses: 21, // engineered + built to order — the classic schedule-killer
  Cabinets: 28, // longest lead in the house; FGT builds per order
  Windows: 35, // made-to-size for new construction — often 5–6 weeks; tune to your supplier
  'Garage door': 21, // sized/ordered per opening
  Flooring: 14,
  'Lighting package': 14,
  'Bathroom tile': 14,
  Block: 7,
  Lintels: 7, // sand ships bundled in this package (no separate Sand category)
  'Framing package': 7,
  'Slab package': 7,
  // site services are quick calls, not manufacturing:
  Dumpster: 3,
  'Porta-potty': 3,
}

/** Fallback for a category we don't have a tuned number for (custom/free-form
 *  categories, or the SITE_SERVICES action names below). One work-week is a
 *  safe middle ground — better a slightly-early nudge than a late truss. */
export const DEFAULT_LEAD_TIME_DAYS = 7

/**
 * MODEL STANDARD ORDER LIST — the categories every spec house needs, used by
 * the Materials tab's one-click "Seed the standard list" button when a project
 * has no orders yet. (Spec homes repeat: A/B/E2/F… all order the same kinds of
 * things; only the takeoff CONTENTS differ, and those live in
 * ⚙️ Settings → Takeoffs as model order lists.)
 */
export const STANDARD_ORDER_CATEGORIES: string[] = [
  'Trusses',
  'Framing package',
  'Block',
  'Lintels',
  'Windows',
  'Slab package',
  'Cabinets',
  'Flooring',
  'Lighting package',
  'Bathroom tile',
  'Garage door',
]

/**
 * Per-model customizations of the standard list, keyed by modelKey ('A', 'E2',
 * 'Republic'…). Empty today — every model uses STANDARD_ORDER_CATEGORIES.
 * When a model genuinely differs (say Fire-House adds a second garage door
 * category), add its full list here and only that model changes.
 */
export const MODEL_STANDARD_ORDERS: Record<string, string[]> = {}

/** The standard order list for one model: its custom list when defined,
 *  the common list otherwise. `modelK` is a normalized modelKey (models.ts). */
export function standardOrdersFor(modelK: string): string[] {
  return MODEL_STANDARD_ORDERS[modelK] ?? STANDARD_ORDER_CATEGORIES
}

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
  window: 'Windows',
  dumpster: 'Dumpster',
  porta: 'Porta-potty',
  'ports potty': 'Porta-potty',
}
