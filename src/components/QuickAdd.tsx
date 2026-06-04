/**
 * QuickAdd.tsx — capture a "ready to order" in seconds.
 *
 * Paste Josh's text (or type shorthand like "almond slab") and hit Enter.
 * parseQuickAdd figures out the project + item(s); we create "To order"
 * items immediately. If it can't be sure which project, it shows a quick
 * picker instead of guessing. There's an Undo for mis-captures.
 *
 * The whole point: capturing must be FASTER than placing the order.
 */
import { useState } from 'react'
import type { OrderStatus, Project } from '../types'
import { parseQuickAdd } from '../lib/orders'

interface Props {
  projects: Project[]
  addOrder: (id: number, order: { category: string; status: OrderStatus }) => void
}

function QuickAdd({ projects, addOrder }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  // When the project is ambiguous, we stash the parse and show a picker.
  const [pending, setPending] = useState<{ categories: string[]; candidates: Project[] } | null>(null)
  // Last capture, so we can offer Undo.
  const [done, setDone] = useState<{ label: string } | null>(null)

  /** Create one "To order" per category for a project. */
  function commit(project: Project, categories: string[]) {
    for (const category of categories) addOrder(project.id, { category, status: 'toOrder' })
    setDone({ label: `${categories.join(', ')} → ${project.address}` })
    setText('')
    setPending(null)
    setError('')
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    const parse = parseQuickAdd(trimmed, projects)

    if (parse.categories.length === 0) {
      setError("Couldn't spot an item — try a word like “slab”, “trusses”, “cabinets”.")
      return
    }
    // Confident single project → just do it.
    if (parse.confident && parse.matches.length >= 1) {
      commit(parse.matches[0], parse.categories)
      return
    }
    // Otherwise let the user pick (from matches, or all projects if none matched).
    setPending({
      categories: parse.categories,
      candidates: parse.matches.length > 0 ? parse.matches : projects,
    })
    setError('')
  }

  return (
    <div className="quickadd">
      <div className="qa-row">
        <input
          className="qa-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Quick add — paste Josh's text or type e.g. “almond slab”, then Enter"
        />
        <button className="primary" onClick={submit}>
          ＋ Capture
        </button>
      </div>

      {error && <p className="qa-error">{error}</p>}

      {/* Ambiguous project → pick one. Shows the detected item(s). */}
      {pending && (
        <div className="qa-pick">
          <span className="muted">
            Add <b>{pending.categories.join(', ')}</b> to which project?
          </span>
          <div className="qa-cands">
            {pending.candidates.slice(0, 8).map((p) => (
              <button key={p.id} className="mini" onClick={() => commit(p, pending.categories)}>
                {p.address}
              </button>
            ))}
          </div>
          <button className="mini" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Confirmation chip with a jump-to + (the order was already saved). */}
      {done && (
        <p className="qa-done">
          ✓ Captured: {done.label} <span className="muted">— added as “To order”.</span>
        </p>
      )}
    </div>
  )
}

export default QuickAdd
