/**
 * TakeoffsView.tsx — ⚙️ Settings → 📐 Model takeoffs.
 *
 * One card per house model: which takeoffs have been GATHERED (truss
 * engineering, framing, masonry, cabinets, flooring), plus the model's
 * material ORDER LISTS (the actual takeoff contents — e.g. the block count) —
 * which auto-flow into vendor order emails for every house of that model.
 *
 * A model missing takeoffs shows a red pill here, a banner on its projects'
 * Materials tabs, and — once a permit is ISSUED — a top-priority item on Today.
 */
import { useState } from 'react'
import type { Project, WorkbenchState } from '../types'
import { TAKEOFF_TYPES } from '../data/takeoffs'
import { MODELS_DEFAULT, modelKey } from '../data/models'
import { ORDER_CATEGORIES } from '../data/orders'

interface Props {
  roster: Project[]
  modelTakeoffs: WorkbenchState['modelTakeoffs']
  modelOrderLists: WorkbenchState['modelOrderLists']
  setModelTakeoff: (modelK: string, takeoffId: string, done: boolean) => void
  setModelOrderList: (modelK: string, category: string, text: string) => void
}

function TakeoffsView({ roster, modelTakeoffs, modelOrderLists, setModelTakeoff, setModelOrderList }: Props) {
  const [openModel, setOpenModel] = useState<string | null>(null)
  const [addCat, setAddCat] = useState<Record<string, string>>({})

  // Every model we know: the spec table + anything actually in the roster.
  const keys = [...new Set([...Object.keys(MODELS_DEFAULT), ...roster.map((p) => modelKey(p.model))])]
    .filter(Boolean)
    .sort()

  return (
    <div className="takeoffs-view">
      <h2>📐 Model takeoffs</h2>
      <p className="muted">
        Per house model: which takeoffs you've gathered, and the model's material order lists. A model
        missing takeoffs flags every project built from it — and once that project's <b>permit is issued</b>,
        it becomes the top item on Today until handled.
      </p>

      {keys.map((mk) => {
        const got = modelTakeoffs?.[mk] ?? {}
        const missing = TAKEOFF_TYPES.filter((t) => !got[t.id]?.done)
        const lists = modelOrderLists?.[mk] ?? {}
        const inUse = roster.filter((p) => modelKey(p.model) === mk && p.listStatus !== 'CO').length
        const open = openModel === mk
        return (
          <div key={mk} className={'tpl-card' + (open ? ' open' : '')}>
            <button className="tpl-head" onClick={() => setOpenModel(open ? null : mk)}>
              <span className="tpl-name">
                🏠 Model {mk}
                {missing.length > 0 ? (
                  <span className="tko-pill miss">missing {missing.length}</span>
                ) : (
                  <span className="tko-pill ok">✓ complete</span>
                )}
                {inUse > 0 && <span className="muted tko-count">{inUse} active house{inUse === 1 ? '' : 's'}</span>}
              </span>
              <span className="tpl-toggle">{open ? '▾' : '▸'}</span>
            </button>

            {open && (
              <div className="tpl-body">
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
                    <select
                      value={addCat[mk] ?? ''}
                      onChange={(e) => setAddCat({ ...addCat, [mk]: e.target.value })}
                    >
                      <option value="">Add a list for…</option>
                      {ORDER_CATEGORIES.filter((c) => !lists[c]).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <button
                      className="mini"
                      disabled={!addCat[mk]}
                      onClick={() => {
                        setModelOrderList(mk, addCat[mk], `(${mk} ${addCat[mk]} list — paste it here)`)
                        setAddCat({ ...addCat, [mk]: '' })
                      }}
                    >
                      ＋ Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TakeoffsView
