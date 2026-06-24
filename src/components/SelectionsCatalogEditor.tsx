/**
 * SelectionsCatalogEditor.tsx — ⚙️ Settings → Selections setup.
 *
 * Owner-editable catalog behind the per-project Selections tab. Two modes:
 *   • Base catalog (all models): rename categories, prune the option list,
 *     add/remove categories, hide one globally, and set a "browse options"
 *     link (a finish vendor's website and/or a direct URL that overrides it).
 *   • A specific model: hide categories that don't apply to that model, and
 *     override a category's option list just for that model. (Shared base +
 *     per-model tweaks.)
 *
 * Edits happen on a LOCAL working copy (instant, no laggy whole-app re-renders);
 * "Save changes" commits the whole catalog to the cloud blob in one shot — the
 * same working-copy/save pattern as the checklist StepEditor.
 */
import { useState } from 'react'
import type { SelectionCategory, SelectionsCatalog } from '../types'
import { defaultCatalog } from '../data/selections'
import { MODELS_DEFAULT } from '../data/models'
import { finishVendors } from '../data/vendors'
import Icon from './Icon'

const newId = () => 'c-' + (crypto.randomUUID?.() ?? `${performance.now()}`)
const clone = (c: SelectionsCatalog): SelectionsCatalog => JSON.parse(JSON.stringify(c))

interface Props {
  catalog?: SelectionsCatalog
  onSave: (catalog: SelectionsCatalog) => void
}

