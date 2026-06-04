/**
 * TasksView.tsx — the "✓ Tasks" tab: capture + manage your whole plate.
 *
 * This is the non-construction side of the command center. You type in
 * anything (IT, office, a supply order, research), tag it with a hat + an
 * optional company / due date / who's-waiting-on-you, and optionally ⭐ it as
 * Today's Focus. Open tasks group by hat; completed ones tuck away at the
 * bottom. The Today screen reads from the same list.
 */
import { useState } from 'react'
import type { Task } from '../types'
import { HATS, hatOf } from '../data/hats'
import { dueLabel, openTasks, parseTaskLines, tasksByHat } from '../lib/tasks'

interface Props {
  tasks: Task[]
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'done' | 'doneAt'>) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
}

/** One task line — checkbox to complete, star to focus, chips, delete. */
function TaskRow({
  t,
  updateTask,
  removeTask,
}: {
  t: Task
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
}) {
  const due = dueLabel(t)
  const overdue = !t.done && t.dueDate ? new Date(t.dueDate + 'T00:00:00').getTime() < Date.now() : false
  return (
    <div className={'task-row' + (t.done ? ' done' : '')}>
      <input
        type="checkbox"
        checked={!!t.done}
        title="Mark done"
        onChange={(e) =>
          updateTask(t.id, e.target.checked ? { done: true, doneAt: new Date().toISOString() } : { done: false, doneAt: undefined })
        }
      />
      <button
        className={'task-star' + (t.focus ? ' on' : '')}
        title="Star as Today's Focus"
        onClick={() => updateTask(t.id, { focus: !t.focus })}
      >
        {t.focus ? '⭐' : '☆'}
      </button>
      <span className="task-text">{t.text}</span>
      {t.company && <span className="badge">{t.company}</span>}
      {t.waitingOn && <span className="badge warn">⏳ {t.waitingOn}</span>}
      {due && <span className={'task-due' + (overdue ? ' due' : '')}>{due}</span>}
      <button className="task-x" title="Delete" onClick={() => removeTask(t.id)}>
        ✕
      </button>
    </div>
  )
}

function TasksView({ tasks, addTask, updateTask, removeTask }: Props) {
  // Capture-form state (local to this view).
  const [text, setText] = useState('')
  const [category, setCategory] = useState('it')
  const [company, setCompany] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [waitingOn, setWaitingOn] = useState('')
  const [focus, setFocus] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteResult, setPasteResult] = useState('')

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    addTask({
      text: trimmed,
      category,
      company: company.trim() || undefined,
      dueDate: dueDate || undefined,
      waitingOn: waitingOn.trim() || undefined,
      focus,
    })
    // Reset the row, but KEEP the hat — you often add several of the same kind.
    setText('')
    setCompany('')
    setDueDate('')
    setWaitingOn('')
    setFocus(false)
  }

  /** Bulk-add tasks pasted from the scan script, skipping any already on the list. */
  function importPaste() {
    const parsed = parseTaskLines(pasteText)
    const existing = new Set(tasks.filter((t) => !t.done).map((t) => t.text.trim().toLowerCase()))
    let added = 0
    let skipped = 0
    for (const p of parsed) {
      const key = p.text.trim().toLowerCase()
      if (existing.has(key)) {
        skipped++
        continue
      }
      existing.add(key)
      addTask(p)
      added++
    }
    setPasteResult(
      added === 0 && skipped === 0
        ? 'Nothing parsed — paste the script’s Tasks lines, one per line.'
        : `Added ${added} task${added !== 1 ? 's' : ''}${skipped ? `, skipped ${skipped} already on your list` : ''}.`,
    )
    if (added > 0) setPasteText('')
  }

  const groups = tasksByHat(tasks)
  const done = tasks.filter((t) => t.done)

  return (
    <section className="detail tasks-view">
      <h2>✓ Tasks</h2>
      <p className="meta">
        Everything on your plate that isn't a project step — IT, office, supplies, research. Star a few
        as ⭐ and they become your Today's Focus.
      </p>

      {/* capture bar */}
      <div className="task-add">
        <input
          className="ta-text"
          placeholder="What needs doing?  (e.g. Research worksite cameras for IronShield)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <div className="ta-fields">
          <label>
            Hat
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {HATS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.icon} {h.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Company
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="optional" />
          </label>
          <label>
            Due
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label>
            Waiting on you
            <input value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} placeholder="who? (optional)" />
          </label>
          <label className="ta-focus">
            <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} />⭐ Focus today
          </label>
          <button className="primary" onClick={submit} disabled={!text.trim()}>
            Add task
          </button>
        </div>
      </div>

      {/* paste-import from the text-scan script */}
      <div className="task-paste">
        <button className="mini" onClick={() => setShowPaste((s) => !s)}>
          {showPaste ? '▾' : '▸'} 📥 Paste from a text scan
        </button>
        {showPaste && (
          <div className="tp-body">
            <p className="meta">
              Run <code>node scripts/read-josh-orders.mjs</code>, copy its <strong>Tasks</strong> block, and
              paste below — one task per line. Trim any you don’t want first.
            </p>
            <textarea
              className="tp-text"
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'Email Dylan our five houses for flooring | waiting:Mickey | due:today | hat:office'}
            />
            <div className="tp-actions">
              <button className="primary" onClick={importPaste} disabled={!pasteText.trim()}>
                Add tasks
              </button>
              {pasteResult && <span className="qa-done">{pasteResult}</span>}
            </div>
          </div>
        )}
      </div>

      {/* open tasks, grouped by hat */}
      {openTasks(tasks).length === 0 && (
        <p className="muted pad">No open tasks — capture one above and get it out of your head.</p>
      )}
      {[...groups.entries()].map(([hatId, items]) => {
        const hat = hatOf(hatId)
        return (
          <div className="card" key={hatId}>
            <h3>
              {hat.icon} {hat.label} ({items.length})
            </h3>
            <div className="task-list">
              {items.map((t) => (
                <TaskRow key={t.id} t={t} updateTask={updateTask} removeTask={removeTask} />
              ))}
            </div>
          </div>
        )
      })}

      {/* completed, tucked away */}
      {done.length > 0 && (
        <div className="done-block">
          <button className="mini" onClick={() => setShowDone((s) => !s)}>
            {showDone ? '▾' : '▸'} Completed ({done.length})
          </button>
          {showDone && (
            <div className="task-list">
              {done.map((t) => (
                <TaskRow key={t.id} t={t} updateTask={updateTask} removeTask={removeTask} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default TasksView
