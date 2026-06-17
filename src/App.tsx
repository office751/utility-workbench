/**
 * App.tsx — the shell: tabs + layout, and the owner of shared state.
 *
 * Three top-level views:
 *   🏠 Today    — the command center (cross-project priorities)
 *   ✓ Tasks     — the cross-role task list
 *   🏗️ Projects — PROJECT-FIRST: a single searchable list of every house.
 *                 Click a house → its own workspace, with Electric / Water /
 *                 Septic / Permit / Materials tabs + an Overview (see Detail).
 *                 Stream is no longer picked before a project — it lives INSIDE
 *                 a project now.
 *
 * "LIFTING STATE UP": which project is selected matters across the UI, so it
 * lives here and flows down.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import './App.css'
import type { Stream } from './types'
import { useProjects } from './hooks/useProjects'
import { applyStepOverrides } from './data/lifecycles'
import { supabase, hasSupabase } from './lib/supabase'
import { buildActionCenter } from './lib/actionCenter'
import { daysUntilDue, dueSoonTasks, waitingOnTasks } from './lib/tasks'
import { useTheme } from './hooks/useTheme'
import { useDensity } from './hooks/useDensity'
import ProjectList from './components/ProjectList'
import BatchApply from './components/BatchApply'
import StatusReport from './components/StatusReport'
import Detail from './components/Detail'
import Today from './components/Today'
import TasksView from './components/TasksView'
import ModelsView from './components/ModelsView'
import InspectionsView from './components/InspectionsView'
import TemplatesView from './components/TemplatesView'
import ExportImport from './components/ExportImport'
import AddProject from './components/AddProject'
import InvestorInbox from './components/InvestorInbox'
import { publishInvestorSnapshots } from './lib/investorPublish'
import { ROLES, type AppRole } from './data/roles'
import PeopleView from './components/PeopleView'

/** A top-level view. 'settings' (🛠) and 'people' (👥) are header buttons, not tabs. */
type View = 'today' | 'tasks' | 'projects' | 'models' | 'inspections' | 'settings' | 'people'

// The top nav tabs. Pure config. `label` is the pill text (no emoji — the
// Calm Canvas header keeps the nav clean); `icon` is kept for reference.
const TABS: { key: View; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'projects', label: 'Projects' },
  { key: 'models', label: 'Models' },
  { key: 'inspections', label: 'Inspections' },
]

/**
 * MoreMenu — the header "More ▾" overflow. Keeps the top bar clean (matching
 * the Calm Canvas design) by tucking secondary actions behind one button. A
 * backdrop closes it on any outside click; clicking an item closes it too.
 * `dirty` shows a small dot so the unsaved-changes signal isn't lost.
 */
