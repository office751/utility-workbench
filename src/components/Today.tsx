/**
 * Today.tsx — the command center: "okay, what's the goal today?"
 *
 * Top to bottom:
 *   - ⭐ Today's Focus     — the few tasks you starred; your chosen priorities.
 *   - 🔥 Needs attention   — time fires: overdue/due-soon TASKS + construction
 *                            deadlines (permit expiry, shut-offs) + stalled stages.
 *   - ⏳ Waiting on you     — open tasks where someone's blocked on you.
 *   - ✅ Ready for your move — the construction backlog, grouped by action.
 *
 * Tasks "bubble up" on their own: a due date or a who's-waiting tag is enough to
 * surface a task here without you having to star it (that's the auto-urgency).
 */
import { useState } from 'react'
import type { Project, ProjectState, Stream, Task } from '../types'
import { buildActionCenter, type ActionItem } from '../lib/actionCenter'
import { daysUntilDue, dueLabel, dueSoonTasks, focusTasks, waitingOnTasks } from '../lib/tasks'
import { hatOf } from '../data/hats'

interface Props {
  projects: Project[]
  getProjectState: (id: number) => ProjectState
  tasks: Task[]
  /** Open a project on a specific tab (e.g. an expiring permit → its Permit tab). */
  onOpen: (id: number, stream: Stream) => void
  /** Mark a task done from the home screen. */
  onCompleteTask: (id: string) => void
  /** Jump to the Tasks tab (used by the empty-focus hint). */
  onGoTasks: () => void
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** A hero stat tile. */
function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="stat">
      <span className="stat-n">{n}</span>
      <span className="stat-l">{l}</span>
    </div>
  )
}

/** One urgent CONSTRUCTION line — click to open the project. */
function AttentionRow({ item, onOpen }: { item: ActionItem; onOpen: (id: number, s: Stream) => void }) {
  return (
    <button className={`action-row sev-${item.severity}`} onClick={() => onOpen(item.projectId, item.stream)}>
      <span className="ar-icon">{item.icon}</span>
      <span className="ar-body">
        <span className="ar-text">{item.text}</span>
        <span className="ar-addr">
          {item.address} <span className="muted">· {item.meta}</span>
        </span>
      </span>
      {item.detail && <span className={`ar-chip sev-${item.severity}`}>{item.detail}</span>}
      <span className="ar-go">›</span>
    </button>
  )
}

/** One TASK line on Today — the checkbox completes it; stripe + chip show urgency. */
function TaskRow({
  t,
  severity,
  chip,
  bodyWaiting,
  onCompleteTask,
}: {
  t: Task
  severity: 'crit' | 'warn' | 'info'
  chip: string | null
  bodyWaiting: boolean // show the ⏳ person in the body? (false when it's the chip)
  onCompleteTask: (id: string) => void
}) {
  const hat = hatOf(t.category)
  return (
    <div className={`action-row sev-${severity}`}>
      <input type="checkbox" className="focus-check" title="Mark done" onChange={() => onCompleteTask(t.id)} />
      <span className="ar-icon">{hat.icon}</span>
      <span className="ar-body">
        <span className="ar-text">{t.text}</span>
        <span className="ar-addr">
          {hat.label}
          {t.company ? <span className="muted"> · {t.company}</span> : null}
          {bodyWaiting && t.waitingOn ? <span className="muted"> · ⏳ {t.waitingOn}</span> : null}
        </span>
      </span>
      {chip && <span className={`ar-chip sev-${severity}`}>{chip}</span>}
    </div>
  )
}

