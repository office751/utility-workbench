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
import type { ModelState, Project, WorkbenchState } from '../types'
import { MODELS_DEFAULT, modelKey } from '../data/models'
import { missingTakeoffs } from '../lib/takeoffs'
import DocumentsBox from './DocumentsBox'

interface Props {
  roster: Project[]
  models: WorkbenchState['models']
  modelTakeoffs?: WorkbenchState['modelTakeoffs']
  addModelFiles: (modelK: string, files: File[]) => Promise<{ ok: number; failed: string[] }>
  removeModelFile: (modelK: string, index: number) => void
  setModelInfo: (modelK: string, patch: Partial<ModelState>) => void
}

function ModelsView({ roster, models, modelTakeoffs, addModelFiles, removeModelFile, setModelInfo }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  // Every model we know: the spec roster + anything that already has library
  // state (so a future model added by data edit shows up automatically).
  const keys = [...new Set([...Object.keys(MODELS_DEFAULT), ...Object.keys(models ?? {})])]

  /** Active (not C.O./Hold) projects building this model. */
  const projectsUsing = (mk: string) =>
    roster.filter((p) => modelKey(p.model) === mk && p.listStatus !== 'CO' && p.listStatus !== 'Hold')

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
            const using = projectsUsing(mk)
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
                  {using.length > 0 && <span className="badge u-DUKE">{using.length} active</span>}
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
  const using = projectsUsing(mk)
  const missing = missingTakeoffs(modelTakeoffs, mk)

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
        {using.length > 0 && <> · building now: {using.map((p) => p.address).join(', ')}</>}
      </p>

      {/* Takeoffs still missing = can't order materials for this model yet. */}
      {missing.length > 0 && (
        <div className="flag">🧩 Missing takeoffs: {missing.map((t) => t.label).join(', ')} — manage in 🛠 Settings.</div>
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
