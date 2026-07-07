/**
 * MaterialsBody.tsx — the per-project orders list (the Materials tab detail).
 *
 * Shows every order for the project: category, a status dropdown to advance
 * it (To order → Ordered → Delivered → Installed), an optional vendor, and a
 * remove button. Plus a small "add an order" row. The Quick-Add bar up top is
 * the fast path; this is the full per-project view.
 */
import { Fragment, useState } from 'react'
import type { OrderItem, OrderStatus, Project, ProjectState, TemplateOverride, WorkbenchState } from '../types'
import { MATERIAL_CATEGORIES, ORDER_STATUSES, SITE_SERVICES, standardOrdersFor } from '../data/orders'
import { orderMailto, vendorCallHref, vendorMailto, type Vendor } from '../data/vendors'
import { modelKey } from '../data/models'
import { ordersOf } from '../lib/orders'
import { orderLeadInfo } from '../lib/leadTimes'
import { missingTakeoffs, permitIssued } from '../lib/takeoffs'
import GuideCallout from './GuideCallout'

interface Props {
  project: Project
  ps: ProjectState
  /** Custom email wording from ⚙️ Settings → Templates (defaults when unset). */
  templates?: Record<string, TemplateOverride>
  /** Per-model takeoff status + order lists (⚙️ Settings → Takeoffs). */
  modelTakeoffs?: WorkbenchState['modelTakeoffs']
  modelOrderLists?: WorkbenchState['modelOrderLists']
  /** Owner-added custom material names — shown in the picker under "Your materials". */
  customCategories: string[]
  /** The effective vendors directory (owner-editable; from the blob, defaults seeded). */
  vendors: Vendor[]
  addOrder: (id: number, order: { category: string; status: OrderStatus; orderedOn?: string }) => void
  updateOrder: (id: number, orderId: string, patch: Partial<OrderItem>) => void
  removeOrder: (id: number, orderId: string) => void
  /** One-click "seed the model's standard list" on an empty Materials tab —
   *  a single batched updater in useProjects (duplicate-guarded there). */
  seedStandardOrders: (id: number) => void
}

