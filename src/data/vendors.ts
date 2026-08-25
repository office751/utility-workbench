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
import { CATEGORY_PORTIONS, portionsOf, SITE_SERVICES } from './orders'

export interface Vendor {
  id: string
  name: string
  /** Leave '' until you have it — the button still drafts, just with no
   *  recipient filled in (you type it once, then ADD IT HERE). */
  email: string
  /** Extra recipients CC'd on every order (e.g. Tibbetts: email Tina, CC Mark). */
  cc?: string
  /** Best general phone for one-tap calling (tel:). Leave '' if unknown — the
   *  📞 button hides until you fill it in. */
  phone?: string
  /** First name for the greeting ("Hi Tina,") — falls back to the company name. */
  contact?: string
  /** Public catalog / showroom URL. When a Selections category points at this
   *  vendor (category.vendorId), this becomes the client's default "Browse
   *  options" link — unless the category sets its own url, which wins. */
  website?: string
  icon: string
  supplies: string // shown in the button's tooltip
  /** Order categories (see data/orders.ts) this vendor covers. Used to list the
   *  project's matching "to order" items in the draft AND to pick the right
   *  vendor for an order row's one-click ✉️ Order button. */
  categories?: string[]
  /** COMPANY-FIRST ordering: the menu of things you order FROM this company
   *  (e.g. Florida Express → deliver / swap / remove a dumpster or porta-potty).
   *  On the Materials composer you pick the company, then one of these items.
   *  A catalog item is auto-"covered" by this vendor (see vendorCovers), so its
   *  order still gets this company's one-click ✉️ email. Empty for plain
   *  material suppliers. Owner-editable in Settings → Vendor setup. */
  catalog?: string[]
  /** True for FINISH trades (cabinets, flooring, tile, countertops, paint,
   *  lighting…). The homeowner Selections tab emails the locked selections
   *  package to these vendors. Mark each finish vendor as you add it here, and
   *  it shows up automatically as a Selections email recipient. */
  finish?: boolean
  /** Optional vendor-specific default wording (overrides the generic vendor
   *  template). Lets e.g. Florida Express say "schedule" instead of "deliver"
   *  so removals/swaps read right. Still user-editable on the Templates page. */
  subjectDefault?: string
  bodyDefault?: string
}

export const VENDORS: Vendor[] = [
  {
    id: 'tibbetts',
    name: 'Tibbetts Lumber',
    email: 'tina.soucia@tibbettslumber.com',
    cc: 'Mark.Turenne@tibbettslumber.com', // Adam's rule: email Tina, CC Mark
    phone: '352-347-7661', // Tibbetts Ocala store (6100 SE 68th St)
    contact: 'Tina',
    icon: '🪵',
    supplies: 'Truss & framing packages',
    // Both portions of the combined "Trusses & Framing" category
    // (data/orders.ts CATEGORY_PORTIONS) — one row, ONE Tibbetts email
    // ordering the whole package. Kept as the legacy portion names so old
    // split rows and saved model order lists still resolve.
    categories: ['Trusses', 'Framing package'],
    // Adam's real order wording (Aug 2026 sent mail): the whole package plus
    // the roofing underlayment in one ask, model code as the spec (Tibbetts
    // holds the per-model takeoffs, same as DZ does for block). The "7 rolls"
    // is today's standing number — edit it here / in ⚙ Settings → Templates
    // (or per-draft in Mail) if a model ever needs a different count.
    subjectDefault: 'Trusses & Framing Packages — {{address}}, {{city}}',
    bodyDefault: [
      'Hi,',
      '',
      'We would like to order the truss & framing package along with 7 rolls of roofing underlayment for our job site:',
      '',
      '{{site}}',
      '{{model}}',
      '',
      'Please confirm the earliest delivery date.',
    ].join('\n'),
  },
  {
    id: 'marion-masonry',
    name: 'Marion Masonry',
    email: 'dispatch@marionmasonry.com', // from Adam's sent lintel/slab orders
    phone: '352-629-9788', // Marion Masonry of Ocala dispatch
    icon: '🧱',
    supplies: 'Slab package · lintels · sand',
    // 'Lintels' (sand rides along) is Marion's PORTION of the combined
    // "Block & Lintels" category — see the DZ Block note below.
    categories: ['Slab package', 'Lintels'],
  },
  {
    // Block comes from DZ Block, NOT Marion Masonry (Adam's correction,
    // June 11 2026). Mason Caruthers is the takeoffs contact there.
    // 'Block' is DZ's PORTION of the combined "Block & Lintels" category
    // (data/orders.ts CATEGORY_PORTIONS): the one order row drafts DZ the
    // block email and Marion Masonry the lintel email.
    id: 'dz-block',
    name: 'DZ Block',
    email: 'dispatch@dzblock.com',
    phone: '352-915-5132', // DZ Block dispatch (Reggie Scott)
    icon: '🧊',
    supplies: 'Block',
    categories: ['Block'],
  },
  {
    id: 'fgt',
    name: 'FGT Cabinetry',
    email: 'orlando@fgtcabinetry.com', // from Adam's sent cabinet orders
    phone: '321-800-2036', // FGT Cabinetry Orlando (Destine Davis, Project Coordinator)
    icon: '🗄️',
    supplies: 'Cabinets',
    categories: ['Cabinets'],
    finish: true, // cabinets are a finish trade → gets the Selections package
  },
  {
    // One vendor covers both site services — Adam orders "a dumpster & porta
    // potty" from Florida Express in a single email.
    id: 'florida-express',
    name: 'Florida Express',
    email: 'csr@floridaexpress.us', // from Adam's sent service requests
    phone: '352-369-5411', // Florida Express Waste & Recycling (460 NW 52nd Ave, Ocala)
    icon: '🗑️',
    supplies: 'Dumpster & porta-potty — deliver / swap / remove',
    // Bare Dumpster/Porta-potty come from text-scans. The deliver/swap/remove
    // actions are this company's order MENU (catalog): you pick Florida Express
    // first, then the action. vendorCovers checks categories AND catalog, so a
    // catalog order still gets Florida Express's one-click email.
    categories: ['Dumpster', 'Porta-potty'],
    catalog: [...SITE_SERVICES],
    // Action-neutral wording: the action lives in each {{items}} line
    // ("Deliver dumpster" / "Remove porta-potty"), so this reads right for
    // deliveries, swaps, AND removals — unlike the generic "place an order".
    subjectDefault: 'Florida Express — {{address}}',
    bodyDefault: [
      'Hi {{contact}},',
      '',
      'Please schedule the following at our job site:',
      'Site: {{site}}',
      'Parcel: {{parcel}}',
      '',
      '{{items}}',
      '',
      'Please confirm the date. Thank you.',
    ].join('\n'),
  },
]

