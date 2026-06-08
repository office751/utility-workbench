/**
 * PermitReviewItems.tsx — the actionable "Portal items" for ONE permit:
 * plan-review rejections/corrections and county holds.
 *
 * These are regular Tasks (so they also live in the ✓ Tasks tab and can drive
 * Today), but LINKED to this permit via `projectId`. You can log one by hand
 * now; once the permit scanner is built, it will auto-fill them straight from
 * the county portal (and de-dupe via each task's `sourceKey`).
 */
import { useState } from 'react'
import type { Task } from '../types'

interface Props {
  projectId: number
  tasks: Task[]
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'done' | 'doneAt'>) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
}

function PermitReviewItems({ projectId, tasks, addTask, updateTask, removeTask }: Props) {
  const [text, setText] = useState('')
  const mine = tasks.filter((t) => t.projectId === projectId)
  const open = mine.filter((t) => !t.done)
  const done = mine.filter((t) => t.done)

  function add() {
    const t = text.trim()
    if (!t) return
    // category 'construction' = the 🏗️ hat; tied to this permit via projectId.
    addTask({ text: t, category: 'construction', projectId })
    setText('')
  }

  return (
    <div className="reviews">
      <div className="docs-head">
        📋 Portal items
        <span className="docs-note">reviews, corrections &amp; holds — auto-filled by the permit scan (coming)</span>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <p className="reviews-empty muted">Nothing flagged yet. Log a rejection or hold below.</p>
      ) : (
        <ul className="review-list">
          {[...open, ...done].map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={!!t.done}
                  onChange={(e) =>
                    updateTask(t.id, {
                      done: e.target.checked,
                      doneAt: e.target.checked ? new Date().toISOString() : undefined,
                    })
                  }
                />
                <span className="review-text">{t.text}</span>
              </label>
              <button className="doc-btn x" title="Remove" onClick={() => removeTask(t.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="review-add">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="Log a rejection, correction, or hold…"
        />
        <button className="mini" onClick={add}>
          ＋ Add
        </button>
      </div>
    </div>
  )
}

export default PermitReviewItems
