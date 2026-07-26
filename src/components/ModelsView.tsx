/**
 * ModelsView.tsx — the 📐 Models tab: one page per house model.
 *
 * Each model page shows:
 *   - the spec facts (sqft · A/C tonnage · beds) — EDITABLE since July 2026:
 *     edits save to ModelState.spec and flow into the SECO/Duke load forms
 *     via applyModelSpecs() (see App.tsx); blank an edit to fall back to the
 *     code default from data/models.ts
 *   - editable library facts: MASTER-FILED yes/no + free-form notes
 *   - a 📂 OneDrive/SharePoint folder link (pasted once) — where the model's
 *     plan sets already live, no re-uploading needed just to browse them
 *   - 🧰 FGT cabinet layouts (CabinetLayoutEditor) — runs, fit-checks, BOM
 *   - a plans locker — the same upload/share/copy-link box projects have
 *     (DocumentsBox) for signed ~1-year download links (Jennifer/mailclip
 *     flows still need real uploads; the folder link doesn't replace this)
 *
 * Model FILES live under models/<key>/ in the same private bucket; the
 * pointers + editable facts live in WorkbenchState.models (cloud-synced).
 * New models can be added right from the grid ("＋ Add a model") — the key
 * list is the union of code defaults and anything in the blob.
 */
import { useState } from 'react'
import type { ModelState, WorkbenchState } from '../types'
import { MODELS_DEFAULT, effectiveSpec } from '../data/models'
import { cabinetLayoutsFor } from '../data/cabinets'
import { missingTakeoffs } from '../lib/takeoffs'
import { TAKEOFF_TYPES } from '../data/takeoffs'
import { ORDER_CATEGORIES } from '../data/orders'
import DocumentsBox from './DocumentsBox'
import CabinetLayoutEditor from './CabinetLayoutEditor'

interface Props {
  models: WorkbenchState['models']
  modelTakeoffs?: WorkbenchState['modelTakeoffs']
  modelOrderLists?: WorkbenchState['modelOrderLists']
  addModelFiles: (modelK: string, files: File[]) => Promise<{ ok: number; failed: string[] }>
  removeModelFile: (modelK: string, index: number) => void
  setModelInfo: (modelK: string, patch: Partial<ModelState>) => void
  setModelTakeoff: (modelK: string, takeoffId: string, done: boolean) => void
  setModelOrderList: (modelK: string, category: string, text: string) => void
}