function MoreMenu({ dirty, children }: { dirty?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="hdr-menu">
      <button className="icon-btn more-btn" onClick={() => setOpen((o) => !o)} title="More actions">
        More <span className="more-caret">▾</span>
        {dirty && <span className="more-dot" title="Unsaved changes" />}
      </button>
      {open && (
        <>
          <div className="hdr-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="hdr-menu-panel" onClick={() => setOpen(false)}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}

function App({ role = 'admin' }: { role?: AppRole }) {
  // What this signed-in role may see (data/roles.ts). Defaults to admin so the
  // no-backend / local-dev path is unchanged.
  const roleCfg = ROLES[role]
  // All storage logic lives in this one hook (see hooks/useProjects.ts).
  const {
    state,
    getProjectState,
    toggleStep,
    markApplied,
    setStepNote,
    setNote,
    setField,
    addProject,
    deleteProject,
    addProjectFiles,
    removeProjectFile,
    dismissNotification,
    setModelTakeoff,
    setModelOrderList,
    addModelFiles,
    removeModelFile,
    setModelInfo,
    addOrder,
    updateOrder,
    removeOrder,
    addTask,
    updateTask,
    removeTask,
    setStepList,
    resetStepList,
    updateProjectFacts,
    setTemplate,
    replaceState,
    saveState,
    saveNow,
  } = useProjects()

  // Sync the global step-list overrides into the lifecycles resolver BEFORE any
  // child computes a next-action / checklist (pure step getters read this).
  applyStepOverrides(state.stepOverrides)

  // Dark mode (persists per device — see hooks/useTheme.ts).
  const { theme, toggle: toggleTheme } = useTheme()
  // Compact/comfortable spacing (same pattern as dark mode).
  const { density, toggle: toggleDensity } = useDensity()

  // Shared UI state, lifted up to App:
  const [tab, setTab] = useState<View>('today') // default = the command center
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false) // is the Add form open?
  const [applying, setApplying] = useState(false) // is ⚡ Batch Apply open?
  const [reporting, setReporting] = useState(false) // is 📋 Status report open?
  // When you open a project from Today/Tasks, jump straight to that stream's tab.
  const [openStream, setOpenStream] = useState<Stream | undefined>(undefined)

  /** Open a project, optionally landing on a specific stream tab. */
  const openProject = (id: number, stream: Stream) => {
    setTab('projects')
    setOpenStream(stream)
    setSelectedId(id)
    setAdding(false)
  }

  // The roster lives in saved state (so added projects persist).
  const projects = state.roster
  const selected = projects.find((p) => p.id === selectedId)

  // The ✓ Tasks tab badge: due-soon / waiting tasks (red if anything overdue).
  const taskFires = dueSoonTasks(state.tasks)
  const taskWaiting = waitingOnTasks(state.tasks)
  const taskBadge = {
    count: new Set([...taskFires, ...taskWaiting].map((t) => t.id)).size,
    fire: taskFires.some((t) => (daysUntilDue(t) ?? 1) < 0),
  }

  // The action center does DAY MATH (days-left, days-at-stage), so "what day
  // is it?" is a real input alongside the saved state. Track it as state and
  // refresh hourly + whenever you come back to the tab — otherwise an app left
  // open overnight would keep yesterday's badge until you edited something.
  const [dayKey, setDayKey] = useState(() => new Date().toDateString())
  useEffect(() => {
    const refresh = () => setDayKey(new Date().toDateString()) // same day = no-op, no re-render
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, 60 * 60 * 1000) // hourly is plenty for whole-day math
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [])

  // Investor portal: after edits settle, refresh the status snapshots the
  // investors' "Current Progress" cards read (they can't see the blob, so we
  // project it for them). 3s debounce so checking five boxes = one publish.
  // No-op until a project actually has an investor grant.
  useEffect(() => {
    const t = setTimeout(() => publishInvestorSnapshots(projects, getProjectState), 3000)
    return () => clearTimeout(t)
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  // The whole command-center picture — computed ONCE per (state, day) change
  // and shared by the 🏠 tab badge and the Today view, so the number on the
  // badge can never disagree with the rows you see after clicking it ("one
  // prioritization, never two"). useMemo = "only recompute when a dependency
  // changes" (it walks every project, no need to redo that on every keystroke).
  const ac = useMemo(
    () => buildActionCenter(state.roster, getProjectState, state.modelTakeoffs),
    // Two real dependencies: the data (getProjectState only reads `state`)
    // and the calendar day the math is relative to.
    [state, dayKey], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // The 🏠 Today tab badge: construction fires — deadlines (permit expiry,
  // shut-offs, blocked takeoffs) + stages gone quiet. Tasks have their own
  // badge above, so the two never double-count. Red when anything is critical.
  const todayBadge = {
    count: ac.stats.attention,
    fire: ac.attention.some((i) => i.severity === 'crit'),
  }

  return (
    <div className="app">
      <header className="app-header">
        {/* ★ Lodestar brand lockup (Calm Canvas) */}
        <div className="brand-lockup" title="Lodestar — your command center">
          <span className="brand-star">★</span>
          <span className="brand-word">Lodestar</span>
        </div>

        {/* Pill nav — the role's visible tabs, active = rust-tint */}
        <nav className="nav-pills">
          {TABS.filter((t) => (roleCfg.tabs as string[]).includes(t.key)).map((t) => (
            <button
              key={t.key}
              className={'nav-pill' + (tab === t.key ? ' act' : '')}
              onClick={() => {
                setTab(t.key)
                setSelectedId(null)
              }}
            >
              {t.label}
              {t.key === 'today' && todayBadge.count > 0 && (
                <span className={'pill-badge' + (todayBadge.fire ? ' fire' : '')}>{todayBadge.count}</span>
              )}
              {t.key === 'tasks' && taskBadge.count > 0 && (
                <span className={'pill-badge' + (taskBadge.fire ? ' fire' : '')}>{taskBadge.count}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Right cluster: theme toggle · More overflow · avatar */}
        <div className="hdr-actions">
          <button className="icon-btn" onClick={toggleTheme} title="Toggle dark mode">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <MoreMenu dirty={saveState === 'dirty'}>
            <button className="menu-item" onClick={saveNow} disabled={saveState === 'saving'}>
              {saveState === 'saving'
                ? '⏳ Saving…'
                : saveState === 'dirty'
                  ? '● Save now'
                  : saveState === 'error'
                    ? '⚠ Retry save'
                    : '✓ Saved'}
            </button>
            {roleCfg.canManageUsers && (
              <button
                className="menu-item"
                onClick={() => {
                  setTab('people')
                  setSelectedId(null)
                }}
              >
                👥 People &amp; access
              </button>
            )}
            {roleCfg.canManageSettings && (
              <button
                className="menu-item"
                onClick={() => {
                  setTab('settings')
                  setSelectedId(null)
                }}
              >
                🛠 Templates &amp; settings
              </button>
            )}
            <button className="menu-item" onClick={toggleDensity}>
              {density === 'comfortable' ? '⊟ Compact spacing' : '⊞ Comfortable spacing'}
            </button>
            <div className="menu-item menu-item--wrap" onClick={(e) => e.stopPropagation()}>
              <ExportImport state={state} onImport={replaceState} />
            </div>
            {hasSupabase && (
              <button className="menu-item" onClick={() => supabase?.auth.signOut()}>
                ⎋ Sign out
              </button>
            )}
          </MoreMenu>
          <span className="avatar" title="Signed in">A</span>
        </div>
      </header>

      {tab === 'today' && (
        <>
          {/* Unread investor messages float to the top of the day. */}
          <InvestorInbox roster={projects} />
          <Today
          ac={ac}
          tasks={state.tasks}
          onOpen={openProject}
          onCompleteTask={(id) => updateTask(id, { done: true, doneAt: new Date().toISOString() })}
          onGoTasks={() => setTab('tasks')}
          />
        </>
      )}

      {tab === 'tasks' && (
        <TasksView tasks={state.tasks} addTask={addTask} updateTask={updateTask} removeTask={removeTask} />
      )}

      {tab === 'models' && (
        <ModelsView
          models={state.models}
          modelTakeoffs={state.modelTakeoffs}
          modelOrderLists={state.modelOrderLists}
          addModelFiles={addModelFiles}
          removeModelFile={removeModelFile}
          setModelInfo={setModelInfo}
          setModelTakeoff={setModelTakeoff}
          setModelOrderList={setModelOrderList}
        />
      )}

      {tab === 'inspections' && (
        <InspectionsView
          roster={projects}
          getProjectState={getProjectState}
          onOpen={(id) => openProject(id, 'permit')}
        />
      )}

      {tab === 'people' && roleCfg.canManageUsers && <PeopleView roster={projects} />}

      {tab === 'settings' && (
        <TemplatesView
          templates={state.templates}
          setTemplate={setTemplate}
          sampleProject={projects.find((p) => p.listStatus !== 'CO') ?? projects[0]}
          getProjectState={getProjectState}
        />
      )}

      {tab === 'projects' &&
        (reporting ? (
          <StatusReport
            projects={projects}
            getProjectState={getProjectState}
            templates={state.templates}
            modelTakeoffs={state.modelTakeoffs}
            onClose={() => setReporting(false)}
          />
        ) : applying ? (
          <BatchApply
            projects={projects}
            getProjectState={getProjectState}
            templates={state.templates}
            markApplied={markApplied}
            onClose={() => setApplying(false)}
            onOpen={(id) => {
              setApplying(false)
              setOpenStream('electric')
              setSelectedId(id)
            }}
          />
        ) : adding ? (
          <AddProject
            onSave={(facts) => {
              const newId = addProject(facts)
              setAdding(false)
              setOpenStream(undefined)
              setSelectedId(newId)
            }}
            onCancel={() => setAdding(false)}
          />
        ) : selected ? (
          // A house is open → its full-width tabbed workspace.
          <Detail
            key={selected.id}
            project={selected}
            ps={getProjectState(selected.id)}
            tasks={state.tasks}
            templates={state.templates}
            modelTakeoffs={state.modelTakeoffs}
            modelOrderLists={state.modelOrderLists}
            initialStream={openStream}
            toggleStep={toggleStep}
            setStepNote={setStepNote}
            setNote={setNote}
            setField={setField}
            addProjectFiles={addProjectFiles}
            removeProjectFile={removeProjectFile}
            addOrder={addOrder}
            updateOrder={updateOrder}
            removeOrder={removeOrder}
            addTask={addTask}
            updateTask={updateTask}
            removeTask={removeTask}
            dismissNotification={dismissNotification}
            setStepList={setStepList}
            resetStepList={resetStepList}
            updateProjectFacts={updateProjectFacts}
            onBack={() => {
              setSelectedId(null)
              setOpenStream(undefined)
            }}
            onDelete={() => {
              deleteProject(selected.id)
              setSelectedId(null)
            }}
          />
        ) : (
          // The Landing: the searchable list of every house. (The cross-project
          // quick-add bar was removed per the redesign — Projects is just the list.)
          <div className="projects-landing">
            <ProjectList
              projects={projects}
              onSelect={(id) => {
                setOpenStream(undefined)
                setSelectedId(id)
                setAdding(false)
              }}
              onAdd={() => {
                setAdding(true)
                setSelectedId(null)
              }}
              onBatchApply={() => setApplying(true)}
              onStatusReport={() => setReporting(true)}
              getProjectState={getProjectState}
            />
          </div>
        ))}
    </div>
  )
}

export default App
