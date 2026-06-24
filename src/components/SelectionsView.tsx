/**
 * SelectionsView.tsx — the per-project "Selections" tab.
 *
 * The in-app twin of the printed Client Selections & Finishes form: the
 * homeowner's design choices for one house (Interior + Exterior), an
 * Additional Requests box, and a sign-off that LOCKS everything read-only.
 *
 * Like the other stream bodies (e.g. MaterialsBody), this returns a bare
 * fragment — Detail.tsx supplies the surrounding card, header, and tab strip.
 * It reads its data from `ps.selections` and saves through the updater props
 * threaded down from App (useProjects). The category catalog lives in
 * data/selections.ts, so adding a choice is a config edit, not a code change.
 */
import { useState } from 'react'
import type { Project, ProjectState, SelectionChoice } from '../types'
import { SELECTION_SECTIONS, defaultSelections } from '../data/selections'
import Icon from './Icon'

interface Props {
  project: Project
  ps: ProjectState
  setSelection: (
    id: number,
    area: 'interior' | 'exterior',
    categoryId: string,
    choice: SelectionChoice,
  ) => void
  setAdditionalRequests: (id: number, text: string) => void
  lockSelections: (id: number, signature: string, printedName: string) => void
  unlockSelections: (id: number) => void
}

/** Format an ISO timestamp as a friendly local date+time, blank-safe. */
function whenLocked(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function SelectionsView({
  project: p,
  ps,
  setSelection,
  setAdditionalRequests,
  lockSelections,
  unlockSelections,
}: Props) {
  const sel = ps.selections ?? defaultSelections()
  const locked = sel.lock?.locked ?? false

  // Local inputs for the sign-off line (only used while unlocked).
  const [sig, setSig] = useState('')
  const [printed, setPrinted] = useState('')

  function doLock() {
    if (!sig.trim()) return
    if (
      confirm(
        `Lock these selections for ${p.address}?\n\nThis records ${sig.trim()} as the client's final choices and makes the form read-only. An admin can unlock it later if something needs to change.`,
      )
    ) {
      lockSelections(p.id, sig.trim(), printed.trim())
    }
  }

  function doUnlock() {
    if (confirm('Unlock these selections so they can be edited again?')) {
      unlockSelections(p.id)
    }
  }

  return (
    <>
      <p className="summary">
        <Icon name="checklist" size={15} color="var(--rust)" /> The client's final finish choices for
        this house. Pick a common option or type your own; lock it when they sign off.
      </p>

      {SELECTION_SECTIONS.map((section) => (
        <div className="sel-section" key={section.id}>
          <h3 className="sel-section-title">
            <Icon name={section.icon} size={18} color="var(--rust)" />
            {section.label}
          </h3>
          <div className="sel-rows">
            {section.categories.map((cat) => {
              const choice = sel[section.id][cat.id] ?? {}
              const fieldId = `sel-${section.id}-${cat.id}`
              return (
                <div className="sel-row" key={cat.id}>
                  <label className="sel-label" htmlFor={fieldId}>
                    {cat.label}
                  </label>
                  <div className="sel-controls">
                    {cat.options.length > 0 && (
                      <select
                        id={fieldId}
                        className="sel-select"
                        value={choice.option ?? ''}
                        disabled={locked}
                        onChange={(e) =>
                          setSelection(p.id, section.id, cat.id, {
                            ...choice,
                            option: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">— choose —</option>
                        {cat.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      // when there's no option list this input gets the field id
                      id={cat.options.length === 0 ? fieldId : undefined}
                      className="sel-writein"
                      value={choice.writeIn ?? ''}
                      disabled={locked}
                      placeholder={
                        cat.hint ? `${cat.hint}…` : cat.options.length ? 'Other / notes…' : 'Type choice…'
                      }
                      onChange={(e) =>
                        setSelection(p.id, section.id, cat.id, {
                          ...choice,
                          writeIn: e.target.value || undefined,
                        })
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="sel-section">
        <h3 className="sel-section-title">
          <Icon name="edit_note" size={18} color="var(--rust)" />
          Additional Requests
        </h3>
        <textarea
          className="sel-additional"
          rows={4}
          value={sel.additionalRequests ?? ''}
          disabled={locked}
          placeholder="Anything not listed above — special requests, upgrades, notes. (Subject to builder review; may affect cost or timeline.)"
          onChange={(e) => setAdditionalRequests(p.id, e.target.value)}
        />
      </div>

      {/* ---- Sign-off lock-in ---- */}
      {locked ? (
        <div className="sel-locked-banner">
          <Icon name="lock" size={20} className="sel-locked-icon" fill />
          <span className="sel-locked-meta">
            <b>Selections locked.</b> Signed by {sel.lock?.signature || '—'}
            {sel.lock?.printedName ? ` (${sel.lock.printedName})` : ''}
            {whenLocked(sel.lock?.lockedAt) ? ` on ${whenLocked(sel.lock?.lockedAt)}` : ''}.
          </span>
          <span className="sel-spacer" />
          <button className="btn btn-secondary btn-sm" onClick={doUnlock}>
            <Icon name="lock_open" size={16} />
            Unlock
          </button>
        </div>
      ) : (
        <div className="sel-lock">
          <p className="sel-lock-title">
            <Icon name="draw" size={18} color="var(--rust)" />
            Sign &amp; lock these selections
          </p>
          <div className="sel-lock-fields">
            <label className="sel-lock-field">
              CLIENT SIGNATURE
              <input
                value={sig}
                onChange={(e) => setSig(e.target.value)}
                placeholder="Type full name to sign"
              />
            </label>
            <label className="sel-lock-field">
              PRINTED NAME (OPTIONAL)
              <input
                value={printed}
                onChange={(e) => setPrinted(e.target.value)}
                placeholder="Printed name"
              />
            </label>
            <button className="btn btn-primary" disabled={!sig.trim()} onClick={doLock}>
              <Icon name="lock" size={16} />
              Lock selections
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default SelectionsView
