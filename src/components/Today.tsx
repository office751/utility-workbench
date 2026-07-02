/**
 * Today.tsx — the command center: "okay, what's the goal today?"
 *
 * Visual direction: "Calm Canvas" (from the Claude Design system) — a rust
 * greeting banner with glass stat chips, then consistent section headers
 * (icon + uppercase label + count) over grouped inset cards of rows.
 *
 * Top to bottom:
 *   - ⭐ Today's Focus     — the few tasks you starred; your chosen priorities.
 *   - 🔥 Needs attention   — time fires: overdue/due-soon TASKS + construction
 *                            deadlines (permit expiry, shut-offs, blocked takeoffs).
 *   - ⚠ Gone quiet         — projects parked past the expected duration for
 *                            their current step (the stale-status flags).
 *   - ⏳ Waiting on you     — open tasks where someone's blocked on you.
 *   - ✅ Ready for your move — the construction backlog, grouped by action.
 *
 * Tasks "bubble up" on their own: a due date or a who's-waiting tag is enough to
 * surface a task here without you having to star it (that's the auto-urgency).
 */
import { useState, type ReactNode } from 'react'
import type { Stream, Task } from '../types'
import type { ActionCenter, ActionItem } from '../lib/actionCenter'
import { daysUntilDue, dueLabel, dueSoonTasks, focusTasks, forOperator, unassignedOpen, waitingOnTasks } from '../lib/tasks'
import { hatOf } from '../data/hats'
import { scanHealth, scanPending } from '../lib/scanHealth'
import Icon from './Icon'

/** Action-center items carry EMOJI icons (so the status-report text keeps them);
 *  on the Today screen we render them as Material Symbols glyphs instead. */
const MI_FOR: Record<string, string> = {
  '⚡': 'bolt',
  '💧': 'water_drop',
  '🚽': 'plumbing',
  '📋': 'description',
  '🛒': 'shopping_cart',
  '🧩': 'extension',
  '⏰': 'schedule',
  '⚠': 'warning',
  '⚠️': 'warning',
}
const miFor = (emoji: string): string => MI_FOR[emoji] ?? 'task_alt'

