/**
 * Today.tsx — the command center: "okay, what's the goal today?"
 *
 * Visual direction: "Calm Canvas" (from the Claude Design system) — a rust
 * greeting banner, then consistent section headers (icon + uppercase label +
 * count) over grouped inset cards of rows.
 *
 * SLIMMED July 2026 (Adam: "I don't want to see all of that on my Today
 * screen") — this screen now carries ONLY what's time-critical today:
 *   - ⭐ Today's Focus     — the few tasks you starred; your chosen priorities.
 *   - 🔥 Needs attention   — time fires: overdue/due-soon TASKS + hard
 *                            construction deadlines (permit expiry, shut-offs,
 *                            blocked takeoffs). Deliberately KEPT here: a
 *                            "permit expires Friday" buried inside a project
 *                            you don't open that week is a missed deadline.
 *   - ⏳ Waiting on you     — open tasks where someone's blocked on you.
 * Everything portfolio-shaped moved to where the work happens: gone-quiet
 * stalls and "ready for your move" now show on each project's Overview
 * (Detail's alerts card + status grid), and the Projects list's next-action
 * line + permit chips are the working queue.
 *
 * Tasks "bubble up" on their own: a due date or a who's-waiting tag is enough to
 * surface a task here without you having to star it (that's the auto-urgency).
 */
import type { ReactNode } from 'react'
import type { Stream, Task } from '../types'
import type { ActionCenter, ActionItem } from '../lib/actionCenter'
import { daysUntilDue, dueLabel, dueSoonTasks, focusTasks, forOperator, unassignedOpen, waitingOnTasks } from '../lib/tasks'
import { hatOf } from '../data/hats'
import { scanHealth, scanPending } from '../lib/scanHealth'
import Icon, { miForEmoji as miFor } from './Icon'

interface Props {
  /**
   * The command-center picture, computed ONCE in App.tsx (it also drives the
   * 🏠 tab badge — sharing one computation keeps badge and view in agreement).
   */
  ac: ActionCenter
  tasks: Task[]
  /** Open a project on a specific tab (e.g. an expiring permit → its Permit
   *  tab; a shut-off → the Overview, where the Closing card lives). */
  onOpen: (id: number, stream: Stream | 'overview') => void
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
function AttnRow({ item, onOpen }: { item: ActionItem; onOpen: (id: number, s: Stream | 'overview') => void }) {
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

  // Only hard DEADLINES stay on Today (🔥 — permit expiry, shut-offs, blocked
  // takeoffs). Gone-quiet stalls moved to each project's Overview alerts card
  // (July 2026 slim-down) — they're background pressure, not today's fires.
  const fires = ac.attention.filter((i) => i.kind !== 'stale')

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

  // "Clear" now means clear OF WHAT THIS SCREEN SHOWS: no deadline fires, no
  // due tasks, nobody waiting, nothing starred. Project backlogs don't count —
  // they live on the Projects list and each house's Overview now.
  const everythingClear =
    fires.length === 0 && attnTasks.length === 0 && waiting.length === 0 && focus.length === 0

  // Scanner heartbeat → ok / warn / crit (null until the scanner first stamps).
  // ok shows as a quiet "portal scan ✓" note in the greeting; warn/crit render
  // the alert strip below the banner.
  const scan = scanHealth(scanMeta)
  // A "Scan now" press that the Mac hasn't answered yet (30-min shelf life).
  const pending = scanPending(scanMeta)

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  // Just the date — the section counts below carry the numbers (and since the
  // July 2026 slim-down there are no banner stat chips to repeat them).
  const summary = everythingClear ? `${today} · all clear — nice.` : today

  // A task fire is critical (danger) if already overdue, otherwise a warning.
  const taskTone = (t: Task): BadgeTone => ((daysUntilDue(t) ?? 0) < 0 ? 'danger' : 'warn')

  return (
    <section className="today">
      {/* Rust greeting banner — just the greeting and the date since the July
          2026 slim-down (the old glass stat chips shouted numbers the sections
          below already carry). */}
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
          No deadlines, nothing due, nobody waiting — open Projects to push the next house forward.
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

    </section>
  )
}

export default Today
