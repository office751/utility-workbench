/**
 * App.tsx — the shell: tabs + layout, and the owner of shared state.
 *
 * NEW CONCEPT — "LIFTING STATE UP": which project is selected matters to
 * BOTH the sidebar (highlight the row) and the detail panel (what to show).
 * When two components need the same state, it lives in their closest shared
 * parent — here — and flows down to each as props.
 */
import { useState, type CSSProperties } from 'react'
import './App.css'
import type { Stream } from './types'
import { useProjects } from './hooks/useProjects'
import { streamActionCounts } from './lib/actionCenter'
import { daysUntilDue, dueSoonTasks, waitingOnTasks } from './lib/tasks'
import { useTheme } from './hooks/useTheme'
import { useDensity } from './hooks/useDensity'
import { useResizableSidebar } from './hooks/useResizableSidebar'
import ProjectList from './components/ProjectList'
import Detail from './components/Detail'
import Dashboard from './components/Dashboard'
import Today from './components/Today'
import TasksView from './components/TasksView'
import ExportImport from './components/ExportImport'
import AddProject from './components/AddProject'
import QuickAdd from './components/QuickAdd'

/** A "view" is the Today command center, the Tasks tab, OR a project stream. */
type View = 'today' | 'tasks' | Stream

// The tabs. Pure config, so adding a tab = adding a line.
const TABS: { key: View; label: string }[] = [
  { key: 'today', label: '🏠 Today' },
  { key: 'tasks', label: '✓ Tasks' },
  { key: 'electric', label: '⚡ Electric' },
  { key: 'water', label: '💧 Water' },
  { key: 'septic', label: '🚽 Septic' },
  { key: 'permit', label: '📋 Permit' },
  { key: 'materials', label: '🛒 Materials' },
]