interface Props {
  /**
   * The command-center picture, computed ONCE in App.tsx (it also drives the
   * 🏠 tab badge — sharing one computation keeps badge and view in agreement).
   */
  ac: ActionCenter
  tasks: Task[]
  /** Open a project on a specific tab (e.g. an expiring permit → its Permit tab). */
  onOpen: (id: number, stream: Stream) => void
  /** Mark a task done from the home screen. */
  onCompleteTask: (id: string) => void
  /** Jump to the Tasks tab (used by the empty-focus hint). */
  onGoTasks: () => void
  /** The signed-in person's display name — personalizes the greeting and (in
   *  the next step) scopes "my queue". Empty when unknown (local dev / pre-RBAC). */
  me?: string
  /** Nightly permit-scanner heartbeat (WorkbenchState.scanMeta). Absent until
   *  the scanner's first stamped run; stale → the "gone quiet" alert below. */
  scanMeta?: { lastScanAt?: string; permitsRead?: number; requestedAt?: string }
  /** 🔄 "Scan now" — stamps a scan request the office Mac's watcher picks up
   *  (within ~2 min). Absent = button hidden (e.g. a future read-only view). */
  onRequestScan?: () => void
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

type BadgeTone = 'danger' | 'warn' | 'neutral' | 'accent'

/** A glass metric chip on the rust greeting banner. */
function StatChip({ n, l }: { n: number; l: string }) {
  return (
    <div className="t-stat">
      <span className="t-stat-n">{n}</span>
      <span className="t-stat-l">{l}</span>
    </div>
  )
}

/** The consistent header above every section: Material Symbol + uppercase label
 *  + count. `icon` is a Material Symbols ligature name. */
function SecHead({
  icon,
  label,
  count,
  hint,
  color = 'var(--ink-2)',
  fill = false,
}: {
  icon: string
  label: string
  count: number
  hint?: string
  color?: string
  fill?: boolean
}) {
  return (
    <div className="t-sec-head">
      <div className="t-sec-line">
        <span className="t-sec-icon">
          <Icon name={icon} size={18} color={color} fill={fill} />
        </span>
        <span className="t-sec-label">{label}</span>
        <span className="t-sec-count">{count}</span>
      </div>
      {hint && <p className="t-sec-hint">{hint}</p>}
    </div>
  )
}

/** One TASK row — the checkbox completes it; an optional trailing badge. */
function TaskRow({
  t,
  badge,
  badgeTone,
  bodyWaiting,
  onCompleteTask,
}: {
  t: Task
  badge: ReactNode
  badgeTone: BadgeTone
  bodyWaiting: boolean // show the waiting-on person in the body? (false when it's the badge)
  onCompleteTask: (id: string) => void
}) {
  const hat = hatOf(t.category)
  return (
    <div className="t-row">
      {/* The <label> is the checkbox's 44px tap "landing pad" on phones (see
          App.css .t-check-hit) — tapping anywhere on it toggles the input, so
          the drawn box can stay small without being hard to hit. The
          aria-label names the control for screen readers (a title tooltip
          alone isn't reliably announced). */}
      <label className="t-check-hit">
        <input
          type="checkbox"
          className="t-check"
          title="Mark done"
          aria-label={`Mark "${t.text}" done`}
          onChange={() => onCompleteTask(t.id)}
        />
      </label>
      <span className="t-row-icon">
        <Icon name={hat.mi} size={18} color="var(--ink-2)" />
      </span>
      <span className="t-row-body">
        <span className="t-row-title">{t.text}</span>
        <span className="t-row-meta">
          {hat.label}
          {t.company ? ` · ${t.company}` : ''}
          {bodyWaiting && t.waitingOn ? ` · waiting on ${t.waitingOn}` : ''}
        </span>
      </span>
      {badge && <span className={`t-badge t-badge--${badgeTone}`}>{badge}</span>}
    </div>
  )
}

/** One urgent CONSTRUCTION row — click to open the project. */
function AttnRow({ item, onOpen }: { item: ActionItem; onOpen: (id: number, s: Stream) => void }) {
  const tone: BadgeTone = item.severity === 'crit' ? 'danger' : item.severity === 'warn' ? 'warn' : 'neutral'
  return (
    <button className="t-row t-row--link" onClick={() => onOpen(item.projectId, item.stream)}>
      <span className="t-row-icon">
        <Icon name={miFor(item.icon)} size={18} color="var(--ink-2)" />
      </span>
      <span className="t-row-body">
        <span className="t-row-title">{item.text}</span>
        <span className="t-row-meta">
          {item.address} · {item.meta}
        </span>
      </span>
      {item.detail && <span className={`t-badge t-badge--${tone}`}>{item.detail}</span>}
      <span className="t-chev">›</span>
    </button>
  )
}

/** A collapsible group of same-action construction to-dos (the "Ready" lane). */
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
    <>
      <button className="t-row t-row--link t-move-head" onClick={() => setOpen((o) => !o)}>
        <span className="t-move-caret">{open ? '▾' : '▸'}</span>
        <span className="t-row-icon ready">
          <Icon name={miFor(icon)} size={18} color="var(--ready-icon)" />
        </span>
        <span className="t-row-body">
          <span className="t-row-title">{label}</span>
        </span>
        <b className="t-move-n">{items.length}</b>
        <span className="t-chev">{open ? '' : '›'}</span>
      </button>
      {open &&
        items.map((it, i) => (
          <button key={i} className="t-row t-row--link t-move-item" onClick={() => onOpen(it.projectId, it.stream)}>
            <span className="t-row-body">
              <span className="t-row-meta">
                {it.address} · {it.meta}
              </span>
            </span>
            <span className="t-chev">›</span>
          </button>
        ))}
    </>
  )
}

