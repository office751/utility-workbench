/**
 * Today.tsx — the command center: "okay, what's the goal today?"
 *
 * A full-width landing view (no sidebar). Top to bottom:
 *   - ⭐ Today's Focus  — the few tasks you starred; your chosen priorities.
 *   - 🔥 Needs attention — urgent construction (deadlines + stalled stages).
 *   - ✅ Ready for your move — the actionable construction backlog, grouped by
 *     action so 150 to-dos read as "44 site evals, 37 well permits…".
 *
 * (M2 will fold urgent/blocking TASKS into "Needs attention" too. For now the
 * focus list is the task half, and the rest is construction.)
 */
import { useState } from 'react'
import type { Project, ProjectState, Stream, Task } from '../types'
import { buildActionCenter, type ActionItem } from '../lib/actionCenter'
import { focusTasks, dueLabel } from '../lib/tasks'
import { hatOf } from '../data/hats'

interface Props {
  projects: Project[]
  getProjectState: (id: number) => ProjectState
  tasks: Task[]
  /** Open a project on a specific tab (e.g. an expiring permit → its Permit tab). */
  onOpen: (id: number, stream: Stream) => void
  /** Mark a focus task done from the home screen. */
  onCompleteTask: (id: string) => void
  /** Jump to the Tasks tab (used by the empty-focus hint). */
  onGoTasks: () => void
}

/** Morning / afternoon / evening, by the device clock. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** One urgent line. The colored left stripe + chip encode how urgent it is. */
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

/** A collapsible group of same-action to-dos, e.g. "🚽 Site / soil evaluation · 44". */
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
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const summary = ac.stats.allClear
    ? 'No construction fires today.'
    : `${ac.stats.attention} need attention · ${ac.stats.moves} ready to move`

  // Group "your move" by action so it reads as intel, not a 150-row wall.
  const groups = new Map<string, { icon: string; items: ActionItem[] }>()
  for (const m of ac.moves) {
    const key = m.kind === 'order' ? 'Materials to order' : m.text
    // icon already reflects the stream/kind (set in actionCenter): ⚡ 💧 🚽 📋 🛒
    if (!groups.has(key)) groups.set(key, { icon: m.icon, items: [] })
    groups.get(key)!.items.push(m)
  }
  const moveGroups = [...groups.entries()].sort((a, b) => b[1].items.length - a[1].items.length)

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
          <div className="stat">
            <span className="stat-n">{focus.length}</span>
            <span className="stat-l">focus</span>
          </div>
          <div className="stat">
            <span className="stat-n">{ac.stats.attention}</span>
            <span className="stat-l">attention</span>
          </div>
          <div className="stat">
            <span className="stat-n">{ac.stats.moves}</span>
            <span className="stat-l">to move</span>
          </div>
          <div className="stat">
            <span className="stat-n">{ac.stats.projects}</span>
            <span className="stat-l">projects</span>
          </div>
        </div>
      </header>

      {/* ⭐ Today's Focus — your chosen few, first thing every morning */}
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
            {focus.map((t) => {
              const hat = hatOf(t.category)
              const due = dueLabel(t)
              return (
                <div key={t.id} className="action-row focus-row">
                  <input
                    type="checkbox"
                    className="focus-check"
                    title="Mark done"
                    onChange={() => onCompleteTask(t.id)}
                  />
                  <span className="ar-icon">{hat.icon}</span>
                  <span className="ar-body">
                    <span className="ar-text">{t.text}</span>
                    <span className="ar-addr">
                      {hat.label}
                      {t.company ? <span className="muted"> · {t.company}</span> : null}
                      {t.waitingOn ? <span className="muted"> · ⏳ {t.waitingOn}</span> : null}
                    </span>
                  </span>
                  {due && <span className="ar-chip">{due}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {ac.stats.allClear && (
        <div className="today-clear">
          🎉 No construction deadlines, stalls, or pending moves across {ac.stats.projects} projects.
        </div>
      )}

      {ac.attention.length > 0 && (
        <div className="today-section">
          <h3 className="today-h">
            🔥 Needs attention <span className="cnt">{ac.attention.length}</span>
          </h3>
          <div className="action-list">
            {ac.attention.map((it, i) => (
              <AttentionRow key={`a${i}`} item={it} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

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
