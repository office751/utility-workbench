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
import { finishVendors, type Vendor } from '../data/vendors'
import { uploadSelectionImage } from '../lib/files'
import Icon from './Icon'

const newId = () => 'c-' + (crypto.randomUUID?.() ?? `${performance.now()}`)
const clone = (c: SelectionsCatalog): SelectionsCatalog => JSON.parse(JSON.stringify(c))

interface Props {
  catalog?: SelectionsCatalog
  onSave: (catalog: SelectionsCatalog) => void
  /** The effective vendors directory — finish vendors fill the browse-link picker. */
  vendors: Vendor[]
}

function SelectionsCatalogEditor({ catalog, onSave, vendors }: Props) {
  const [work, setWork] = useState<SelectionsCatalog>(() => clone(catalog ?? defaultCatalog()))
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [modelK, setModelK] = useState('') // '' = base catalog; else a model key
  const [photoOpen, setPhotoOpen] = useState<Set<string>>(new Set()) // category ids with the Photos panel expanded
  const [uploading, setUploading] = useState<Set<string>>(new Set()) // "catId::label" rows mid-upload
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const finVendors = finishVendors(vendors)
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

  // --- per-option photos ---
  const setOptionImage = (sid: string, cid: string, label: string, url: string) =>
    mutate((c) => {
      const cat = c.sections.find((s) => s.id === sid)?.categories.find((x) => x.id === cid)
      if (!cat) return
      cat.optionImages ??= {}
      if (url) cat.optionImages[label] = url
      else delete cat.optionImages[label]
    })
  const togglePhotos = (cid: string) =>
    setPhotoOpen((prev) => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  async function uploadFor(sid: string, cid: string, label: string, file: File) {
    const key = `${cid}::${label}`
    setUploadErr(null)
    setUploading((p) => new Set(p).add(key))
    try {
      const url = await uploadSelectionImage(file)
      setOptionImage(sid, cid, label, url)
    } catch {
      setUploadErr('Upload failed — apply supabase/setup-selection-images.sql once, or paste an image URL instead.')
      setTimeout(() => setUploadErr(null), 6000)
    } finally {
      setUploading((p) => {
        const n = new Set(p)
        n.delete(key)
        return n
      })
    }
  }
  /** The distinct, non-blank option labels of a category (for the photo rows). */
  const optionLabels = (opts: string[]) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const o of opts.map((x) => x.trim())) {
      if (o && !seen.has(o)) {
        seen.add(o)
        out.push(o)
      }
    }
    return out
  }

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
        {uploadErr && <span className="selcat-uploaderr">{uploadErr}</span>}
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
                    aria-label="Remove category"
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
                    {finVendors.map((v) => (
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

                {optionLabels(cat.options).length > 0 && (
                  <div className="selcat-photos">
                    <button className="selcat-photos-toggle" onClick={() => togglePhotos(cat.id)}>
                      <Icon name={photoOpen.has(cat.id) ? 'expand_more' : 'chevron_right'} size={16} />
                      Photos
                      {Object.keys(cat.optionImages ?? {}).length > 0 && ` (${Object.keys(cat.optionImages ?? {}).length})`}
                    </button>
                    {photoOpen.has(cat.id) && (
                      <div className="selcat-photo-list">
                        {optionLabels(cat.options).map((label) => {
                          const url = cat.optionImages?.[label]
                          const key = `${cat.id}::${label}`
                          return (
                            <div className="selcat-photo-row" key={label}>
                              {url ? (
                                <img className="selcat-thumb" src={url} alt="" />
                              ) : (
                                <span className="selcat-thumb selcat-thumb-empty">
                                  <Icon name="image" size={16} />
                                </span>
                              )}
                              <span className="selcat-photo-label">{label}</span>
                              <input
                                className="selcat-photo-url"
                                value={url ?? ''}
                                placeholder="Image URL, or upload →"
                                onChange={(e) => setOptionImage(sec.id, cat.id, label, e.target.value)}
                              />
                              <label className="btn btn-secondary btn-sm selcat-upload">
                                {uploading.has(key) ? (
                                  '…'
                                ) : (
                                  <>
                                    <Icon name="upload" size={14} /> Upload
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  hidden
                                  onChange={(e) => {
                                    const f = e.target.files?.[0]
                                    if (f) uploadFor(sec.id, cat.id, label, f)
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                              {url && (
                                <button
                                  className="se-del"
                                  title="Remove photo"
                                  aria-label="Remove photo"
                                  onClick={() => setOptionImage(sec.id, cat.id, label, '')}
                                >
                                  <Icon name="close" size={14} />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
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
