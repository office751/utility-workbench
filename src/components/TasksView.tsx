/**
 * TasksView.tsx — the "Tasks" tab: capture + manage your whole plate.
 *
 * Calm Canvas "B & C mix" (Claude Design):
 *   - Starred tasks float up into a rust-accented "Today's Focus" card (C).
 *   - Each hat's heading sits OUTSIDE its list, with the rows in an inset card (B).
 *   - Completed tasks tuck into a collapsed disclosure at the bottom.
 *
 * This is the non-construction side of the command center. You type in anything
 * (IT, office, a supply order, research), tag it with a hat + optional company /
 * due date / who's-waiting-on-you, and optionally star it as Today's Focus.
 */
import { useState } from 'react'
import type { Task } from '../types'
import { HATS, hatOf } from '../data/hats'
import { dueLabel, openTasks, parseTaskLines, tasksByHat } from '../lib/tasks'
import Icon from './Icon'

/** One task line — checkbox to complete, star to focus, chips, delete.
 *  `showHat` adds the hat chip (used in the Today's Focus card, where rows
 *  are mixed across hats). */
function TaskRow({
  t,
  updateTask,
  removeTask,
  showHat = false,
}: {
  t: Task
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
  showHat?: boolean
}) {
  const due = dueLabel(t)
  const overdue = !t.done && t.dueDate ? new Date(t.dueDate + 'T00:00:00').getTime() < Date.now() : false
  const hat = hatOf(t.category)
  return (
    <div className={'trow' + (t.done ? ' done' : '')}>
      <button
        className={'trow-check' + (t.done ? ' on' : '')}
        title="Mark done"
        onClick={() =>
          updateTask(t.id, t.done ? { done: false, doneAt: undefined } : { done: true, doneAt: new Date().toISOString() })
        }
      >
        {t.done && <Icon name="check" size={13} color="#fff" />}
      </button>
      <button className="trow-star" title="Star as Today's Focus" onClick={() => updateTask(t.id, { focus: !t.focus })}>
        <Icon name="star" size={17} color={t.focus ? 'var(--gold)' : 'var(--ink-3)'} fill={t.focus} />
      </button>
      <span className="trow-text">{t.text}</span>
      {showHat && (
        <span className="trow-chip">
          <Icon name={hat.mi} size={13} />
          {hat.label}
        </span>
      )}
      {t.company && <span className="trow-chip">{t.company}</span>}
      {t.waitingOn && (
        <span className="trow-chip">
          <Icon name="hourglass_top" size={13} />
          {t.waitingOn}
        </span>
      )}
      {due && <span className={'trow-due' + (overdue ? ' over' : '')}>{due}</span>}
      <button className="trow-x" title="Delete" onClick={() => removeTask(t.id)}>
        <Icon name="close" size={15} />
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
  const [showAdd, setShowAdd] = useState(false) // capture bar hidden until you click ＋
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
  const starred = tasks.filter((t) => t.focus && !t.done)
  const done = tasks.filter((t) => t.done)

  return (
    <section className="tasks-view tasks-stack">
      {/* Title */}
      <div className="tasks-head">
        <h1>
          <Icon name="task_alt" size={24} color="var(--ink)" />
          Tasks
        </h1>
        <p className="tasks-intro">
          Everything on your plate that isn't a project step — IT, office, supplies, research. Star a few as{' '}
          <Icon name="star" size={15} color="var(--gold)" fill style={{ verticalAlign: '-2px', margin: '0 2px' }} /> and
          they become your Today's Focus.
        </p>
      </div>

      {/* Toolbar — two buttons keep this page clean; each reveals its panel. */}
      <div className="tasks-toolbar">
        <button className={'btn btn-primary' + (showAdd ? ' on' : '')} onClick={() => setShowAdd((s) => !s)}>
          <Icon name="add" size={18} />
          Add a task
        </button>
        <button className={'btn btn-secondary' + (showPaste ? ' on' : '')} onClick={() => setShowPaste((s) => !s)}>
          <Icon name="content_paste" size={18} />
          Paste from a text scan
        </button>
      </div>

      {/* capture bar — hidden until "Add a task" is clicked */}
      {showAdd && (
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
                    {h.label}
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
              <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} />
              Focus today
            </label>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={!text.trim()}>
              Add task
            </button>
          </div>
        </div>
      )}

      {/* paste-import from the text-scan script */}
      {showPaste && (
        <div className="task-paste tp-body">
          <p className="meta">
            Run <code>node scripts/read-josh-orders.mjs</code>, copy its <strong>Tasks</strong> block, and paste below
            — one task per line. Trim any you don’t want first.
          </p>
          <textarea
            className="tp-text"
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Email Dylan our five houses for flooring | waiting:Mickey | due:today | hat:office'}
          />
          <div className="tp-actions">
            <button className="btn btn-primary btn-sm" onClick={importPaste} disabled={!pasteText.trim()}>
              Add tasks
            </button>
            {pasteResult && <span className="qa-done">{pasteResult}</span>}
          </div>
        </div>
      )}

      {/* empty state */}
      {openTasks(tasks).length === 0 && (
        <p className="tasks-empty">No open tasks — capture one above and get it out of your head.</p>
      )}

      {/* Today's Focus (C) — starred tasks float to the top */}
      {starred.length > 0 && (
        <div className="tcard accent">
          <div className="tfocus-head">
            <Icon name="star" size={18} color="var(--gold)" fill />
            <span className="tfocus-title">Today's Focus</span>
            <span className="tg-count">{starred.length}</span>
          </div>
          {starred.map((t) => (
            <TaskRow key={t.id} t={t} updateTask={updateTask} removeTask={removeTask} showHat />
          ))}
        </div>
      )}

      {/* Hat groups (B) — heading outside, rows in an inset card */}
      {[...groups.entries()].map(([hatId, items]) => {
        const hat = hatOf(hatId)
        return (
          <section className="tg-section" key={hatId}>
            <div className="tg-head">
              <Icon name={hat.mi} size={18} color="var(--rust)" />
              <span className="tg-label">{hat.label}</span>
              <span className="tg-count">{items.length}</span>
            </div>
            <div className="tcard">
              {items.map((t) => (
                <TaskRow key={t.id} t={t} updateTask={updateTask} removeTask={removeTask} />
              ))}
            </div>
          </section>
        )
      })}

      {/* completed, tucked away */}
      {done.length > 0 && (
        <div>
          <button className="tdone-btn" onClick={() => setShowDone((s) => !s)}>
            <Icon name={showDone ? 'expand_less' : 'expand_more'} size={17} color="var(--ink-3)" />
            Completed ({done.length})
          </button>
          {showDone && (
            <div className="tcard" style={{ marginTop: 10 }}>
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

interface Props {
  tasks: Task[]
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'done' | 'doneAt'>) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
}

export default TasksView
