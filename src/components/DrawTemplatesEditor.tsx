/**
 * DrawTemplatesEditor.tsx — 🛠 Settings → Draw schedule templates.
 *
 * Owner-editable draw-schedule templates (💵 Draws tab). Each lender/contract
 * style gets one template: its stages, default amounts, and the checklist of
 * what must be done (and attached as proof) before each draw is requested.
 * Starting draw tracking on a house COPIES a template — so editing one here
 * changes future houses only, never a contract already in flight.
 *
 * Same working-copy/save pattern as VendorsEditor: edits are local + instant,
 * "Save changes" commits the whole list to the cloud blob in one shot.
 */
import { useState } from 'react'
import type { DrawTemplate } from '../data/drawTemplates'
import Icon from './Icon'

const newId = (prefix: string) => `${prefix}-` + (crypto.randomUUID?.() ?? `${performance.now()}`)
const clone = (t: DrawTemplate[]): DrawTemplate[] => JSON.parse(JSON.stringify(t))

interface Props {
  drawTemplates: DrawTemplate[]
  onSave: (drawTemplates: DrawTemplate[]) => void
}

function DrawTemplatesEditor({ drawTemplates, onSave }: Props) {
  const [work, setWork] = useState<DrawTemplate[]>(() => clone(drawTemplates))
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  /** Apply an immutable edit to the working copy. */
  function mutate(fn: (list: DrawTemplate[]) => void) {
    setWork((prev) => {
      const next = clone(prev)
      fn(next)
      return next
    })
    setDirty(true)
    setSaved(false)
  }

  const patch = (i: number, p: Partial<DrawTemplate>) => mutate((list) => Object.assign(list[i], p))
  const remove = (i: number) => mutate((list) => list.splice(i, 1))
  const add = () =>
    mutate((list) =>
      list.push({ id: newId('dt'), name: '', stages: [{ id: newId('st'), label: '1st Draw', items: [] }] }),
    )

  function save() {
    onSave(work)
    setDirty(false)
    setSaved(true)
  }

  return (
    <section className="vend-editor">
      <div className="vend-editor-head">
        <h2>💵 Draw schedule templates</h2>
        <div className="vend-editor-actions">
          {saved && <span className="selcat-saved">Saved ✓</span>}
          <button className="mini primary" onClick={save} disabled={!dirty}>
            Save changes
          </button>
        </div>
      </div>
      <p className="muted">
        One template per lender/contract style. Starting draw tracking on a house COPIES a template onto that
        house — so edits here shape future houses; contracts already in flight keep their own schedule.
        Checklist items go one per line.
      </p>

      {work.map((t, i) => (
        <div key={t.id} className="vend-card">
          <div className="vend-row">
            <label className="vend-f vend-grow">
              Template name
              <input value={t.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Numbered draws — spec home" />
            </label>
            <button
              className="team-x vend-del"
              title="Remove template"
              aria-label={`Remove ${t.name || 'template'}`}
              onClick={() => remove(i)}
            >
              <Icon name="delete" size={16} />
            </button>
          </div>
          <div className="vend-row">
            <label className="vend-f vend-grow">
              Default lender (optional)
              <input value={t.lender ?? ''} onChange={(e) => patch(i, { lender: e.target.value || undefined })} placeholder="FACO Lending" />
            </label>
            <label className="vend-f vend-grow">
              Default lender email (optional)
              <input value={t.email ?? ''} onChange={(e) => patch(i, { email: e.target.value || undefined })} placeholder="draws@lender.com" />
            </label>
          </div>
          <div className="vend-row">
            <label className="vend-f vend-grow">
              One-line description (shown in the picker)
              <input value={t.description ?? ''} onChange={(e) => patch(i, { description: e.target.value || undefined })} />
            </label>
          </div>

          {/* ---- the stages ---- */}
          {t.stages.map((s, j) => (
            <div key={s.id} className="fin-tpl-stage">
              <div className="vend-row">
                <label className="vend-f vend-grow">
                  Draw {j + 1} — name
                  <input
                    value={s.label}
                    onChange={(e) => mutate((list) => void (list[i].stages[j].label = e.target.value))}
                    placeholder="Completion of Dry In"
                  />
                </label>
                <label className="vend-f">
                  Amount hint
                  <input
                    value={s.amount ?? ''}
                    onChange={(e) => mutate((list) => void (list[i].stages[j].amount = e.target.value || undefined))}
                    placeholder="$45,000 or 10%"
                  />
                </label>
                <button
                  className="team-x vend-del"
                  title="Remove this draw"
                  aria-label={`Remove ${s.label || 'draw'}`}
                  onClick={() => mutate((list) => void list[i].stages.splice(j, 1))}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <label className="vend-f fin-tpl-items">
                Checklist — done (and attached as proof) before requesting, one per line
                <textarea
                  rows={Math.max(2, s.items.length + 1)}
                  value={s.items.join('\n')}
                  onChange={(e) =>
                    mutate((list) => void (list[i].stages[j].items = e.target.value.split('\n').map((x) => x.trimEnd())))
                  }
                  onBlur={() => mutate((list) => void (list[i].stages[j].items = list[i].stages[j].items.map((x) => x.trim()).filter(Boolean)))}
                  placeholder={'Framing inspection passed\nLintel approval (attach it)'}
                />
              </label>
            </div>
          ))}
          <button
            className="mini"
            onClick={() => mutate((list) => void list[i].stages.push({ id: newId('st'), label: '', items: [] }))}
          >
            ＋ Add draw
          </button>
        </div>
      ))}

      <button className="mini" onClick={add}>
        ＋ Add template
      </button>
    </section>
  )
}

export default DrawTemplatesEditor
