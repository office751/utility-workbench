/**
 * ModelsView.tsx — the 📐 Models tab: one page per house model.
 *
 * Each model page shows:
 *   - the spec facts (sqft · A/C tonnage · beds, from data/models.ts)
 *   - editable library facts: MASTER-FILED yes/no + free-form notes
 *   - which active projects are building this model right now
 *   - a plans locker — the same upload/share/copy-link box projects have
 *     (DocumentsBox), so a model's plan set/calcs can be shared with anyone
 *     as ~1-year download links, pretty-pasted into Apple Mail via mailclip.
 *
 * Model FILES live under models/<key>/ in the same private bucket; the
 * pointers + editable facts live in WorkbenchState.models (cloud-synced).
 */
import { useState } from 'react'
import type { ModelState, WorkbenchState } from '../types'
import { MODELS_DEFAULT } from '../data/models'
import { missingTakeoffs } from '../lib/takeoffs'
import { TAKEOFF_TYPES } from '../data/takeoffs'
import { ORDER_CATEGORIES } from '../data/orders'
import DocumentsBox from './DocumentsBox'

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
  // state (so a future model added by data edit shows up automatically).
  const keys = [...new Set([...Object.keys(MODELS_DEFAULT), ...Object.keys(models ?? {})])]

  if (!selected) {
    return (
      <section className="detail">
        <h2 className="detail-title">📐 Models</h2>
        <p className="meta">Specs, plan files, and shareable links — one page per house model.</p>
        <div className="model-grid">
          {keys.map((mk) => {
            const spec = MODELS_DEFAULT[mk]
            const m = models?.[mk]
            const docs = m?.docs ?? []
            return (
              <button key={mk} className="model-card" onClick={() => setSelected(mk)}>
                <span className="model-name">{mk}</span>
                <span className="model-spec">
                  {spec?.sqft ? `${spec.sqft} sqft` : 'spec?'}
                  {spec?.tons ? ` · ${spec.tons}T` : ''}
                  {spec?.beds ? ` · ${spec.beds}bd` : ''}
                </span>
                <span className="model-meta">
                  {m?.masterFiled && <span className="badge done">MASTER-FILED</span>}
                  <span className="badge">{docs.length} file{docs.length === 1 ? '' : 's'}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  const mk = selected
  const spec = MODELS_DEFAULT[mk]
  const m = models?.[mk] ?? {}
  const missing = missingTakeoffs(modelTakeoffs, mk)
  const got = modelTakeoffs?.[mk] ?? {}
  const lists = modelOrderLists?.[mk] ?? {}

  return (
    <section className="detail">
      <div className="detail-head">
        <button className="mini back" onClick={() => setSelected(null)}>
          ← All models
        </button>
      </div>

      <h2 className="detail-title">
        Model {mk}
        {m.masterFiled && <span className="status-pill co">MASTER-FILED</span>}
      </h2>
      <p className="meta">
        {spec?.sqft ? `${spec.sqft} sqft` : 'sqft unknown'}
        {spec?.tons ? ` · ${spec.tons} ton A/C` : ''}
        {spec?.beds ? ` · ${spec.beds} bed` : ''}
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
