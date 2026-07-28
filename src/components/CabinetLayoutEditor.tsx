/**
 * CabinetLayoutEditor.tsx — the 🧰 FGT cabinet layouts section of a model's
 * 📐 page. Ported from the standalone artifact editor (July 2026) into the
 * blob so layouts sync everywhere like the rest of the model library.
 *
 * How it reads:
 *   - Each RUN (a wall, or an island row) is a to-scale strip of segments.
 *     Click a segment to edit it in the inspector row below the strip.
 *   - The fit chip is the whole point: every run's segments are summed
 *     against its wall length by lib/cabinets.ts — "OVER" means the boxes
 *     physically don't fit (this exact check caught a 36″ fridge speced
 *     into a 35½″ hole on Surf Blvd).
 *   - The BOM table under the runs is derived, never typed: cabinet boxes
 *     only, a corner unit's second appearance (count:false) skipped.
 *
 * Saving: every change calls onChange(nextLayouts) with the WHOLE array —
 * the parent writes it via setModelInfo(mk, { cabinets }) in one setState
 * (copy-on-write over the data/cabinets.ts default; see cabinetLayoutsFor).
 */
import { useState } from 'react'
import type { CabinetLayout, CabinetSegment } from '../types'
import { CABINET_KIND_LABELS, FGT_SKUS, SEGMENT_PRESETS } from '../data/cabinets'
import { effDepth, fmtIn, inferSide, layoutBom, layoutCount, positionsLine, runFit, skuWidth } from '../lib/cabinets'
import CabinetPlanView from './CabinetPlanView'

/** Wall choices for the plan view (where does this run sit in the room?). */
const SIDES: { v: NonNullable<import('../types').CabinetRun['side']>; label: string }[] = [
  { v: 'top', label: 'top wall' },
  { v: 'left', label: 'left wall' },
  { v: 'right', label: 'right wall' },
  { v: 'bottom', label: 'bottom wall' },
  { v: 'island', label: 'island' },
]

interface Props {
  layouts: CabinetLayout[]
  onChange: (next: CabinetLayout[]) => void
  /** Header for the printed installer sheet, e.g. "Model Independence". */
  printTitle?: string
}

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 13)
    : Math.random().toString(36).slice(2, 15)

