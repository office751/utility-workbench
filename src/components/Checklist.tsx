/**
 * Checklist.tsx — ONE checklist renderer for all three streams.
 *
 * This used to live inside Detail.tsx and only knew about electric. Now it
 * takes the step definitions as a prop, so the same component renders the
 * 9-step electric lifecycle, a 4-step well checklist, or the 10-step DEP
 * septic flow — it just draws whatever lifecycles.ts hands it.
 *
 * It also owns the ⏩ CATCH-UP row: many houses predate the app, so their
 * boxes were never ticked even though the work happened. Whenever a LATER
 * step is checked while EARLIER ones aren't (decided by lib/catchup.ts),
 * a quiet one-liner offers to tick the earlier ones in one click — with an
 * Undo. That includes the moment you check "Power ON" on a house that's
 * been finished for a year: the row appears right away.
 */
import { useState } from 'react'
import type { ProjectState, Stream } from '../types'
import type { StepDef } from '../data/lifecycles'
import { catchUpPlan } from '../lib/catchup'
import Icon from './Icon'

interface Props {
  projectId: number
  stream: Stream
  steps: StepDef[] // which steps to show — decided by lifecycles.ts
  ps: ProjectState
  toggleStep: (id: number, stream: Stream, stepId: string, done: boolean) => void
  setStepNote: (id: number, stream: Stream, stepId: string, note: string) => void
  /** Batch writer for the catch-up row (useProjects) — done=false is the undo. */
  catchUpSteps: (id: number, stream: Stream, stepIds: string[], done: boolean) => void
}

function Checklist({ projectId, stream, steps, ps, toggleStep, setStepNote, catchUpSteps }: Props) {
  // The last catch-up this component performed, so it can be undone. Tagged
  // with project+stream because React REUSES this component instance when you
  // switch houses or tabs (same position in the tree) — an undo must never
  // fire against a different checklist than the one it came from.
  const [caughtUp, setCaughtUp] = useState<{
    projectId: number
    stream: Stream
    stepIds: string[]
  } | null>(null)

  const plan = catchUpPlan(steps, ps.steps[stream], stream)
  const undoable =
    caughtUp && caughtUp.projectId === projectId && caughtUp.stream === stream ? caughtUp : null

  function doCatchUp() {
    if (!plan) return
    const ids = plan.targets.map((s) => s.id)
    catchUpSteps(projectId, stream, ids, true)
    setCaughtUp({ projectId, stream, stepIds: ids })
  }

  function undoCatchUp() {
    if (!undoable) return
    catchUpSteps(projectId, stream, undoable.stepIds, false)
    setCaughtUp(null)
  }

  return (
    <div className="checklist">
      {plan && (
        <div className="catchup">
          <Icon name="history" size={14} />
          <span className="catchup-text">
            {plan.targets.length === 1
              ? 'An earlier step is'
              : `${plan.targets.length} earlier steps are`}{' '}
            still unchecked before “{plan.anchor.label}”.
          </span>
          <button className="catchup-btn" onClick={doCatchUp}>
            {plan.targets.length === 1 ? 'Mark it done' : `Mark all ${plan.targets.length} done`}
          </button>
        </div>
      )}
      {undoable && !plan && (
        <div className="catchup caught">
          <Icon name="check_circle" size={14} />
          <span className="catchup-text">
            Caught up — {undoable.stepIds.length} earlier step
            {undoable.stepIds.length === 1 ? '' : 's'} marked done (dated “(caught up)”).
          </span>
          <button className="catchup-btn" onClick={undoCatchUp}>
            Undo
          </button>
        </div>
      )}
      {steps.map((step) => {
        const st = ps.steps[stream][step.id] // saved state, may be undefined
        return (
          <div key={step.id} className={'step' + (st?.done ? ' done' : '')}>
            <label className="step-main">
              <input
                type="checkbox"
                checked={st?.done ?? false}
                onChange={(e) => toggleStep(projectId, stream, step.id, e.target.checked)}
              />
              <span className="step-label">{step.label}</span>
              {st?.done && st.date && <span className="step-date">{st.date}</span>}
            </label>
            <input
              className="step-note"
              value={st?.note ?? ''}
              onChange={(e) => setStepNote(projectId, stream, step.id, e.target.value)}
              placeholder="note…"
            />
          </div>
        )
      })}
    </div>
  )
}

export default Checklist
