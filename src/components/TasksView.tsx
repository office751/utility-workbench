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
import { assigneesInUse, dueLabel, isUnassigned, openTasks, parseTaskLines, sameName, tasksByHat } from '../lib/tasks'
import Icon from './Icon'

/** One task line — checkbox to complete, star to focus, chips, delete.
 *  `showHat` adds the hat chip (used in the Today's Focus card, where rows
 *  are mixed across hats). */
function TaskRow({
  t,
  updateTask,
  removeTask,
  showHat = false,
  me = '',
  assigneeOptions = [],
}: {
  t: Task
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
  showHat?: boolean
  /** Logged-in name (marks "(me)" in the assignee picker). */
  me?: string
  /** Names offered in the per-row "assign to" picker (you + the team + names in use). */
  assigneeOptions?: string[]
}) {
  const due = dueLabel(t)
  const overdue = !t.done && t.dueDate ? new Date(t.dueDate + 'T00:00:00').getTime() < Date.now() : false
  const hat = hatOf(t.category)

  // `draft` holds the in-progress edit, separate from `t` (the saved task).
  // Typing in the edit inputs only updates this local draft — nothing is
  // written back via updateTask until Save is clicked, so Cancel can just
  // throw the draft away and the real task is untouched the whole time.
  // editing === (draft !== null).
  const [draft, setDraft] = useState<Partial<Task> | null>(null)

  function startEdit() {
    setDraft({ text: t.text, category: t.category, company: t.company ?? '', dueDate: t.dueDate ?? '', waitingOn: t.waitingOn ?? '' })
  }

  function save() {
    if (!draft || !(draft.text ?? '').trim()) return
    updateTask(t.id, {
      text: (draft.text ?? '').trim(),
      category: draft.category,
      company: (draft.company ?? '').trim() || undefined,
      dueDate: draft.dueDate || undefined,
      waitingOn: (draft.waitingOn ?? '').trim() || undefined,
    })
    setDraft(null)
  }

  function cancel() {
    setDraft(null)
  }

  return (
    <div className={'trow' + (t.done ? ' done' : '')}>
      {/* Icon-only buttons: aria-label gives screen readers a real name (the
          title tooltip alone isn't reliably announced) and aria-pressed tells
          them the on/off state the icon shows sighted users. */}
      <button
        className={'trow-check' + (t.done ? ' on' : '')}
        title={t.done ? 'Mark not done' : 'Mark done'}
        aria-label={t.done ? 'Mark not done' : 'Mark done'}
        aria-pressed={t.done}
        onClick={() =>
          updateTask(t.id, t.done ? { done: false, doneAt: undefined } : { done: true, doneAt: new Date().toISOString() })
        }
      >
        {t.done && <Icon name="check" size={13} color="#fff" />}
      </button>
      <button
        className="trow-star"
        title="Star as Today's Focus"
        aria-label="Star as Today's Focus"
        aria-pressed={Boolean(t.focus)}
        onClick={() => updateTask(t.id, { focus: !t.focus })}
      >
        <Icon name="star" size={17} color={t.focus ? 'var(--gold)' : 'var(--ink-3)'} fill={t.focus} />
      </button>
      {draft === null ? (
        <>
          <span className="trow-text">{t.text}</span>
          {showHat && (
            <span className="trow-chip">
              <Icon name={hat.mi} size={13} />
              {hat.label}
            </span>
          )}
          {t.company && <span className="trow-chip">{t.company}</span>}
          {t.waitingOn && (
            <span className="trow-chip" title={`${t.waitingOn} is waiting on you to act`}>
              <Icon name="hourglass_top" size={13} />
              {t.waitingOn}
            </span>
          )}
        </>
      ) : (
        <span className="trow-edit">
          <input
            className="ta-text trow-edit-text"
            value={draft.text ?? ''}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') cancel()
            }}
            autoFocus
          />
          <select value={draft.category ?? ''} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {HATS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
          <input
            value={draft.company ?? ''}
            placeholder="Company (optional)"
            onChange={(e) => setDraft({ ...draft, company: e.target.value })}
          />
          <input type="date" value={draft.dueDate ?? ''} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
          <input
            value={draft.waitingOn ?? ''}
            placeholder="Who's waiting? (optional)"
            onChange={(e) => setDraft({ ...draft, waitingOn: e.target.value })}
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!(draft.text ?? '').trim()}>
            Save
          </button>
          <button className="btn btn-secondary btn-sm" onClick={cancel}>
            Cancel
          </button>
        </span>
      )}
      {/* Who owns this to-do. Blank = Unassigned (shared pile, shows for everyone). */}
      <select
        className={'trow-assign' + (isUnassigned(t) ? ' unassigned' : '')}
        title="Assign to"
        value={t.assignedTo ?? ''}
        onChange={(e) => updateTask(t.id, { assignedTo: e.target.value || undefined })}
      >
        <option value="">Unassigned</option>
        {assigneeOptions.map((n) => (
          <option key={n} value={n}>
            {sameName(n, me) ? `${n} (me)` : n}
          </option>
        ))}
      </select>
      {due && <span className={'trow-due' + (overdue ? ' over' : '')}>{due}</span>}
      {draft === null && (
        <button className="trow-edit-btn" title="Edit task" aria-label="Edit task" onClick={startEdit}>
          <Icon name="edit" size={15} />
        </button>
      )}
      <button className="trow-x" title="Delete" aria-label="Delete task" onClick={() => removeTask(t.id)}>
        <Icon name="close" size={15} />
      </button>
    </div>
  )
}