function App() {
  // All storage logic lives in this one hook (see hooks/useProjects.ts).
  const {
    state,
    getProjectState,
    toggleStep,
    setStepNote,
    setNote,
    setField,
    addProject,
    deleteProject,
    addDocuments,
    removeDocument,
    addOrder,
    updateOrder,
    removeOrder,
    addTask,
    updateTask,
    removeTask,
    replaceState,
  } = useProjects()

  // Dark mode (persists per device — see hooks/useTheme.ts).
  const { theme, toggle: toggleTheme } = useTheme()

  // Compact/comfortable spacing (same pattern as dark mode).
  const { density, toggle: toggleDensity } = useDensity()

  // Draggable list/detail divider; remembers its width.
  const { width: sidebarWidth, layoutRef, startDrag } = useResizableSidebar()

  // Shared UI state, lifted up to App:
  // Default view is the Today command center — the "what's the goal today" home.
  const [tab, setTab] = useState<View>('today')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false) // is the Add form open?

  /** Jump from a Today item straight to that project's relevant stream tab. */
  const openProject = (id: number, stream: Stream) => {
    setTab(stream)
    setSelectedId(id)
  }

  // The roster now lives in saved state (so added projects persist).
  const projects = state.roster

  // Find the selected project object (or undefined if nothing selected).
  const selected = projects.find((p) => p.id === selectedId)

  // Per-tab badges (M3): how many projects need me in each stream, plus a count
  // of due-soon / waiting tasks for the ✓ Tasks tab. `fire` → red badge.
  const streamBadges = streamActionCounts(projects, getProjectState)
  const taskFires = dueSoonTasks(state.tasks)
  const taskWaiting = waitingOnTasks(state.tasks)
  const taskBadge = {
    count: new Set([...taskFires, ...taskWaiting].map((t) => t.id)).size,
    fire: taskFires.some((t) => (daysUntilDue(t) ?? 1) < 0),
  }
  const tabBadge = (key: View): { count: number; fire: boolean } | null => {
    if (key === 'today') return null
    if (key === 'tasks') return taskBadge
    return streamBadges[key]
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>⚡ Iron Shield Utility Workbench</h1>
          <p className="tagline">Electric · Water · Septic — Marion County, FL</p>
        </div>
        <nav className="tabs">
          {TABS.map((t) => {
            const badge = tabBadge(t.key)
            return (
              <button
                key={t.key}
                className={tab === t.key ? 'act' : ''}
                // Switching tabs also clears the selection, so each tab
                // greets you with its own dashboard (same as the old tool).
                onClick={() => {
                  setTab(t.key)
                  setSelectedId(null)
                }}
              >
                {t.label}
                {badge && badge.count > 0 && (
                  <span className={'tab-badge' + (badge.fire ? ' fire' : '')}>{badge.count}</span>
                )}
              </button>
            )
          })}
          {/* density toggle — ⊟ collapses to compact, ⊞ expands back */}
          <button onClick={toggleDensity} title="Toggle compact / comfortable spacing">
            {density === 'comfortable' ? '⊟' : '⊞'}
          </button>
          {/* dark mode toggle — show the thing you'd switch TO */}
          <button onClick={toggleTheme} title="Toggle dark mode">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {/* move data between browsers as a .json file */}
          <ExportImport state={state} onImport={replaceState} />
        </nav>
      </header>

      {/* The Quick-Add capture bar — only on the Materials tab. */}
      {tab === 'materials' && (
        <QuickAdd projects={projects} getProjectState={getProjectState} addOrder={addOrder} />
      )}

      {/* The Today command center is a full-width view; every other tab uses
          the 3-column grid below. */}
      {tab === 'today' ? (
        <Today
          projects={projects}
          getProjectState={getProjectState}
          tasks={state.tasks}
          onOpen={openProject}
          onCompleteTask={(id) => updateTask(id, { done: true, doneAt: new Date().toISOString() })}
          onGoTasks={() => setTab('tasks')}
        />
      ) : tab === 'tasks' ? (
        <TasksView tasks={state.tasks} addTask={addTask} updateTask={updateTask} removeTask={removeTask} />
      ) : (
      /* The layout is a 3-column grid: list | drag-handle | detail. We set the
         FIRST column's width through a CSS variable (--sidebar-w) so the drag
         hook can change it live; the `as CSSProperties` cast tells TypeScript a
         custom --variable is allowed here. */
      <div
        className="layout"
        ref={layoutRef}
        style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
      >
        {/* key={tab} is a React trick: a new key = a brand-new component,
            so each tab gets fresh search/filter state automatically. */}
        <ProjectList
          key={tab}
          stream={tab}
          projects={projects}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            setAdding(false) // picking a project closes the Add form
          }}
          onAdd={() => {
            setAdding(true)
            setSelectedId(null)
          }}
          getProjectState={getProjectState}
        />

        {/* the drag handle — grab it to resize the two panels */}
        <div className="resizer" onMouseDown={startDrag} title="Drag to resize" />

        {adding ? (
          <AddProject
            onSave={(facts) => {
              const newId = addProject(facts) // save it...
              setAdding(false)
              setSelectedId(newId) // ...and jump straight to its detail view
            }}
            onCancel={() => setAdding(false)}
          />
        ) : selected ? (
          <Detail
            stream={tab}
            project={selected}
            ps={getProjectState(selected.id)}
            toggleStep={toggleStep}
            setStepNote={setStepNote}
            setNote={setNote}
            setField={setField}
            addDocuments={addDocuments}
            removeDocument={removeDocument}
            addOrder={addOrder}
            updateOrder={updateOrder}
            removeOrder={removeOrder}
            onSwitchStream={(s) => setTab(s)}
            onBack={() => setSelectedId(null)}
            onDelete={() => {
              deleteProject(selected.id)
              setSelectedId(null) // back to the dashboard
            }}
          />
        ) : (
          // No selection → that tab's action dashboard fills the pane.
          <Dashboard
            stream={tab}
            projects={projects}
            getProjectState={getProjectState}
            onSelect={setSelectedId}
          />
        )}
      </div>
      )}
    </div>
  )
}

export default App
