/**
 * VendorsEditor.tsx — 🛠 Settings → Vendor setup.
 *
 * Owner-editable Vendors directory. Add/remove suppliers and edit the fields the
 * order-email + Selections flows use: name, contact (greeting), email, CC,
 * phone, website (the client's "Browse" link), supplies tooltip, the order
 * categories they cover, and the finish-trade flag.
 *
 * Edits happen on a LOCAL working copy (instant); "Save changes" commits the
 * whole list to the cloud blob in one shot — the same working-copy/save pattern
 * as SelectionsCatalogEditor. Once saved, the blob owns the list (code defaults
 * only seed the first run).
 *
 * Limitation worth knowing: a vendor's custom email WORDING is still tuned on
 * the Templates page, which is built from the BUILT-IN vendor list. A brand-new
 * vendor added here works immediately but uses the default vendor wording until
 * a per-vendor template entry exists.
 */
import { useState } from 'react'
import type { Vendor } from '../data/vendors'
import { ORDER_CATEGORIES } from '../data/orders'
import Icon from './Icon'

const newId = () => 'v-' + (crypto.randomUUID?.() ?? `${performance.now()}`)
const clone = (v: Vendor[]): Vendor[] => JSON.parse(JSON.stringify(v))

interface Props {
  vendors: Vendor[]
  onSave: (vendors: Vendor[]) => void
}

function VendorsEditor({ vendors, onSave }: Props) {
  const [work, setWork] = useState<Vendor[]>(() => clone(vendors))
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  /** Apply an immutable edit to the working copy. */
  function mutate(fn: (list: Vendor[]) => void) {
    setWork((prev) => {
      const next = clone(prev)
      fn(next)
      return next
    })
    setDirty(true)
    setSaved(false)
  }

  const patch = (i: number, p: Partial<Vendor>) => mutate((list) => Object.assign(list[i], p))
  const remove = (i: number) => mutate((list) => list.splice(i, 1))
  const add = () =>
    mutate((list) => list.push({ id: newId(), name: '', email: '', icon: '📦', supplies: '', categories: [] }))

  function save() {
    onSave(work)
    setDirty(false)
    setSaved(true)
  }

  return (
    <section className="vend-editor">
      <div className="vend-editor-head">
        <h2>🚚 Vendor setup</h2>
        <div className="vend-editor-actions">
          {saved && <span className="selcat-saved">Saved ✓</span>}
          <button className="mini primary" onClick={save} disabled={!dirty}>
            Save changes
          </button>
        </div>
      </div>
      <p className="muted">
        Your suppliers — these power the one-click order emails on each house's 🛒 Materials tab and the
        finish-trade recipients on the Selections tab. Edit them here; no code needed.
      </p>

      {work.map((v, i) => (
        <div key={v.id} className="vend-card">
          <div className="vend-row">
            <label className="vend-f vend-icon">
              Icon
              <input value={v.icon} onChange={(e) => patch(i, { icon: e.target.value })} maxLength={2} />
            </label>
            <label className="vend-f vend-grow">
              Name
              <input value={v.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Tibbetts Lumber" />
            </label>
            <button
              className="team-x vend-del"
              title="Remove vendor"
              aria-label={`Remove ${v.name || 'vendor'}`}
              onClick={() => remove(i)}
            >
              <Icon name="delete" size={16} />
            </button>
          </div>

          <div className="vend-row">
            <label className="vend-f vend-grow">
              Email
              <input value={v.email} onChange={(e) => patch(i, { email: e.target.value })} placeholder="orders@vendor.com" />
            </label>
            <label className="vend-f vend-grow">
              CC (optional)
              <input value={v.cc ?? ''} onChange={(e) => patch(i, { cc: e.target.value || undefined })} placeholder="cc@vendor.com" />
            </label>
          </div>

          <div className="vend-row">
            <label className="vend-f">
              Phone
              <input value={v.phone ?? ''} onChange={(e) => patch(i, { phone: e.target.value || undefined })} placeholder="352-555-1234" />
            </label>
            <label className="vend-f">
              Contact (greeting)
              <input value={v.contact ?? ''} onChange={(e) => patch(i, { contact: e.target.value || undefined })} placeholder="Tina" />
            </label>
            <label className="vend-f vend-grow">
              Website (the "Browse" link)
              <input value={v.website ?? ''} onChange={(e) => patch(i, { website: e.target.value || undefined })} placeholder="https://…" />
            </label>
          </div>

          <div className="vend-row">
            <label className="vend-f vend-grow">
              Supplies (tooltip)
              <input value={v.supplies} onChange={(e) => patch(i, { supplies: e.target.value })} placeholder="Truss & framing packages" />
            </label>
            <label className="vend-f vend-grow">
              Order categories (comma-separated)
              <input
                value={(v.categories ?? []).join(', ')}
                onChange={(e) =>
                  patch(i, { categories: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                }
                placeholder="Trusses, Framing package"
                list="vend-cat-list"
              />
            </label>
          </div>

          <label className="vend-check">
            <input type="checkbox" checked={!!v.finish} onChange={(e) => patch(i, { finish: e.target.checked })} />
            Finish trade — gets the homeowner Selections package
          </label>
        </div>
      ))}

      {/* Suggestions for the categories field (the app's known order categories). */}
      <datalist id="vend-cat-list">
        {ORDER_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <button className="mini" onClick={add}>
        ＋ Add vendor
      </button>
    </section>
  )
}

export default VendorsEditor
