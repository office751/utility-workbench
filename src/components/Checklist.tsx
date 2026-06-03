/**
 * Checklist.tsx — ONE checklist renderer for all three streams.
 *
 * This used to live inside Detail.tsx and only knew about electric. Now it
 * takes the step definitions as a prop, so the same component renders the
 * 9-step electric lifecycle, a 4-step well checklist, or the 10-step DEP
 * septic flow — it just draws whatever lifecycles.ts hands it.
 */
import type { ProjectState, Stream } from '../types'
import type { StepDef } from '../data/lifecycles'

interface Props {
  projectId: number
  stream: Stream
  steps: StepDef[] // which steps to show — decided by lifecycles.ts
  ps: ProjectState
  toggleStep: (id: number, stream: Stream, stepId: string, done: boolean) => void
  setStepNote: (id: number, stream: Stream, stepId: string, note: string) => void
}

function Checklist({ projectId, stream, steps, ps, toggleStep, setStepNote }: Props) {
  return (
    <div className="checklist">
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