/** Today as YYYY-MM-DD, for the order-date field's default. */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function MaterialsBody({ project: p, ps, templates, modelTakeoffs, modelOrderLists, customCategories, vendors, addOrder, updateOrder, removeOrder, seedStandardOrders }: Props) {
  const orders = ordersOf(ps)
  const [newCategory, setNewCategory] = useState<string>(MATERIAL_CATEGORIES[0])
  const [customName, setCustomName] = useState('')
  const [newDate, setNewDate] = useState(today())
  // The composer's "type your own material" sentinel. Picking it swaps the
  // category dropdown for a free-text box; the typed name becomes the order's
  // category and useProjects.addOrder remembers it for next time.
  const CUSTOM = '__custom__'
  // The material name we'll actually file: the typed one in custom mode, else
  // the dropdown pick. Trimmed so a stray space can't create a blank order.
  const resolvedCategory = newCategory === CUSTOM ? customName.trim() : newCategory
  const missing = missingTakeoffs(modelTakeoffs, p.model)
  const mk = modelKey(p.model) // '' when the model is unknown/TBD
  const lists = modelOrderLists?.[mk]

  // Show "to order" first, then by status order, so the action items are on top.
  const statusRank: Record<OrderStatus, number> = { toOrder: 0, ordered: 1, delivered: 2, installed: 3 }
  const sorted = [...orders].sort((a, b) => statusRank[a.status] - statusRank[b.status])

  // Each to-order row already shows a one-click ✉️ button to its matching
  // vendor (below). So the bottom "other vendors" row only offers the vendors
  // NOT already covered by a row — for ad-hoc emails — instead of repeating
  // the same buttons twice in two styles (audit finding, June 2026).
  const coveredVendorIds = new Set(
    orders
      .filter((o) => o.status === 'toOrder')
      .map((o) => vendors.find((v) => v.categories?.includes(o.category))?.id)
      .filter(Boolean),
  )
  const otherVendors = vendors.filter((v) => !coveredVendorIds.has(v.id))

  return (
    <>
      {/* New-model alert: this model still has takeoffs to chase down. Red-hot
          once the permit is issued (you can't order what you don't have). */}
      {missing.length > 0 && (
        <div className={permitIssued(ps) ? 'banner' : 'flag'}>
          🧩 Model {modelKey(p.model)} is missing takeoffs: {missing.map((t) => t.label).join(', ')}
          {permitIssued(ps) && <b> — permit is ISSUED, this is now the priority</b>}. Gather them on the 📐 Models tab.
        </div>
      )}

      <GuideCallout id="order-materials" />

      {orders.length === 0 ? (
        /* EMPTY STATE — no orders yet. When we know the model, offer the
           one-click seed: it adds the standard categories (data/orders.ts)
           as "To order" lines via ONE batched update in useProjects. */
        <div className="orders-empty">
          <p className="orders-empty-line">🛒 No orders yet for this house.</p>
          {mk ? (
            <>
              <button className="mini orders-seed" onClick={() => seedStandardOrders(p.id)}>
                ✨ Seed Model {mk}&rsquo;s standard list
              </button>
              <p className="orders-empty-hint">
                One click adds the {standardOrdersFor(mk).length} usual categories (trusses, block, cabinets…) as
                &ldquo;To order&rdquo; — or add a single order below.
              </p>
            </>
          ) : (
            <p className="orders-empty-hint">Add your first order below.</p>
          )}
        </div>
      ) : (
        <div className="orders">
          {sorted.map((o) => {
            // Draft the one-click order email up front — only for a to-order row
            // whose category maps to a known vendor — so we can render it on its
            // own full-width line below the controls.
            const draft = o.status === 'toOrder' ? orderMailto(vendors, o.category, p, ps, templates, lists) : null
            const who = draft ? draft.vendor.contact || draft.vendor.name : ''
            const call = draft ? vendorCallHref(draft.vendor) : null
            // Does ANY vendor in the directory cover this category? Decides
            // whether the row needs the free-text "vendor…" box at all (a known
            // vendor already shows on the ✉️ Order button — the box was
            // redundant next to it; roadmap "redundant vendor affordance").
            const knownVendor = vendors.find((v) => v.categories?.includes(o.category))
            // Lead-time math: null unless still "to order" WITH a needed-by
            // date. Renders as the tinted "order by <date>" pill next to the
            // category (Today's Order-NOW alerts come from the same module).
            const lead = orderLeadInfo(o)
            return (
              <div key={o.id} className={'order' + (o.status === 'toOrder' ? ' to-order' : '')}>
                {/* Top line: category + the order's controls. Wraps if the row
                    is narrow; stacks full-width on phones (mobile block in App.css). */}
                <div className="order-top">
                  <span className="order-cat">
                    {o.category}
                    {lead && (
                      <span
                        className={`order-by ob-${lead.status}`}
                        title={`${lead.leadTimeDays}-day lead time, needed on site ${lead.neededByLabel} — place the order by ${lead.orderByLabel}`}
                      >
                        order by {lead.orderByLabel}
                      </span>
                    )}
                  </span>

                  <select
                    className={`order-status s-${o.status}`}
                    value={o.status}
                    onChange={(e) => updateOrder(p.id, o.id, { status: e.target.value as OrderStatus })}
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>

                  <input
                    className="order-date"
                    type="date"
                    value={o.orderedOn ?? ''}
                    onChange={(e) => updateOrder(p.id, o.id, { orderedOn: e.target.value || undefined })}
                    title="Date ordered"
                  />

                  {/* When must it be ON SITE? Setting this lights up the
                      "order by" pill + the Today alert once the category's
                      lead time says the ordering window is closing. */}
                  <label className="order-needby" title="When this material must be on site — powers the order-by alert">
                    Needed
                    <input
                      type="date"
                      value={o.neededBy ?? ''}
                      onChange={(e) => updateOrder(p.id, o.id, { neededBy: e.target.value || undefined })}
                    />
                  </label>

                  {/* The free-text vendor box only earns its space when the
                      directory has NO vendor for this category (or you already
                      typed one by hand — never hide typed data). With a known
                      vendor, the ✉️ Order button below names them, and rows
                      past "to order" get a quiet read-only "via <vendor>". */}
                  {!knownVendor || o.vendor ? (
                    <input
                      className="order-vendor"
                      value={o.vendor ?? ''}
                      onChange={(e) => updateOrder(p.id, o.id, { vendor: e.target.value })}
                      placeholder="vendor…"
                    />
                  ) : o.status !== 'toOrder' ? (
                    <span className="order-vendor-known" title={knownVendor.supplies}>
                      via {knownVendor.name}
                    </span>
                  ) : null}

                  <button
                    className="task-x"
                    title="Remove order"
                    aria-label={`Remove ${o.category} order`}
                    onClick={() => removeOrder(p.id, o.id)}
                  >
                    ✕
                  </button>
                </div>

                {/* One-click order email on its OWN full-width line: a fully
                    drafted, fully addressed email for THIS material (TO + CC +
                    body w/ the model's order list) — the only thing left is Send.
                    Its own line means the vendor name is never clipped (it used
                    to overflow a narrow grid column into the status dropdown). */}
                {draft && (
                  <div className="order-actions">
                    <a
                      className="mini order-send"
                      href={draft.href}
                      title={`Draft the ${o.category} order to ${who}${draft.vendor.cc ? ` (CC ${draft.vendor.cc.split('@')[0].replace('.', ' ')})` : ''} — just press Send`}
                    >
                      ✉️ Order from {draft.vendor.name}
                    </a>
                    {call && (
                      <a
                        className="mini order-call"
                        href={call}
                        aria-label={`Call ${draft.vendor.name}`}
                        title={`Call ${draft.vendor.name} — ${draft.vendor.phone}`}
                      >
                        📞 Call
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add an order manually: pick a material OR a Florida Express site
          service (deliver / swap / remove), set the date you ordered it. The
          heading separates this composer from the list above (roadmap note —
          it used to blend into the last order row). */}
      <h3 className="order-add-head">＋ Add an order</h3>
      <div className="order-add">
        <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
          <optgroup label="Materials">
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </optgroup>
          {/* Anything added by hand before — remembered in the blob so it shows
              up here on every house (see useProjects.addOrder). */}
          {customCategories.length > 0 && (
            <optgroup label="Your materials">
              {customCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="Site services (Florida Express)">
            {SITE_SERVICES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </optgroup>
          {/* Escape hatch: order something not in the lists (gutters, HVAC, a
              one-off). Picking this reveals a name box below. */}
          <optgroup label="Something else">
            <option value={CUSTOM}>➕ Custom material…</option>
          </optgroup>
        </select>

        {/* Custom mode only: type the material's name. It becomes the order's
            category and is remembered for next time. */}
        {newCategory === CUSTOM && (
          <input
            className="order-add-custom"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Material name (e.g. Windows, Gutters, HVAC)"
            autoFocus
          />
        )}

        <label className="order-add-date">
          Ordered
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        </label>
        <button
          className="mini"
          disabled={!resolvedCategory}
          title={!resolvedCategory ? 'Type the material name first' : undefined}
          onClick={() => {
            addOrder(p.id, { category: resolvedCategory, status: 'toOrder', orderedOn: newDate || undefined })
            // Back to the list so the just-added custom name (now saved) shows
            // under "Your materials" and the text box collapses.
            if (newCategory === CUSTOM) {
              setCustomName('')
              setNewCategory(MATERIAL_CATEGORIES[0])
            }
          }}
        >
          ＋ Add order
        </button>
      </div>

      {/* Ad-hoc email to any vendor NOT already on a to-order row above (those
          have their own one-click ✉️ button). For one-offs / questions. */}
      {otherVendors.length > 0 && (
        <div className="vendor-row">
          <span className="vendor-label">Other vendors:</span>
          {otherVendors.map((v) => {
            const call = vendorCallHref(v)
            return (
              <Fragment key={v.id}>
                <a
                  className="vendor-btn"
                  href={vendorMailto(v, p, ps, templates, lists)}
                  title={`Draft an email to ${v.name} — ${v.supplies}`}
                >
                  ✉️ {v.icon} {v.name}
                </a>
                {call && (
                  <a className="vendor-btn" href={call} aria-label={`Call ${v.name}`} title={`Call ${v.name} — ${v.phone}`}>
                    📞
                  </a>
                )}
              </Fragment>
            )
          })}
        </div>
      )}
    </>
  )
}

export default MaterialsBody