/** One numeric spec input: shows the effective value, saves the override. */
function SpecField({
  label,
  value,
  step,
  onSave,
}: {
  label: string
  value: number | '' | undefined
  step: number
  onSave: (v: number | '') => void
}) {
  return (
    <label className="spec-field">
      {label}
      <input
        type="number"
        step={step}
        min={0}
        value={value ?? ''}
        onChange={(e) => onSave(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </label>
  )
}

function ModelsView({
  models,
  modelTakeoffs,
  modelOrderLists,
  addModelFiles,
  removeModelFile,
  setModelInfo,
  setModelTakeoff,
  setModelOrderList,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [addCat, setAddCat] = useState('')

  // Every model we know: the spec roster + anything that already has library
  // state (so a model added in-app or by data edit shows up automatically).
  const keys = [...new Set([...Object.keys(MODELS_DEFAULT), ...Object.keys(models ?? {})])]

  const addModel = () => {
    const raw = window.prompt('New model name (short key, e.g. "Liberty"):')
    const key = (raw ?? '').trim()
    if (!key) return
    if (keys.some((k) => k.toLowerCase() === key.toLowerCase())) {
      window.alert(`"${key}" already exists.`)
      return
    }
    setModelInfo(key, {}) // creates the blob entry; the union above picks it up
    setSelected(key)
  }

  if (!selected) {
    return (
      <section className="detail">
        <h2 className="detail-title">📐 Models</h2>
        <p className="meta">Specs, plan files, cabinet layouts, and shareable links — one page per house model.</p>
        <div className="model-grid">
          {keys.map((mk) => {
            const spec = effectiveSpec(mk)
            const m = models?.[mk]
            const docs = m?.docs ?? []
            const cabs = cabinetLayoutsFor(mk, models)
            return (
              <button key={mk} className="model-card" onClick={() => setSelected(mk)}>
                <span className="model-name">{mk}</span>
                <span className="model-spec">
                  {spec.sqft ? `${spec.sqft} sqft` : 'spec?'}
                  {spec.tons ? ` · ${spec.tons}T` : ''}
                  {spec.beds ? ` · ${spec.beds}bd` : ''}
                </span>
                <span className="model-meta">
                  {m?.masterFiled && <span className="badge done">MASTER-FILED</span>}
                  <span className="badge">{docs.length} file{docs.length === 1 ? '' : 's'}</span>
                  {cabs.length > 0 && <span className="badge">🧰 {cabs.length}</span>}
                </span>
              </button>
            )
          })}
          <button className="model-card model-card-add" onClick={addModel}>
            <span className="model-name">＋</span>
            <span className="model-spec">Add a model</span>
          </button>
        </div>
      </section>
    )
  }

  const mk = selected
  const m = models?.[mk] ?? {}
  const spec = effectiveSpec(mk)
  const missing = missingTakeoffs(modelTakeoffs, mk)
  const got = modelTakeoffs?.[mk] ?? {}
  const lists = modelOrderLists?.[mk] ?? {}
  const folderUrl = (m.folderUrl ?? '').trim()

  /** Save one spec field: writes the override; blanking falls back to default. */
  const saveSpec = (field: 'sqft' | 'tons' | 'beds') => (v: number | '') =>
    setModelInfo(mk, { spec: { ...m.spec, [field]: v } })

  return (
    <section className="detail">
      <div className="detail-head">
        <button className="mini back" onClick={() => setSelected(null)}>
          ← All models
        </button>
        {folderUrl && (
          <a className="btn btn-secondary" href={encodeURI(folderUrl)} target="_blank" rel="noreferrer">
            📂 Plans folder
          </a>
        )}
      </div>

      <h2 className="detail-title">
        Model {mk}
        {m.masterFiled && <span className="status-pill co">MASTER-FILED</span>}
      </h2>

      {/* Spec facts — editable; the load forms read these through specFor().
          Blank a box to fall back to the code default (data/models.ts). */}
      <div className="spec-row">
        <SpecField label="sqft (living)" value={spec.sqft} step={1} onSave={saveSpec('sqft')} />
        <SpecField label="A/C tons" value={spec.tons} step={0.5} onSave={saveSpec('tons')} />
        <SpecField label="beds" value={spec.beds} step={1} onSave={saveSpec('beds')} />
        {m.spec && Object.values(m.spec).some((v) => v !== undefined && v !== '') && (
          <button className="mini" onClick={() => setModelInfo(mk, { spec: undefined })}>
            ↺ reset to defaults
          </button>
        )}
      </div>
      <p className="meta">
        Edits here flow straight into the ⚡ SECO/Duke load forms for every {mk} house.
      </p>

      {/* Takeoffs still missing = can't order materials for this model yet.
          (Managed right below now — no bouncing to Settings.) */}
      {missing.length > 0 && (
        <div className="flag">🧩 Missing takeoffs: {missing.map((t) => t.label).join(', ')} — gather them below.</div>
      )}

      {/* Editable library facts. */}
      <div className="settings">
        <label className="model-mf">
          Master-filed with the county
          <span className="model-mf-row">
            <input
              type="checkbox"
              checked={m.masterFiled ?? false}
              onChange={(e) => setModelInfo(mk, { masterFiled: e.target.checked })}
            />
            {m.masterFiled
              ? 'Yes — permits reference the master file; energy calcs ride along'
              : 'No / not yet — full sealed plan set goes with each permit'}
          </span>
        </label>
      </div>

      {/* The model's OneDrive folder — paste OneDrive's "Copy link" once and
          the 📂 button up top opens it forever. Linking beats re-uploading
          for BROWSING; the locker below still handles signed-link sharing. */}
      <label className="notes-label">
        OneDrive / SharePoint plans folder link
        <input
          className="grow"
          value={m.folderUrl ?? ''}
          onChange={(e) => setModelInfo(mk, { folderUrl: e.target.value })}
          placeholder="Paste the folder's Copy-link URL from OneDrive…"
        />
      </label>

      <label className="notes-label">
        Notable info
        <textarea
          rows={3}
          value={m.notes ?? ''}
          onChange={(e) => setModelInfo(mk, { notes: e.target.value })}
          placeholder="Revisions, engineer, quirks, what's special about this model…"
        />
      </label>

      {/* TAKEOFFS — which ones are gathered, plus the material order lists that
          flow into vendor order emails for every house of this model. Moved
          here from 🛠 Settings (audit, June 2026): a model's data lives on the
          model's own page, not a separate screen. */}
      <div className="model-takeoffs">
        <div className="tpl-preview-h">Takeoffs gathered</div>
        <div className="tko-checks">
          {TAKEOFF_TYPES.map((t) => {
            const st = got[t.id]
            return (
              <label key={t.id} className="check tko-check">
                <input
                  type="checkbox"
                  checked={!!st?.done}
                  onChange={(e) => setModelTakeoff(mk, t.id, e.target.checked)}
                />
                {t.icon} {t.label}
                {st?.done && st.date && <span className="muted"> · {st.date}</span>}
              </label>
            )
          })}
        </div>

        <div className="tko-lists">
          <div className="tpl-preview-h">Material order lists (flow into vendor emails)</div>
          {Object.entries(lists).map(([cat, text]) => (
            <label key={cat} className="tpl-label">
              {cat}
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setModelOrderList(mk, cat, e.target.value)}
                placeholder={`Model ${mk}'s ${cat.toLowerCase()} list…`}
              />
            </label>
          ))}
          <div className="tko-add">
            <select value={addCat} onChange={(e) => setAddCat(e.target.value)}>
              <option value="">Add a list for…</option>
              {ORDER_CATEGORIES.filter((c) => !lists[c]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button
              className="mini"
              disabled={!addCat}
              onClick={() => {
                setModelOrderList(mk, addCat, `(${mk} ${addCat} list — paste it here)`)
                setAddCat('')
              }}
            >
              ＋ Add
            </button>
          </div>
        </div>
      </div>

      {/* 🧰 FGT cabinet layouts — runs with live fit-checks + auto BOM.
          Reads the code default until the first edit copies it into the blob
          (cabinetLayoutsFor); every change saves the whole array in ONE
          setModelInfo call (gotcha #1). */}
      <CabinetLayoutEditor
        layouts={cabinetLayoutsFor(mk, models)}
        onChange={(next) => setModelInfo(mk, { cabinets: next })}
        printTitle={`Model ${mk}`}
      />

      {/* The plans locker — identical mechanics to a project's Files box:
          upload, ⬇ open, 📤 share, 📋 copy a pretty link for email. */}
      <DocumentsBox
        projectId={0 /* unused by the box — model files key off the handlers */}
        docs={m.docs ?? []}
        onAddFiles={(files) => addModelFiles(mk, files)}
        onRemove={(i) => removeModelFile(mk, i)}
      />
    </section>
  )
}

export default ModelsView
