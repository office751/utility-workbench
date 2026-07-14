/**
 * ClosingCard.tsx — the SALE workflow, in one card on a project's Overview.
 *
 * Born July 2026 from Adam's ask: "there's a whole other process when a house
 * is put under contract." Everything sale-related that used to hide inside
 * stream tabs now lives here, near the top of the house:
 *   - the closing date + the shut-off countdown (was the Electric tab)
 *   - the closing CHECKLIST (data/lifecycles.ts CLOSING_STEPS, owner-editable
 *     in the ✎ step editor under key 'closing')
 *   - the disconnect actions, inline on the steps they belong to:
 *       'estop' → SECO/Duke stop-service link + phone
 *       'wstop' → MCU form link + pre-addressed disconnect email (municipal
 *                 water only — a private well has nothing to disconnect)
 *   - 'xfer' ("account transferred / shut off") writes ps.transferred via
 *     setClosingStep — the same field the shut-off deadline math reads.
 *
 * The card renders when the house is under contract (or has a closing date
 * from before this card existed). The parent (Detail's Overview) owns that
 * visibility rule and the "Mark under contract" button.
 */
import { useState } from 'react'
import type { Project, ProjectState, TemplateOverride } from '../types'
import { type StepDef, closingSteps, isStepListCustomized } from '../data/lifecycles'
import { closingProgress, closingStepDone, utilityOf, waterSourceOf } from '../lib/nextAction'
import { shutoffFor } from '../lib/shutoff'
import { ELECTRIC_DISCONNECT, MCU_WATER_DISCONNECT, waterDisconnectDraft } from '../data/disconnect'
import { confirmSend } from '../lib/confirmSend'
import StepEditor from './StepEditor'
import Icon from './Icon'

interface Props {
  project: Project
  ps: ProjectState
  setField: <K extends keyof ProjectState>(id: number, field: K, value: ProjectState[K]) => void
  /** ✓/✗ one closing step ('xfer' writes ps.transferred — see useProjects). */
  setClosingStep: (id: number, stepId: string, done: boolean) => void
  templates?: Record<string, TemplateOverride>
  /** Step-editor wiring (the closing list's override key is 'closing'). */
  setStepList: (key: string, steps: StepDef[]) => void
  resetStepList: (key: string) => void
}

function ClosingCard({ project: p, ps, setField, setClosingStep, templates, setStepList, resetStepList }: Props) {
  const steps = closingSteps()
  const { done, total } = closingProgress(ps)
  const shutoff = shutoffFor(ps)
  const [editing, setEditing] = useState(false)
  const [discBusy, setDiscBusy] = useState(false)

  // Which inline actions apply to THIS house (same rules the stream tabs used):
  // stop-service link exists for SECO/Duke only; MCU closeout only when the
  // builder actually holds a municipal water account.
  const u = utilityOf(p, ps)
  const disc = u ? ELECTRIC_DISCONNECT[u] : undefined
  const source = waterSourceOf(p, ps)
  const municipal = source === 'City' || source === 'CityWM'

  /** Open the MCU disconnect-request email (moved from the Water tab). A
   *  mailto can't attach files, so the confirm dialog spells out what to
   *  attach (the completed form + notarized deed) before opening the draft. */
  function draftDisconnect() {
    const draft = waterDisconnectDraft(p, ps, templates)
    if (
      !confirmSend(`Draft the Marion County Utilities disconnect request for ${p.address}?`, [
        "This email can't attach files — attach these to the draft yourself before sending:",
        ...draft.attachments.map((a) => `• ${a}`),
      ])
    )
      return
    setDiscBusy(true)
    window.location.href = draft.mailto
    setTimeout(() => setDiscBusy(false), 1500)
  }

  /** The inline action buttons for a step, or null for ordinary steps. */
  function stepActions(stepId: string) {
    if (stepId === 'estop' && disc) {
      return (
        <span className="cc-actions">
          <a className="contact" href={disc.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <Icon name="bolt" size={14} /> Stop {u} service
          </a>
          {disc.phone && (
            <a className="contact" href={`tel:+1${disc.phone.replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()}>
              <Icon name="call" size={14} /> {disc.phone}
            </a>
          )}
        </span>
      )
    }
    if (stepId === 'wstop' && municipal) {
      return (
        <span className="cc-actions">
          <a className="contact" href={MCU_WATER_DISCONNECT.formUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <Icon name="description" size={14} /> MCU form
          </a>
          <button className="contact" onClick={draftDisconnect} disabled={discBusy}>
            <Icon name={discBusy ? 'hourglass_top' : 'mail'} size={14} />
            {discBusy ? ' Drafting…' : ' Draft MCU email'}
          </button>
        </span>
      )
    }
    return null
  }

  return (
    <div className="closing-card">
      <div className="cc-head">
        <Icon name="sports_score" size={18} color="var(--rust)" />
        <span className="cc-title">Closing — sale workflow</span>
        <span className="cc-progress">
          {done}/{total}
        </span>
        <span className="cc-spacer" />
        <button className="mini" onClick={() => setEditing(true)} title="Add / rename / reorder the closing steps (applies to every house)">
          ✎ Edit steps
        </button>
        {ps.underContract && (
          <button
            className="mini"
            onClick={() => setField(p.id, 'underContract', false)}
            title="Take this house out of the under-contract state (keeps the checklist and dates)"
          >
            ✕ Not under contract
          </button>
        )}
      </div>

      {/* Closing date + the shut-off countdown (2 business days after closing —
          lib/shutoff.ts). Moved here from the Electric tab: it's sale workflow. */}
      <div className="closing">
        <label>
          Closing date
          <input type="date" value={ps.closingDate ?? ''} onChange={(e) => setField(p.id, 'closingDate', e.target.value)} />
        </label>
        {shutoff && (
          <span className={'shutoff' + (shutoff.daysLeft <= 7 ? ' due' : shutoff.daysLeft <= 14 ? ' warn' : '')}>
            <Icon name="schedule" size={14} /> Shut off / transfer electric by <b>{shutoff.date}</b> ({shutoff.daysLeft} days)
          </span>
        )}
      </div>

      {/* The checklist — same row styling as every stream checklist. */}
      <div className="checklist">
        {steps.map((step) => {
          const isDone = closingStepDone(ps, step.id)
          const saved = step.id === 'xfer' ? undefined : ps.closingSteps?.[step.id]
          return (
            <div key={step.id} className={'step' + (isDone ? ' done' : '')}>
              <label className="step-main">
                <input type="checkbox" checked={isDone} onChange={(e) => setClosingStep(p.id, step.id, e.target.checked)} />
                <span className="step-label">{step.label}</span>
                {isDone && saved?.date && <span className="step-date">{saved.date}</span>}
              </label>
              {stepActions(step.id)}
            </div>
          )
        })}
      </div>

      {editing && (
        <StepEditor
          streamLabel="Closing"
          current={steps}
          isCustomized={isStepListCustomized('closing')}
          onSave={(next) => {
            setStepList('closing', next)
            setEditing(false)
          }}
          onReset={() => {
            resetStepList('closing')
            setEditing(false)
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

export default ClosingCard
