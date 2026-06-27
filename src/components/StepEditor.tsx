/**
 * StepEditor.tsx — edit the STANDARD checklist for one workstream (global).
 *
 * Opened from a stream tab in Detail. Lets the owner add / remove / rename /
 * reorder the steps for that stream's checklist. Edits are stored as an
 * override in saved state (keyed by the resolved list key) and apply to EVERY
 * house — so renaming e.g. "System installed" → "Installing system" also fixes
 * the wording the investor sees (their status line is built from these labels).
 *
 * Existing steps keep their id (so checked-off progress survives a rename);
 * new steps get a fresh id and start unchecked.
 */
import { useState } from 'react'
import type { StepDef } from '../data/lifecycles'
import Icon from './Icon'

interface Props {
  /** Human label for the stream being edited, e.g. "Septic". */
  streamLabel: string
  /** The currently-effective steps (override if any, else the default). */
  current: StepDef[]
  /** Whether an override is in effect (enables "Reset to default"). */
  isCustomized: boolean
  onSave: (steps: StepDef[]) => void
  onReset: () => void
  onClose: () => void
}

interface Row {
  id: string
  label: string
  wmOnly?: boolean
}

// Full UUID (not sliced) so custom-step ids never collide across the global,
// all-houses step namespace. Fallback covers the rare no-crypto environment.
const newId = () => 'c-' + (crypto.randomUUID?.() ?? `${performance.now()}-${Math.round(performance.now() * 1000)}`)

function StepEditor({ streamLabel, current, isCustomized, onSave, onReset, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() => current.map((s) => ({ id: s.id, label: s.label, wmOnly: s.wmOnly })))

  const patch = (i: number, label: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, label } : row)))
  const remove = (i: number) => setRows((r) => r.filter((_, j) => j !== i))
  const add = () => setRows((r) => [...r, { id: newId(), label: '' }])
  const move = (i: number, dir: -1 | 1) =>
    setRows((r) => {
      const j = i + dir
      if (j < 0 || j >= r.length) return r
      const copy = [...r]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  function save() {
    // Drop blank rows; keep ids stable so progress survives.
    const cleaned = rows.map((r) => ({ ...r, label: r.label.trim() })).filter((r) => r.label)
    onSave(cleaned.map((r) => (r.wmOnly ? { id: r.id, label: r.label, wmOnly: true } : { id: r.id, label: r.label })))
    onClose()
  }

  return (
    <div className="step-editor">
      <div className="se-head">
        <Icon name="edit" size={16} color="var(--rust)" />
        <span className="se-title">Edit the standard {streamLabel} checklist</span>
        <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close editor">
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="se-note">
        Applies to <b>every house</b>. Renaming a step also updates what investors see for that stream.
      </p>

      <div className="se-rows">
        {rows.map((row, i) => (
          <div className="se-row" key={row.id}>
            <div className="se-reorder">
              <button className="se-move" disabled={i === 0} onClick={() => move(i, -1)} title="Move up" aria-label="Move step up">
                <Icon name="keyboard_arrow_up" size={16} />
              </button>
              <button className="se-move" disabled={i === rows.length - 1} onClick={() => move(i, 1)} title="Move down" aria-label="Move step down">
                <Icon name="keyboard_arrow_down" size={16} />
              </button>
            </div>
            <input
              className="se-input"
              value={row.label}
              placeholder="Step description…"
              onChange={(e) => patch(i, e.target.value)}
            />
            <button className="se-del" onClick={() => remove(i)} title="Remove step" aria-label="Remove step">
              <Icon name="delete" size={16} />
            </button>
          </div>
        ))}
      </div>

      <button className="se-add" onClick={add}>
        <Icon name="add" size={16} /> Add step
      </button>

      <div className="se-actions">
        <button className="btn btn-primary btn-sm" onClick={save}>
          Save checklist
        </button>
        {isCustomized && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (confirm(`Reset the ${streamLabel} checklist to the built-in default? Your custom steps will be removed.`)) {
                onReset()
                onClose()
              }
            }}
          >
            Reset to default
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default StepEditor