/** Does this vendor DIRECTLY list a category — in `categories` (materials it
 *  supplies) or `catalog` (company order menu)? Internal building block for
 *  the portion-aware rules below. */
function coversDirect(v: Vendor, category: string): boolean {
  return (v.categories?.includes(category) ?? false) || (v.catalog?.includes(category) ?? false)
}

/** Does this vendor cover an order category? True when it directly lists the
 *  category, OR when the category is a combined one (Block & Lintels) and the
 *  vendor supplies any of its portions — vendor rows keep their plain portion
 *  names ('Block', 'Lintels'), so nothing stored had to change. One shared
 *  rule so the order emails, the row's ✉️ buttons, and the composer all agree
 *  on which company an item belongs to. */
export function vendorCovers(v: Vendor, category: string): boolean {
  return coversDirect(v, category) || portionsOf(category).some((c) => coversDirect(v, c))
}

/** What THIS vendor's email should call an order category: for a combined
 *  category, the portion(s) the vendor actually sells ("Block" for DZ Block,
 *  "Lintels" for Marion Masonry); the category itself otherwise. Keeps each
 *  supplier's email scoped to what they supply — DZ never sees "Lintels".
 *  A vendor covering EVERY portion (Tibbetts = all of Trusses & Framing)
 *  gets the combined name itself — it's ordering the whole thing. */
export function vendorPortionLabel(v: Vendor, category: string): string {
  const portions = CATEGORY_PORTIONS[category]
  const mine = portions?.filter((c) => coversDirect(v, c)) ?? []
  if (portions && mine.length === portions.length) return category
  return mine.length > 0 ? mine.join(' & ') : category
}

/** Does this vendor supply EVERY portion of a combined category? (Tibbetts →
 *  Trusses & Framing.) Such an order is the vendor's whole package, so its
 *  draft uses the vendor's own subject template instead of the generic
 *  "<material> order — <address>" line. False for plain categories. */
export function vendorCoversAll(v: Vendor, category: string): boolean {
  const portions = CATEGORY_PORTIONS[category]
  return !!portions && portions.every((c) => coversDirect(v, c))
}

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
  // A vendor with NO declared coverage (no categories, no catalog) is a generic
  // recipient → include every to-order item. Otherwise include only what it
  // covers — materials it supplies OR items on its order menu.
  const hasCoverage = (v.categories?.length ?? 0) > 0 || (v.catalog?.length ?? 0) > 0
  const items = (ps.orders ?? [])
    .filter((o) => o.status === 'toOrder' && (!hasCoverage || vendorCovers(v, o.category)))
    .filter((o) => !onlyCategory || o.category === onlyCategory)
    .flatMap((o) => {
      // Name each line the way THIS vendor knows it: a combined category
      // renders as the vendor's own portion(s) (DZ Block sees "Block", Marion
      // Masonry sees "Lintels", Tibbetts sees BOTH "Trusses" and "Framing
      // package" as separate lines). Model order lists are keyed by portion
      // too, with the raw category as a fallback for custom/edge cases.
      const mine = portionsOf(o.category).filter((c) => coversDirect(v, c))
      const parts = mine.length > 0 ? mine : [o.category]
      return parts.map((part) => {
        const list = modelLists?.[part] ?? modelLists?.[o.category]
        if (!list) return `  • ${part}`
        const detail = list
          .split('\n')
          .map((l) => `      ${l}`)
          .join('\n')
        return `  • ${part}:\n${detail}`
      })
    })
  const onlyLabel = onlyCategory ? vendorPortionLabel(v, onlyCategory) : ''
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
    category: onlyLabel,
    items: items.length ? items.join('\n') : `  • ${onlyLabel}`,
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
    subject: v.subjectDefault ?? DEFAULT_VENDOR_SUBJECT,
    body: v.bodyDefault ?? DEFAULT_VENDOR_BODY,
  })
  const vars = vendorTemplateVars(v, p, ps, modelLists)
  return vendorDraftUrl(v, renderTemplate(t.subject, vars), renderTemplate(t.body, vars))
}

