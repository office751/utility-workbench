/**
 * App.tsx — the shell: tabs + layout, and the owner of shared state.
 *
 * Three top-level views:
 *   🏠 Today    — the command center (cross-project priorities)
 *   ✓ Tasks     — the cross-role task list
 *   🏗️ Projects — every house; a STREAM LENS (⚡💧🚽📋🛒) picks which stream
 *                 you're viewing through. No project selected → that stream's
 *                 dashboard; click a project → its detail (with the stream-strip
 *                 to hop between streams). The lens is where the per-stream
 *                 badges live now.
 *
 * "LIFTING STATE UP": which project is selected (and which lens) matters to
 * both the sidebar and the detail panel, so it lives here and flows down.
 */
import { useState, type CSSProperties } from 'react'
import './App.css'
import type { Stream } from './types'
import { useProjects } from './hooks/useProjects'
import { supabase, hasSupabase } from './lib/supabase'
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

/** A top-level view. Project streams are no longer tabs — they're a lens (below). */
type View = 'today' | 'tasks' | 'projects'

// The three top tabs. Pure config.
const TABS: { key: View; label: string }[] = [
  { key: 'today', label: '🏠 Today' },
  { key: 'tasks', label: '✓ Tasks' },
  { key: 'projects', label: '🏗️ Projects' },
]

// The stream lens inside the Projects tab — what used to be 5 separate tabs.
const STREAM_LENSES: { key: Stream; icon: string; name: string }[] = [
  { key: 'electric', icon: '⚡', name: 'Electric' },
  { key: 'water', icon: '💧', name: 'Water' },
  { key: 'septic', icon: '🚽', name: 'Septic' },
  { key: 'permit', icon: '📋', name: 'Permit' },
  { key: 'materials', icon: '🛒', name: 'Materials' },
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
    addProjectFiles,
    removeProjectFile,
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
  const [tab, setTab] = useState<View>('today') // default = the command center
  const [lens, setLens] = useState<Stream>('electric') // active stream inside Projects
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false) // is the Add form open?

  /** Jump from a Today/Tasks item straight to that project's relevant stream. */
  const openProject = (id: number, stream: Stream) => {
    setTab('projects')
    setLens(stream)
    setSelectedId(id)
    setAdding(false)
  }

  // The roster now lives in saved state (so added projects persist).
  const projects = state.roster

  // Find the selected project object (or undefined if nothing selected).
  const selected = projects.find((p) => p.id === selectedId)

  // Per-stream badge counts (shown on the lens chips): how many projects need
  // me in each stream, and whether any are a true fire (→ red).
  const streamBadges = streamActionCounts(projects, getProjectState)
  // The ✓ Tasks tab badge: due-soon / waiting tasks (red if anything overdue).
  const taskFires = dueSoonTasks(state.tasks)
  const taskWaiting = waitingOnTasks(state.tasks)
  const taskBadge = {
    count: new Set([...taskFires, ...taskWaiting].map((t) => t.id)).size,
    fire: taskFires.some((t) => (daysUntilDue(t) ?? 1) < 0),
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>⚡ Iron Shield Utility Workbench</h1>
          <p className="tagline">Electric · Water · Septic — Marion County, FL</p>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'act' : ''}
              onClick={() => {
                setTab(t.key)
                setSelectedId(null)
              }}
            >
              {t.label}
              {t.key === 'tasks' && taskBadge.count > 0 && (
                <span className={'tab-badge' + (taskBadge.fire ? ' fire' : '')}>{taskBadge.count}</span>
              )}
            </button>
          ))}
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
          {hasSupabase && (
            <button className="mini signout" onClick={() => supabase?.auth.signOut()} title="Sign out">
              ⎋ Sign out
            </button>
          )}
        </nav>
      </header>

      {tab === 'today' && (
        <Today
          projects={projects}
          getProjectState={getProjectState}
          tasks={state.tasks}
          onOpen={openProject}
          onCompleteTask={(id) => updateTask(id, { done: true, doneAt: new Date().toISOString() })}
          onGoTasks={() => setTab('tasks')}
        />
      )}

      {tab === 'tasks' && (
        <TasksView tasks={state.tasks} addTask={addTask} updateTask={updateTask} removeTask={removeTask} />
      )}

      {tab === 'projects' && (
        <>
          {/* The stream lens — pick which stream to view all projects through.
              This replaces the old per-stream tabs; the badges live here now. */}
          <nav className="lens-row">
            {STREAM_LENSES.map((s) => {
              const b = streamBadges[s.key]
              return (
                <button
                  key={s.key}
                  className={'lens-chip' + (lens === s.key ? ' act' : '')}
                  onClick={() => {
                    setLens(s.key)
                    setSelectedId(null) // switching lens → that stream's dashboard
                    setAdding(false)
                  }}
                >
                  <span>
                    {s.icon} {s.name}
                  </span>
                  {b.count > 0 && (
                    <span className={'tab-badge' + (b.fire ? ' fire' : '')}>{b.count}</span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Materials capture bar — only when viewing through the Materials lens. */}
          {lens === 'materials' && (
            <QuickAdd projects={projects} getProjectState={getProjectState} addOrder={addOrder} />
          )}

          {/* 3-column grid: list | drag-handle | detail. The sidebar width is a
              CSS variable the drag hook updates live. */}
          <div
            className="layout"
            ref={layoutRef}
            style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
          >
            {/* key={lens} gives each lens fresh search/filter state. */}
            <ProjectList
              key={lens}
              stream={lens}
              projects={projects}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id)
                setAdding(false)
              }}
              onAdd={() => {
                setAdding(true)
                setSelectedId(null)
              }}
              getProjectState={getProjectState}
            />

            <div className="resizer" onMouseDown={startDrag} title="Drag to resize" />

            {adding ? (
              <AddProject
                onSave={(facts) => {
                  const newId = addProject(facts)
                  setAdding(false)
                  setSelectedId(newId)
                }}
                onCancel={() => setAdding(false)}
              />
            ) : selected ? (
              <Detail
                stream={lens}
                project={selected}
                ps={getProjectState(selected.id)}
                toggleStep={toggleStep}
                setStepNote={setStepNote}
                setNote={setNote}
                setField={setField}
                addProjectFiles={addProjectFiles}
                removeProjectFile={removeProjectFile}
                addOrder={addOrder}
                updateOrder={updateOrder}
                removeOrder={removeOrder}
                tasks={state.tasks}
                addTask={addTask}
                updateTask={updateTask}
                removeTask={removeTask}
                onSwitchStream={(s) => setLens(s)}
                onBack={() => setSelectedId(null)}
                onDelete={() => {
                  deleteProject(selected.id)
                  setSelectedId(null)
                }}
              />
            ) : (
              // No selection → the current lens's action dashboard fills the pane.
              <Dashboard
                stream={lens}
                projects={projects}
                getProjectState={getProjectState}
                onSelect={setSelectedId}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default App
