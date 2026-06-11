/**
 * MaterialsBody.tsx — the per-project orders list (the Materials tab detail).
 *
 * Shows every order for the project: category, a status dropdown to advance
 * it (To order → Ordered → Delivered → Installed), an optional vendor, and a
 * remove button. Plus a small "add an order" row. The Quick-Add bar up top is
 * the fast path; this is the full per-project view.
 */
import { useState } from 'react'
import type { OrderItem, OrderStatus, Project, ProjectState, TemplateOverride, WorkbenchState } from '../types'
import { ORDER_CATEGORIES, ORDER_STATUSES } from '../data/orders'
import { VENDORS, orderMailto, vendorMailto } from '../data/vendors'
import { modelKey } from '../data/models'
import { ordersOf } from '../lib/orders'
import { missingTakeoffs, permitIssued } from '../lib/takeoffs'

interface Props {
  project: Project
  ps: ProjectState
  /** Custom email wording from ⚙️ Settings → Templates (defaults when unset). */
  templates?: Record<string, TemplateOverride>
  /** Per-model takeoff status + order lists (⚙️ Settings → Takeoffs). */
  modelTakeoffs?: WorkbenchState['modelTakeoffs']
  modelOrderLists?: WorkbenchState['modelOrderLists']
  addOrder: (id: number, order: { category: string; status: OrderStatus }) => void
  updateOrder: (id: number, orderId: string, patch: Partial<OrderItem>) => void
  removeOrder: (id: number, orderId: string) => void
}

function MaterialsBody({ project: p, ps, templates, modelTakeoffs, modelOrderLists, addOrder, updateOrder, removeOrder }: Props) {
  const orders = ordersOf(ps)
  const [newCategory, setNewCategory] = useState(ORDER_CATEGORIES[0])
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

      {orders.length === 0 ? (
        <p className="summary">🛒 No orders yet — add one below, or use the 🛒 Quick-Add bar on the Projects page.</p>
      ) : (
        <div className="orders">
          {sorted.map((o) => (
            <div key={o.id} className={'order' + (o.status === 'toOrder' ? ' to-order' : '')}>
              <span className="order-cat">{o.category}</span>

              {/* One-click order: a fully drafted, fully addressed email for
                  THIS material (TO + CC + body w/ the model's order list) —
                  the only thing left is Send. Shows only while it still needs
                  ordering and a vendor in VENDORS covers the category. */}
              {o.status === 'toOrder' && (() => {
                const draft = orderMailto(o.category, p, ps, templates, lists)
                if (!draft) return null
                const who = draft.vendor.contact || draft.vendor.name
                return (
                  <a
                    className="mini order-send"
                    href={draft.href}
                    title={`Draft the ${o.category} order to ${who}${draft.vendor.cc ? ` (CC ${draft.vendor.cc.split('@')[0].replace('.', ' ')})` : ''} — just press Send`}
                  >
                    ✉️ Order from {draft.vendor.name}
                  </a>
                )
              })()}

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
                className="order-vendor"
                value={o.vendor ?? ''}
                onChange={(e) => updateOrder(p.id, o.id, { vendor: e.target.value })}
                placeholder="vendor…"
              />

              <button
                className="task-x"
                title="Remove order"
                onClick={() => removeOrder(p.id, o.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add an order manually (pick a category → it starts as "To order"). */}
      <div className="order-add">
        <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
          {ORDER_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="mini" onClick={() => addOrder(p.id, { category: newCategory, status: 'toOrder' })}>
          ＋ Add order
        </button>
      </div>

      {/* Ad-hoc email to any vendor NOT already on a to-order row above (those
          have their own one-click ✉️ button). For one-offs / questions. */}
      {otherVendors.length > 0 && (
        <div className="vendor-row">
          <span className="vendor-label">✉️ Other vendors:</span>
          {otherVendors.map((v) => (
            <a
              key={v.id}
              className="vendor-btn"
              href={vendorMailto(v, p, ps, templates, lists)}
              title={`Draft an email to ${v.name} — ${v.supplies}`}
            >
              {v.icon} {v.name}
            </a>
          ))}
        </div>
      )}
    </>
  )
}

export default MaterialsBody