/** One ready-to-send order draft: the button's href plus who it goes to.
 *  `portion` is what this email orders — the vendor's slice of a combined
 *  category ("Block" / "Lintels"), or the plain category — and labels the
 *  button when one order row needs more than one email. */
export interface OrderDraft {
  href: string
  vendor: Vendor
  portion: string
}

/**
 * The one-click ✉️ Order drafts for a SINGLE order row: each draft picks the
 * vendor that covers (a portion of) the order's category, addresses it
 * (TO + CC), writes a material-specific subject, and scopes the body to just
 * that item (with the model's saved order list when there is one). The only
 * thing left is Send.
 *
 * A plain category returns ONE draft, same as ever. A combined category
 * (Block & Lintels — data/orders.ts CATEGORY_PORTIONS) returns one draft PER
 * SUPPLIER: DZ Block gets the block email, Marion Masonry the lintel email.
 * A vendor supplying several portions gets a single email listing them all.
 *
 * Returns [] when no vendor covers the category — the row then has no
 * button (add the category to a vendor in VENDORS above to light it up).
 */
export function orderMailtos(
  vendors: Vendor[],
  category: string,
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
  modelLists?: Record<string, string>,
): OrderDraft[] {
  // One supplier per portion, de-duplicated (first covering vendor wins per
  // portion — same "first match" rule the single-vendor button always used).
  const suppliers: Vendor[] = []
  for (const portion of portionsOf(category)) {
    const v = vendors.find((x) => vendorCovers(x, portion))
    if (v && !suppliers.includes(v)) suppliers.push(v)
  }
  return suppliers.map((v) => {
    const t = effectiveTemplate(overrides, `vendor:${v.id}`, {
      subject: v.subjectDefault ?? DEFAULT_VENDOR_SUBJECT,
      body: v.bodyDefault ?? DEFAULT_VENDOR_BODY,
    })
    const vars = vendorTemplateVars(v, p, ps, modelLists, category)
    const portion = vendorPortionLabel(v, category)
    // Material-specific subject (the template's subject serves the all-items
    // vendor button; a single order reads better with the material up front) —
    // scoped to this vendor's portion so DZ's subject says "Block order".
    // EXCEPT when one vendor supplies the whole combined category (Tibbetts =
    // all of Trusses & Framing): that order IS the vendor's package, so its
    // own subject template wins ("Trusses & Framing Packages — <address>…",
    // matching Adam's real sent mail).
    const subject = vendorCoversAll(v, category)
      ? renderTemplate(t.subject, vars)
      : `${portion} order — ${p.address}, ${p.city}`
    return { href: vendorDraftUrl(v, subject, renderTemplate(t.body, vars)), vendor: v, portion }
  })
}

/** A tel: link for one-tap calling (strip to digits), or null when no phone is
 *  on file (the 📞 button then hides). Mirrors ContactLinks' tel() helper. */
export function vendorCallHref(v: Vendor): string | null {
  return v.phone ? 'tel:+1' + v.phone.replace(/\D/g, '') : null
}

/** A BLANK email to a vendor (TO + any CC) — for the global Vendors directory,
 *  where there's no project to pre-fill. The pre-filled, per-project ORDER
 *  emails come from vendorMailto / orderMailto above. */
export function vendorPlainMailto(v: Vendor): string | null {
  if (!v.email) return null
  return `mailto:${v.email}${v.cc ? `?cc=${encodeURIComponent(v.cc)}` : ''}`
}

/** The finish-trade vendors (cabinets, flooring, tile, paint, lighting…) — the
 *  recipients for a project's homeowner Selections package. Includes vendors
 *  without an email yet so the Selections tab can show them as "add an
 *  address"; filter on `.email` before actually addressing a draft. */
export function finishVendors(vendors: Vendor[]): Vendor[] {
  return vendors.filter((v) => v.finish)
}
