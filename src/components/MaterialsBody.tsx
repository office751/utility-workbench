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
import { MATERIAL_CATEGORIES, ORDER_STATUSES, SITE_SERVICES } from '../data/orders'
import { VENDORS, orderMailto, vendorCallHref, vendorMailto } from '../data/vendors'
import { modelKey } from '../data/models'
import { ordersOf } from '../lib/orders'
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
  addOrder: (id: number, order: { category: string; status: OrderStatus; orderedOn?: string }) => void
  updateOrder: (id: number, orderId: string, patch: Partial<OrderItem>) => void
  removeOrder: (id: number, orderId: string) => void
}

/** Today as YYYY-MM-DD, for the order-date field's default. */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function MaterialsBody({ project: p, ps, templates, modelTakeoffs, modelOrderLists, addOrder, updateOrder, removeOrder }: Props) {
  const orders = ordersOf(ps)
  const [newCategory, setNewCategory] = useState(MATERIAL_CATEGORIES[0])
  const [newDate, setNewDate] = useState(today())
  const missing = missingTakeoffs(modelTakeoffs, p.model)
  const lists = modelOrderLists?.[modelKey(p.model)]

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
      .map((o) => VENDORS.find((v) => v.categories?.includes(o.category))?.id)
      .filter(Boolean),
  )
  const otherVendors = VENDORS.filter((v) => !coveredVendorIds.has(v.id))

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
        <p className="summary">🛒 No orders yet — add one below.</p>
      ) : (
        <div className="orders">
          {sorted.map((o) => {
            // Draft the one-click order email up front — only for a to-order row
            // whose category maps to a known vendor — so we can render it on its
            // own full-width line below the controls.
            const draft = o.status === 'toOrder' ? orderMailto(o.category, p, ps, templates, lists) : null
            const who = draft ? draft.vendor.contact || draft.vendor.name : ''
            const call = draft ? vendorCallHref(draft.vendor) : null
            return (
              <div key={o.id} className={'order' + (o.status === 'toOrder' ? ' to-order' : '')}>
                {/* Top line: category + the order's controls. Wraps if the row
                    is narrow; stacks full-width on phones (mobile block in App.css). */}
                <div className="order-top">
                  <span className="order-cat">{o.category}</span>

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

                  <input
                    className="order-vendor"
                    value={o.vendor ?? ''}
                    onChange={(e) => updateOrder(p.id, o.id, { vendor: e.target.value })}
                    placeholder="vendor…"
                  />

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
          service (deliver / swap / remove), set the date you ordered it. */}
      <div className="order-add">
        <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
          <optgroup label="Materials">
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </optgroup>
          <optgroup label="Site services (Florida Express)">
            {SITE_SERVICES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </optgroup>
        </select>
        <label className="order-add-date">
          Ordered
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        </label>
        <button
          className="mini"
          onClick={() => addOrder(p.id, { category: newCategory, status: 'toOrder', orderedOn: newDate || undefined })}
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