function Today({ ac, tasks, onOpen, onCompleteTask, onGoTasks, me, scanMeta, onRequestScan }: Props) {
  // YOUR queue = tasks assigned to you PLUS every unassigned task (fail-open, so
  // a to-do never disappears from both people's screens). Carey's assigned tasks
  // drop off your Today; manage everyone's work from the Tasks tab. House alerts
  // (ac.*) stay shared — a looming permit/shut-off shows to both of you.
  const myTasks = forOperator(tasks, me)
  const focus = focusTasks(myTasks)
  // The shared "up for grabs" pile — open + unassigned. Shown as a banner count
  // so the training/shared work is visible and gets claimed (it's also already
  // mixed into the sections below, never hidden).
  const upForGrabs = me ? unassignedOpen(tasks).length : 0

  // Split the construction attention list for display: hard DEADLINES (🔥 —
  // permit expiry, shut-offs, blocked takeoffs) vs projects that simply went
  // QUIET at a stage (⚠ — the stale flags from lib/staleness.ts). Same
  // prioritized list underneath, two sections so a wall of stalled projects
  // can't bury a real deadline.
  const fires = ac.attention.filter((i) => i.kind !== 'stale')
  const stalled = ac.attention.filter((i) => i.kind === 'stale')

  // Auto-urgency: time fires first (overdue floats to the top), then the people
  // you're holding up (excluding any already shown as a time fire), oldest first.
  // Starred tasks live in the Focus lane only — don't repeat them in the
  // sections below (a task you've already chosen shouldn't nag you twice).
  const focusIds = new Set(focus.map((t) => t.id))
  const attnTasks = [...dueSoonTasks(myTasks)]
    .filter((t) => !focusIds.has(t.id))
    .sort((a, b) => (daysUntilDue(a) ?? 0) - (daysUntilDue(b) ?? 0))
  const attnIds = new Set(attnTasks.map((t) => t.id))
  const waiting = waitingOnTasks(myTasks)
    .filter((t) => !attnIds.has(t.id) && !focusIds.has(t.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // The hero number = everything urgent: due tasks + both construction
  // sections below (🔥 deadlines AND ⚠ gone-quiet — ac.stats.attention is their sum).
  const attentionCount = ac.stats.attention + attnTasks.length
  const everythingClear =
    ac.stats.allClear && attnTasks.length === 0 && waiting.length === 0 && focus.length === 0

  // Scanner heartbeat → ok / warn / crit (null until the scanner first stamps).
  // ok shows as a quiet "portal scan ✓" note in the greeting; warn/crit render
  // the alert strip below the banner.
  const scan = scanHealth(scanMeta)
  // A "Scan now" press that the Mac hasn't answered yet (30-min shelf life).
  const pending = scanPending(scanMeta)

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  // Just the date here — the stat chips carry the numbers, so we don't say the
  // same counts twice (audit finding, June 2026).
  const summary = everythingClear ? `${today} · all clear — nice.` : today

  // Group "your move" by action so it reads as intel, not a 150-row wall.
  const groups = new Map<string, { icon: string; items: ActionItem[] }>()
  for (const m of ac.moves) {
    const key = m.kind === 'order' ? 'Materials to order' : m.text
    if (!groups.has(key)) groups.set(key, { icon: m.icon, items: [] })
    groups.get(key)!.items.push(m)
  }
  const moveGroups = [...groups.entries()].sort((a, b) => b[1].items.length - a[1].items.length)

  // A task fire is critical (danger) if already overdue, otherwise a warning.
  const taskTone = (t: Task): BadgeTone => ((daysUntilDue(t) ?? 0) < 0 ? 'danger' : 'warn')

  return (
    <section className="today">
      {/* Rust greeting banner with the four command-center stats as glass chips. */}
      <header className="t-banner">
        <div className="t-banner-text">
          <h2>{greeting()}{me ? `, ${me.split(' ')[0]}` : ''}</h2>
          <p>{summary}{upForGrabs > 0 ? ` · ${upForGrabs} unassigned task${upForGrabs !== 1 ? 's' : ''} up for grabs` : ''}{scan?.level === 'ok' && !pending ? ` · portal scan ✓ ${scan.agoLabel}` : ''}{pending ? ' · scan requested — the office Mac picks it up within ~2 min' : ''}</p>
          {/* 🔄 The remote control for the Mac's county-portal scan. Hidden
              while a request is pending (the note above says so instead) and
              until the scanner has stamped at least once (old saves stay quiet). */}
          {onRequestScan && scanMeta && !pending && (
            <button
              className="t-scan-btn"
              onClick={onRequestScan}
              title="Ask the office Mac to run the county-portal permit scan now (results land here live)"
            >
              <Icon name="refresh" size={14} /> Scan now
            </button>
          )}
        </div>
        <div className="t-stats">
          <StatChip n={focus.length} l="Focus" />
          <StatChip n={attentionCount} l="Attention" />
          <StatChip n={waiting.length} l="Waiting" />
          <StatChip n={ac.stats.moves} l="To move" />
        </div>
      </header>

      {/* ⚠ Infrastructure alert: the nightly portal scan stopped reporting.
          Holds/inspections/permit statuses on this screen go stale fast when
          the scanner is down — in June 2026 it was silently dead for 19 days,
          which is exactly why this banner exists. */}
      {scan && scan.level !== 'ok' && (
        <div className={`scan-alert${scan.level === 'crit' ? ' crit' : ''}`} role="alert">
          <Icon name="satellite_alt" size={20} />
          <p>
            <strong>Permit scanner has gone quiet</strong> — last check-in {scan.agoLabel}.
            Holds, inspections &amp; permit statuses here may be stale. Check that the
            office Mac is on and awake; the scan logs live in scanner/logs.
          </p>
        </div>
      )}

      {everythingClear && (
        <div className="t-clear">
          <Icon name="celebration" size={18} color="var(--success)" />
          You're all caught up — nothing needs you across {ac.stats.projects} projects and your task list.
        </div>
      )}

      {/* ⭐ Today's Focus — your chosen few (rust-accented card) */}
      <section className="t-sec">
        <SecHead icon="star" label="Today's focus" count={focus.length} color="var(--gold)" fill />
        {focus.length === 0 ? (
          <div className="t-card t-card--accent t-empty">
            Nothing starred yet.{' '}
            <button className="linklike" onClick={onGoTasks}>
              Open Tasks
            </button>{' '}
            and star a few must-dos — they’ll live right here.
          </div>
        ) : (
          <div className="t-card t-card--accent">
            {focus.map((t) => (
              <TaskRow key={t.id} t={t} badge={dueLabel(t)} badgeTone="neutral" bodyWaiting onCompleteTask={onCompleteTask} />
            ))}
          </div>
        )}
      </section>

      {/* 🔥 Needs attention — task fires first, then construction deadlines */}
      {(attnTasks.length > 0 || fires.length > 0) && (
        <section className="t-sec">
          <SecHead
            icon="local_fire_department"
            label="Needs attention"
            count={attnTasks.length + fires.length}
            color="var(--danger)"
          />
          <div className="t-card">
            {attnTasks.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                badge={dueLabel(t)}
                badgeTone={taskTone(t)}
                bodyWaiting
                onCompleteTask={onCompleteTask}
              />
            ))}
            {fires.map((it, i) => (
              <AttnRow key={`a${i}`} item={it} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {/* ⚠ Gone quiet — parked past the expected duration for their current step */}
      {stalled.length > 0 && (
        <section className="t-sec">
          <SecHead
            icon="warning"
            label="Gone quiet — overdue at a stage"
            count={stalled.length}
            color="var(--warn)"
            hint="These have sat at their current step longer than expected — time for a nudge."
          />
          <div className="t-card">
            {stalled.map((it, i) => (
              <AttnRow key={`s${i}`} item={it} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {/* ⏳ Waiting on you — people you're holding up */}
      {waiting.length > 0 && (
        <section className="t-sec">
          <SecHead
            icon="hourglass_top"
            label="Waiting on you"
            count={waiting.length}
            color="var(--info)"
            hint="Clear one of these and you unblock someone."
          />
          <div className="t-card">
            {waiting.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                badge={
                  t.waitingOn ? (
                    <>
                      <Icon name="hourglass_top" size={12} /> {t.waitingOn}
                    </>
                  ) : null
                }
                badgeTone="neutral"
                bodyWaiting={false}
                onCompleteTask={onCompleteTask}
              />
            ))}
          </div>
        </section>
      )}

      {/* ✅ Ready for your move — construction backlog, grouped by action */}
      {moveGroups.length > 0 && (
        <section className="t-sec">
          <SecHead
            icon="check_circle"
            label="Ready for your move"
            count={ac.stats.moves}
            color="var(--success)"
            fill
            hint="Grouped by action — open a group, then a project."
          />
          <div className="t-card">
            {moveGroups.map(([label, g]) => (
              <MoveGroup key={label} icon={g.icon} label={label} items={g.items} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

export default Today