function SelectionsCatalogEditor({ catalog, onSave }: Props) {
  const [work, setWork] = useState<SelectionsCatalog>(() => clone(catalog ?? defaultCatalog()))
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [modelK, setModelK] = useState('') // '' = base catalog; else a model key
  const vendors = finishVendors()
  const modelKeys = Object.keys(MODELS_DEFAULT)

  /** Apply an immutable edit to the working copy. */
  function mutate(fn: (c: SelectionsCatalog) => void) {
    setWork((prev) => {
      const next = clone(prev)
      fn(next)
      return next
    })
    setDirty(true)
    setSaved(false)
  }

  // --- base-catalog edits ---
  const editCat = (sid: string, cid: string, patch: Partial<SelectionCategory>) =>
    mutate((c) => {
      const cat = c.sections.find((s) => s.id === sid)?.categories.find((x) => x.id === cid)
      if (cat) Object.assign(cat, patch)
    })
  const setOptions = (sid: string, cid: string, text: string) =>
    mutate((c) => {
      const cat = c.sections.find((s) => s.id === sid)?.categories.find((x) => x.id === cid)
      if (cat) cat.options = text.split('\n') // split/join is identity → no caret jump; trimmed on Save
    })
  const addCat = (sid: string) =>
    mutate((c) => {
      c.sections.find((s) => s.id === sid)?.categories.push({ id: newId(), label: '', options: [] })
    })
  const removeCat = (sid: string, cid: string) =>
    mutate((c) => {
      const sec = c.sections.find((s) => s.id === sid)
      if (sec) sec.categories = sec.categories.filter((x) => x.id !== cid)
    })

  // --- per-model edits ---
  function tweaksOf(c: SelectionsCatalog, mk: string) {
    c.perModel ??= {}
    c.perModel[mk] ??= {}
    return c.perModel[mk]
  }
  const toggleModelHidden = (mk: string, cid: string) =>
    mutate((c) => {
      const t = tweaksOf(c, mk)
      const set = new Set(t.hidden ?? [])
      if (set.has(cid)) set.delete(cid)
      else set.add(cid)
      t.hidden = [...set]
    })
  const setModelOptions = (mk: string, cid: string, text: string) =>
    mutate((c) => {
      const t = tweaksOf(c, mk)
      t.options ??= {}
      if (text.trim()) t.options[cid] = text.split('\n')
      else delete t.options[cid]
    })

  function save() {
    const cleaned = clone(work)
    for (const sec of cleaned.sections) {
      sec.categories = sec.categories
        .map((c) => ({ ...c, label: c.label.trim(), options: c.options.map((o) => o.trim()).filter(Boolean) }))
        .filter((c) => c.label) // drop blank-label categories
    }
    if (cleaned.perModel) {
      for (const mk of Object.keys(cleaned.perModel)) {
        const t = cleaned.perModel[mk]
        if (t.options) {
          for (const cid of Object.keys(t.options)) {
            const arr = t.options[cid].map((o) => o.trim()).filter(Boolean)
            if (arr.length) t.options[cid] = arr
            else delete t.options[cid]
          }
        }
      }
    }
    onSave(cleaned)
    setWork(cleaned)
    setDirty(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }
  function discard() {
    setWork(clone(catalog ?? defaultCatalog()))
    setDirty(false)
  }
  function resetDefaults() {
    if (confirm('Reset the WHOLE selections catalog to the built-in defaults? Your edits and per-model tweaks will be cleared (this only takes effect when you Save).')) {
      setWork(defaultCatalog())
      setDirty(true)
      setSaved(false)
    }
  }

  const perModel = modelK ? work.perModel?.[modelK] : undefined
  const modelHidden = new Set(perModel?.hidden ?? [])

  return (
    <section className="selcat-editor">
      <h3 className="tpl-section-h">Selections setup</h3>
      <p className="muted">
        The finish choices clients pick on a project's <b>Selections</b> tab. Edit the <b>base catalog</b> (shared by
        every house), or switch to a model to hide categories or change its options just for that model. Add a vendor
        link so clients can browse options online. Changes save to the cloud.
      </p>

      <div className="selcat-modebar">
        <label className="selcat-modepick">
          Editing
          <select value={modelK} onChange={(e) => setModelK(e.target.value)}>
            <option value="">Base catalog (all models)</option>
            {modelKeys.map((k) => (
              <option key={k} value={k}>
                Model {k}
              </option>
            ))}
          </select>
        </label>
        <span className="selcat-spacer" />
        {dirty && <span className="muted">Unsaved changes</span>}
        {saved && <span className="selcat-saved">Saved ✓</span>}
        {dirty && (
          <button className="btn btn-ghost btn-sm" onClick={discard}>
            Discard
          </button>
        )}
        <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>
          Save changes
        </button>
      </div>

      {modelK && (
        <p className="selcat-modehint muted">
          Editing <b>Model {modelK}</b> only. Unchecked + blank = uses the base catalog. Check “Hide” to drop a
          category for this model, or type options to override the base list just here.
        </p>
      )}

      {work.sections.map((sec) => (
        <div key={sec.id} className="selcat-section">
          <h4 className="selcat-sec-title">
            <Icon name={sec.icon} size={16} color="var(--rust)" />
            {sec.label}
          </h4>

          {sec.categories.map((cat) =>
            modelK === '' ? (
              // ---- BASE CATALOG ROW ----
              <div key={cat.id} className={'selcat-cat' + (cat.hidden ? ' is-hidden' : '')}>
                <div className="selcat-cat-head">
                  <input
                    className="selcat-label"
                    value={cat.label}
                    placeholder="Category name…"
                    onChange={(e) => editCat(sec.id, cat.id, { label: e.target.value })}
                  />
                  <label className="selcat-hide">
                    <input
                      type="checkbox"
                      checked={!!cat.hidden}
                      onChange={(e) => editCat(sec.id, cat.id, { hidden: e.target.checked })}
                    />
                    Hide
                  </label>
                  <button
                    className="se-del"
                    title="Remove category"
                    onClick={() => {
                      if (confirm(`Remove "${cat.label || 'this category'}"? (Past choices saved under it stay in the data but won't show.)`)) removeCat(sec.id, cat.id)
                    }}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
                <textarea
                  className="selcat-options"
                  rows={Math.min(8, Math.max(2, cat.options.length + 1))}
                  value={cat.options.join('\n')}
                  placeholder="One option per line. Leave blank for a write-in-only field."
                  onChange={(e) => setOptions(sec.id, cat.id, e.target.value)}
                />
                <div className="selcat-link">
                  <select
                    value={cat.vendorId ?? ''}
                    onChange={(e) => editCat(sec.id, cat.id, { vendorId: e.target.value || undefined })}
                  >
                    <option value="">No vendor link</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.website ? '' : ' (no website set)'}
                      </option>
                    ))}
                  </select>
                  <input
                    className="selcat-url"
                    value={cat.url ?? ''}
                    placeholder="Browse URL (overrides the vendor link)"
                    onChange={(e) => editCat(sec.id, cat.id, { url: e.target.value || undefined })}
                  />
                </div>
              </div>
            ) : (
              // ---- PER-MODEL ROW ----
              <div key={cat.id} className={'selcat-cat' + (modelHidden.has(cat.id) ? ' is-hidden' : '')}>
                <div className="selcat-cat-head">
                  <span className="selcat-label-ro">{cat.label}</span>
                  <label className="selcat-hide">
                    <input
                      type="checkbox"
                      checked={modelHidden.has(cat.id)}
                      onChange={() => toggleModelHidden(modelK, cat.id)}
                    />
                    Hide for Model {modelK}
                  </label>
                </div>
                {!modelHidden.has(cat.id) && (
                  <>
                    <textarea
                      className="selcat-options"
                      rows={Math.min(8, Math.max(2, (perModel?.options?.[cat.id] ?? []).length + 1))}
                      value={(perModel?.options?.[cat.id] ?? []).join('\n')}
                      placeholder={`Uses base options. Type here to override for Model ${modelK} (one per line).`}
                      onChange={(e) => setModelOptions(modelK, cat.id, e.target.value)}
                    />
                    {cat.options.length > 0 && (
                      <span className="selcat-base-hint muted">Base: {cat.options.join(', ')}</span>
                    )}
                  </>
                )}
              </div>
            ),
          )}

          {modelK === '' && (
            <button className="btn btn-secondary btn-sm selcat-add" onClick={() => addCat(sec.id)}>
              <Icon name="add" size={16} /> Add category
            </button>
          )}
        </div>
      ))}

      <div className="selcat-foot">
        <button className="btn btn-ghost btn-sm" onClick={resetDefaults}>
          ↺ Reset all to defaults
        </button>
      </div>
    </section>
  )
}

export default SelectionsCatalogEditor