function TasksView({ tasks, addTask, updateTask, removeTask, me = '', assignees = [] }: Props) {
  // Capture-form state (local to this view).
  const [text, setText] = useState('')
  const [category, setCategory] = useState('it')
  const [company, setCompany] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [waitingOn, setWaitingOn] = useState('')
  const [assignTo, setAssignTo] = useState(me) // new tasks default to you; '' = Unassigned
  const [focus, setFocus] = useState(false)
  // Which queue is shown. 'mine' = your queue (yours + the shared/unassigned
  // pile); 'unassigned' = just the shared pile; 'all' = everyone; or a name.
  const [view, setView] = useState<string>(me ? 'mine' : 'all')
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
      assignedTo: assignTo.trim() || undefined,
      focus,
    })
    // Reset the row, but KEEP the hat + assignee — you often add several of the
    // same kind, or several for the same person.
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

  // Assignee picker options = you + the team + any names already on tasks (deduped,
  // case-insensitive). Falls back gracefully when the team list couldn't load.
  const assigneeOptions: string[] = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const n of [me, ...assignees, ...assigneesInUse(tasks)]) {
      const name = (n ?? '').trim()
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase())
        out.push(name)
      }
    }
    return out
  })()
  const others = assigneeOptions.filter((n) => !sameName(n, me)) // for per-person filter chips

  // Which tasks this view shows. "My queue" is fail-open (yours + unassigned) so
  // the shared pile is never out of sight; the other filters are exact.
  function inView(t: Task): boolean {
    if (view === 'all') return true
    if (view === 'mine') return isUnassigned(t) || sameName(t.assignedTo, me)
    if (view === 'unassigned') return isUnassigned(t)
    return sameName(t.assignedTo, view)
  }
  const shown = tasks.filter(inView)

  const groups = tasksByHat(shown)
  const starred = shown.filter((t) => t.focus && !t.done)
  const done = shown.filter((t) => t.done)
  const unassignedCount = openTasks(tasks).filter(isUnassigned).length

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

      {/* Whose queue — only shown once we know who you are (a real login). "My
          queue" is fail-open (yours + the shared/unassigned pile); the rest are exact. */}
      {me && (
        <div className="tasks-filter">
          <span className="tf-label">Show</span>
          <button className={'btn btn-secondary btn-sm' + (view === 'mine' ? ' on' : '')} onClick={() => setView('mine')}>
            My queue
          </button>
          <button
            className={'btn btn-secondary btn-sm' + (view === 'unassigned' ? ' on' : '')}
            onClick={() => setView('unassigned')}
          >
            Unassigned{unassignedCount ? ` (${unassignedCount})` : ''}
          </button>
          {others.map((n) => (
            <button
              key={n}
              className={'btn btn-secondary btn-sm' + (sameName(view, n) ? ' on' : '')}
              onClick={() => setView(n)}
            >
              {n}
            </button>
          ))}
          <button className={'btn btn-secondary btn-sm' + (view === 'all' ? ' on' : '')} onClick={() => setView('all')}>
            Everyone
          </button>
        </div>
      )}

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
              Who's waiting on you?
              <input value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} placeholder="who? (optional)" />
            </label>
            <label>
              Assign to
              <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">Unassigned</option>
                {assigneeOptions.map((n) => (
                  <option key={n} value={n}>
                    {sameName(n, me) ? `${n} (me)` : n}
                  </option>
                ))}
              </select>
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
            Paste tasks below, one per line — trim any you don’t want first. Each line can carry
            <code> | waiting:Name | due:today | hat:office</code> tags (see the example).
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
            <TaskRow key={t.id} t={t} updateTask={updateTask} removeTask={removeTask} showHat me={me} assigneeOptions={assigneeOptions} />
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
                <TaskRow key={t.id} t={t} updateTask={updateTask} removeTask={removeTask} me={me} assigneeOptions={assigneeOptions} />
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
                <TaskRow key={t.id} t={t} updateTask={updateTask} removeTask={removeTask} me={me} assigneeOptions={assigneeOptions} />
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
  /** The signed-in person's name — default-filters to "My queue" and marks "(me)". */
  me?: string
  /** The editable team list (⚙️ Settings) — names offered in the "Assign to" dropdown. */
  assignees?: string[]
}

export default TasksView