function CabinetLayoutEditor({ layouts, onChange, printTitle }: Props) {
  // Which segment is open in the inspector (run id + segment id).
  const [sel, setSel] = useState<{ r: string; i: string } | null>(null)

  /** Clone-and-patch helper — every edit flows through here so the parent
   *  always gets a fresh array (never a mutated one; React needs the new ref). */
  const patch = (fn: (draft: CabinetLayout[]) => void) => {
    const draft: CabinetLayout[] = JSON.parse(JSON.stringify(layouts))
    fn(draft)
    onChange(draft)
  }

  const addLayout = () => {
    const name = window.prompt('Layout name (e.g. Kitchen, Master bath):', 'Kitchen')
    if (!name) return
    patch((d) =>
      d.push({
        id: uid(),
        name,
        runs: [
          {
            id: uid(),
            group: 'BASE',
            name: 'Wall 1 — base',
            length: 120,
            items: [{ id: uid(), kind: 'cab', sku: 'B36', width: 36 }],
          },
        ],
      }),
    )
  }

  return (
    <div className="cab-editor">
      <div className="tpl-preview-h">🧰 FGT cabinet layouts</div>
      {layouts.length === 0 && (
        <p className="meta">No cabinet layouts yet — add one and lay out the runs wall by wall.</p>
      )}

      {layouts.map((L, li) => (
        <div key={L.id} className="cab-layout">
          <div className="cab-layout-head">
            <input
              className="cab-name"
              value={L.name}
              onChange={(e) => patch((d) => void (d[li].name = e.target.value))}
              aria-label="Layout name"
            />
            <span className="badge">{layoutCount(L)} cabinets</span>
            <button
              className="mini danger"
              onClick={() => {
                if (window.confirm(`Delete layout “${L.name}”? This can't be undone.`))
                  patch((d) => void d.splice(li, 1))
              }}
            >
              ✕ delete layout
            </button>
          </div>

          {/* The installer's view: top-down plan assembled from the runs
              below (each run's "wall" select places it in the room). */}
          <CabinetPlanView layout={L} printTitle={printTitle ?? 'Cabinet layout'} />

          {L.runs.map((run, ri) => {
            // Wall index (non-island runs before this one, SAME level — uppers
            // count separately from bases, matching the per-sheet counting in
            // CabinetPlanView) so the side select shows what the plan infers
            // when side isn't set yet.
            const isUpper = (g: string) => /upper/i.test(g)
            let wi = 0
            for (const r of L.runs) {
              if (r.id === run.id) break
              if (isUpper(r.group) !== isUpper(run.group)) continue
              if (inferSide(r, wi) !== 'island') wi++
            }
            const side = inferSide(run, wi)
            const fit = runFit(run)
            const chip =
              fit.status === 'fit'
                ? { cls: 'ok', label: 'fits exactly ✓' }
                : fit.status === 'under'
                  ? { cls: 'warn', label: `${fmtIn(-fit.diff)} open` }
                  : { cls: 'over', label: `OVER by ${fmtIn(fit.diff)} — does not fit` }
            const selSeg = sel?.r === run.id ? run.items.find((q) => q.id === sel.i) : undefined
            const selIdx = selSeg ? run.items.findIndex((q) => q.id === selSeg.id) : -1
            const total = Math.max(run.length, fit.sum, 1)

            return (
              <div key={run.id} className="cab-run">
                <div className="cab-run-head">
                  <span className="cab-group">{run.group}</span>
                  <input
                    className="cab-name cab-run-name"
                    value={run.name}
                    onChange={(e) => patch((d) => void (d[li].runs[ri].name = e.target.value))}
                    aria-label="Run name"
                  />
                  <label className="cab-len">
                    wall
                    <input
                      type="number"
                      step={0.125}
                      min={1}
                      value={run.length}
                      onChange={(e) =>
                        patch(
                          (d) =>
                            void (d[li].runs[ri].length = Math.max(
                              1,
                              parseFloat(e.target.value) || run.length,
                            )),
                        )
                      }
                    />
                    in
                  </label>
                  <label className="cab-len">
                    on
                    <select
                      value={side}
                      onChange={(e) =>
                        patch(
                          (d) =>
                            void (d[li].runs[ri].side = e.target
                              .value as (typeof SIDES)[number]['v']),
                        )
                      }
                    >
                      {SIDES.map((s) => (
                        <option key={s.v} value={s.v}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cab-len">
                    deep
                    <input
                      type="number"
                      step={1}
                      min={1}
                      value={effDepth(run)}
                      onChange={(e) =>
                        patch(
                          (d) =>
                            void (d[li].runs[ri].depth = Math.max(
                              1,
                              parseFloat(e.target.value) || effDepth(run),
                            )),
                        )
                      }
                    />
                    in
                  </label>
                  <label className="cab-len" title="The far end of this run butts a return wall (wall-to-wall measurement) — draws it on the plan">
                    <input
                      type="checkbox"
                      checked={!!run.endWall}
                      onChange={(e) =>
                        patch((d) => {
                          if (e.target.checked) d[li].runs[ri].endWall = true
                          else delete d[li].runs[ri].endWall
                        })
                      }
                    />
                    ends at wall
                  </label>
                  <span className={`cab-chip ${chip.cls}`}>{chip.label}</span>
                  <button
                    className="mini danger cab-run-del"
                    onClick={() => {
                      if (window.confirm(`Delete run “${run.name}”?`)) {
                        setSel(null)
                        patch((d) => void d[li].runs.splice(ri, 1))
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* The to-scale strip. flexGrow = inches → widths stay honest. */}
                <div className="cab-strip">
                  {run.items.map((it) => {
                    const w = Number(it.width) || 0
                    return (
                      <button
                        key={it.id}
                        className={
                          'cab-seg k-' +
                          it.kind +
                          (sel?.r === run.id && sel?.i === it.id ? ' selected' : '')
                        }
                        style={{ flexGrow: Math.max(w, 0.5) * 1000 }}
                        title={`${it.sku} · ${fmtIn(w)}${it.note ? ' — ' + it.note : ''}`}
                        onClick={() =>
                          setSel(
                            sel?.r === run.id && sel?.i === it.id
                              ? null
                              : { r: run.id, i: it.id },
                          )
                        }
                      >
                        {w / total > 0.045 && (
                          <>
                            <span className="cab-sku">{it.sku}</span>
                            <span className="cab-w">{fmtIn(w)}</span>
                          </>
                        )}
                      </button>
                    )
                  })}
                  {run.length - fit.sum > 0.01 && (
                    <span
                      className="cab-seg k-openwall"
                      style={{ flexGrow: (run.length - fit.sum) * 1000 }}
                      title={`unfilled: ${fmtIn(run.length - fit.sum)}`}
                    />
                  )}
                </div>
                <div className="cab-pos">{positionsLine(run)}</div>

                {/* Inspector for the selected segment. */}
                {selSeg && selIdx >= 0 && (
                  <div className="cab-inspector">
                    <label>
                      Kind
                      <select
                        value={selSeg.kind}
                        onChange={(e) =>
                          patch((d) => {
                            const it = d[li].runs[ri].items[selIdx]
                            it.kind = e.target.value as CabinetSegment['kind']
                            // BOM-countability follows the kind by default.
                            if (it.kind === 'cab' || it.kind === 'sink' || it.kind === 'corner') {
                              if (it.count === undefined) delete it.count
                            } else it.count = false
                          })
                        }
                      >
                        {Object.entries(CABINET_KIND_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      SKU / label
                      <input
                        list="fgt-skus"
                        value={selSeg.sku}
                        onChange={(e) =>
                          patch((d) => {
                            const it = d[li].runs[ri].items[selIdx]
                            it.sku = e.target.value
                            // FGT codes carry their width — auto-fill, keep editable.
                            const w = skuWidth(it.sku)
                            if (w && it.kind !== 'appl' && it.kind !== 'open' && it.kind !== 'fill')
                              it.width = w
                          })
                        }
                      />
                    </label>
                    <label>
                      Width (in)
                      <input
                        type="number"
                        step={0.125}
                        min={0}
                        value={selSeg.width}
                        onChange={(e) =>
                          patch(
                            (d) =>
                              void (d[li].runs[ri].items[selIdx].width = Math.max(
                                0,
                                parseFloat(e.target.value) || 0,
                              )),
                          )
                        }
                      />
                    </label>
                    <label className="cab-note-f">
                      Note
                      <input
                        value={selSeg.note ?? ''}
                        onChange={(e) =>
                          patch((d) => void (d[li].runs[ri].items[selIdx].note = e.target.value))
                        }
                      />
                    </label>
                    <label className="cab-count">
                      <input
                        type="checkbox"
                        checked={selSeg.count !== false}
                        onChange={(e) =>
                          patch((d) => {
                            const it = d[li].runs[ri].items[selIdx]
                            if (e.target.checked) delete it.count
                            else it.count = false
                          })
                        }
                      />
                      count in BOM
                    </label>
                    <span className="cab-btnrow">
                      <button
                        className="mini"
                        disabled={selIdx === 0}
                        title="Move left"
                        onClick={() =>
                          patch((d) => {
                            const arr = d[li].runs[ri].items
                            ;[arr[selIdx - 1], arr[selIdx]] = [arr[selIdx], arr[selIdx - 1]]
                          })
                        }
                      >
                        ◀
                      </button>
                      <button
                        className="mini"
                        disabled={selIdx === run.items.length - 1}
                        title="Move right"
                        onClick={() =>
                          patch((d) => {
                            const arr = d[li].runs[ri].items
                            ;[arr[selIdx + 1], arr[selIdx]] = [arr[selIdx], arr[selIdx + 1]]
                          })
                        }
                      >
                        ▶
                      </button>
                      <button
                        className="mini"
                        title="Duplicate"
                        onClick={() =>
                          patch((d) => {
                            const arr = d[li].runs[ri].items
                            const c = { ...arr[selIdx], id: uid() }
                            arr.splice(selIdx + 1, 0, c)
                            setSel({ r: run.id, i: c.id })
                          })
                        }
                      >
                        ⧉
                      </button>
                      <button
                        className="mini danger"
                        title="Delete segment"
                        onClick={() => {
                          setSel(null)
                          patch((d) => void d[li].runs[ri].items.splice(selIdx, 1))
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                )}

                <div className="cab-addrow">
                  {Object.entries(SEGMENT_PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      className="mini"
                      onClick={() =>
                        patch((d) => {
                          const it: CabinetSegment = { id: uid(), ...p }
                          d[li].runs[ri].items.push(it)
                          setSel({ r: run.id, i: it.id })
                        })
                      }
                    >
                      ＋ {CABINET_KIND_LABELS[p.kind].toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          <button
            className="mini"
            onClick={() =>
              patch((d) =>
                d[li].runs.push({
                  id: uid(),
                  group: 'RUN',
                  name: 'New run',
                  length: 96,
                  items: [{ id: uid(), kind: 'cab', sku: 'B36', width: 36 }],
                }),
              )
            }
          >
            ＋ Add run
          </button>

          {/* Derived BOM — the order list for FGT. */}
          {layoutBom(L).length > 0 && (
            <div className="cab-bom">
              <div className="tpl-preview-h">Bill of materials (auto)</div>
              <table>
                <tbody>
                  {layoutBom(L).map((line) => (
                    <tr key={line.sku}>
                      <td className="cab-bom-sku">{line.sku}</td>
                      <td className="cab-bom-qty">×{line.qty}</td>
                      <td className="cab-bom-runs">{line.runs.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="meta">
                Boxes only — appliances, openings and fillers excluded; corner units counted once.
                Remember turntable kits (LS33KIT), fillers, panels &amp; toe-kick as extra lines.
              </p>
            </div>
          )}

          <label className="notes-label">
            Layout notes
            <textarea
              rows={2}
              value={L.notes ?? ''}
              onChange={(e) => patch((d) => void (d[li].notes = e.target.value))}
              placeholder="Field dims pending, appliance models, quirks…"
            />
          </label>
        </div>
      ))}

      <button className="mini" onClick={addLayout}>
        ＋ Add cabinet layout
      </button>

      {/* One shared datalist for every SKU input. */}
      <datalist id="fgt-skus">
        {FGT_SKUS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}

export default CabinetLayoutEditor