/** A collapsible group of same-action construction to-dos. */
function MoveGroup({
  icon,
  label,
  items,
  onOpen,
}: {
  icon: string
  label: string
  items: ActionItem[]
  onOpen: (id: number, s: Stream) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={'move-group' + (open ? ' open' : '')}>
      <button className="mg-head" onClick={() => setOpen((o) => !o)}>
        <span className="mg-caret">{open ? '▾' : '▸'}</span>
        <span className="ar-icon">{icon}</span>
        <span className="mg-label">{label}</span>
        <span className="cnt">{items.length}</span>
      </button>
      {open && (
        <div className="mg-items">
          {items.map((it, i) => (
            <button key={i} className="mg-item" onClick={() => onOpen(it.projectId, it.stream)}>
              <span className="mg-addr">{it.address}</span>
              <span className="muted">· {it.meta}</span>
              <span className="ar-go">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Today({ projects, getProjectState, tasks, onOpen, onCompleteTask, onGoTasks }: Props) {
  const ac = buildActionCenter(projects, getProjectState)
  const focus = focusTasks(tasks)

  // Auto-urgency: time fires first (overdue floats to the top), then the people
  // you're holding up (excluding any already shown as a time fire), oldest first.
  // Starred tasks live in the Focus lane only — don't repeat them in the
  // sections below (a task you've already chosen shouldn't nag you twice).
  const focusIds = new Set(focus.map((t) => t.id))
  const attnTasks = [...dueSoonTasks(tasks)]
    .filter((t) => !focusIds.has(t.id))
    .sort((a, b) => (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0))
  const attnIds = new Set(attnTasks.map((t) => t.id))
  const waiting = waitingOnTasks(tasks)
    .filter((t) => !attnIds.has(t.id) && !focusIds.has(t.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const attentionCount = ac.stats.attention + attnTasks.length
  const everythingClear =
    ac.stats.allClear && attnTasks.length === 0 && waiting.length === 0 && focus.length === 0

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const summary = everythingClear
    ? 'All clear — nice.'
    : `${attentionCount} need attention · ${waiting.length} waiting on you · ${ac.stats.moves} to move`

  // Group "your move" by action so it reads as intel, not a 150-row wall.
  const groups = new Map<string, { icon: string; items: ActionItem[] }>()
  for (const m of ac.moves) {
    const key = m.kind === 'order' ? 'Materials to order' : m.text
    if (!groups.has(key)) groups.set(key, { icon: m.icon, items: [] })
    groups.get(key)!.items.push(m)
  }
  const moveGroups = [...groups.entries()].sort((a, b) => b[1].items.length - a[1].items.length)

  // A task fire is critical if it's already overdue, otherwise a warning.
  const taskSev = (t: Task): 'crit' | 'warn' => ((daysUntilDue(t) ?? 0) < 0 ? 'crit' : 'warn')

  return (
    <section className="today">
      <header className="today-hero">
        <div className="today-greet">
          <h2>{greeting()}, Adam</h2>
          <p>
            {today} · {summary}
          </p>
        </div>
        <div className="today-stats">
          <Stat n={focus.length} l="focus" />
          <Stat n={attentionCount} l="attention" />
          <Stat n={waiting.length} l="waiting" />
          <Stat n={ac.stats.moves} l="to move" />
        </div>
      </header>

      {everythingClear && (
        <div className="today-clear">
          🎉 You're all caught up — nothing needs you across {ac.stats.projects} projects and your task list.
        </div>
      )}

      {/* ⭐ Today's Focus — your chosen few */}
      <div className="today-section">
        <h3 className="today-h accent">
          ⭐ Today's focus <span className="cnt">{focus.length}</span>
        </h3>
        {focus.length === 0 ? (
          <p className="meta">
            Nothing starred yet.{' '}
            <button className="linklike" onClick={onGoTasks}>
              Open ✓ Tasks
            </button>{' '}
            and star a few must-dos — they’ll live right here.
          </p>
        ) : (
          <div className="action-list">
            {focus.map((t) => (
              <div key={t.id} className="action-row focus-row">
                <input
                  type="checkbox"
                  className="focus-check"
                  title="Mark done"
                  onChange={() => onCompleteTask(t.id)}
                />
                <span className="ar-icon">{hatOf(t.category).icon}</span>
                <span className="ar-body">
                  <span className="ar-text">{t.text}</span>
                  <span className="ar-addr">
                    {hatOf(t.category).label}
                    {t.company ? <span className="muted"> · {t.company}</span> : null}
                    {t.waitingOn ? <span className="muted"> · ⏳ {t.waitingOn}</span> : null}
                  </span>
                </span>
                {dueLabel(t) && <span className="ar-chip">{dueLabel(t)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 🔥 Needs attention — task fires first, then construction deadlines/stalls */}
      {(attnTasks.length > 0 || ac.attention.length > 0) && (
        <div className="today-section">
          <h3 className="today-h">
            🔥 Needs attention <span className="cnt">{attentionCount}</span>
          </h3>
          <div className="action-list">
            {attnTasks.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                severity={taskSev(t)}
                chip={dueLabel(t)}
                bodyWaiting
                onCompleteTask={onCompleteTask}
              />
            ))}
            {ac.attention.map((it, i) => (
              <AttentionRow key={`a${i}`} item={it} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

      {/* ⏳ Waiting on you — people you're holding up */}
      {waiting.length > 0 && (
        <div className="today-section">
          <h3 className="today-h">
            ⏳ Waiting on you <span className="cnt">{waiting.length}</span>
          </h3>
          <p className="meta">Clear one of these and you unblock someone.</p>
          <div className="action-list">
            {waiting.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                severity="info"
                chip={t.waitingOn ? `⏳ ${t.waitingOn}` : null}
                bodyWaiting={false}
                onCompleteTask={onCompleteTask}
              />
            ))}
          </div>
        </div>
      )}

      {/* ✅ Ready for your move — construction backlog */}
      {moveGroups.length > 0 && (
        <div className="today-section">
          <h3 className="today-h accent">
            ✅ Ready for your move <span className="cnt">{ac.stats.moves}</span>
          </h3>
          <p className="meta">Grouped by action — click a group to expand, then a project to open it.</p>
          <div className="move-groups">
            {moveGroups.map(([label, g]) => (
              <MoveGroup key={label} icon={g.icon} label={label} items={g.items} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default Today
