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
import { useState } from 'react'
import './App.css'
import type { Stream } from './types'
import { useProjects } from './hooks/useProjects'
import { supabase, hasSupabase } from './lib/supabase'
import { daysUntilDue, dueSoonTasks, waitingOnTasks } from './lib/tasks'
import { useTheme } from './hooks/useTheme'
import { useDensity } from './hooks/useDensity'
import ProjectList from './components/ProjectList'
import BatchApply from './components/BatchApply'
import Detail from './components/Detail'
import Today from './components/Today'
import TasksView from './components/TasksView'
import TemplatesView from './components/TemplatesView'
import ExportImport from './components/ExportImport'
import AddProject from './components/AddProject'
import QuickAdd from './components/QuickAdd'

/** A top-level view. 'settings' is reached via the 🛠 header button, not a tab. */
type View = 'today' | 'tasks' | 'projects' | 'settings'

// The three top tabs. Pure config.
const TABS: { key: View; label: string }[] = [
  { key: 'today', label: '🏠 Today' },
  { key: 'tasks', label: '✓ Tasks' },
  { key: 'projects', label: '🏗️ Projects' },
]

function App() {
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
    addOrder,
    updateOrder,
    removeOrder,
    addTask,
    updateTask,
    removeTask,
    setTemplate,
    replaceState,
  } = useProjects()

  // Dark mode (persists per device — see hooks/useTheme.ts).
  const { theme, toggle: toggleTheme } = useTheme()
  // Compact/comfortable spacing (same pattern as dark mode).
  const { density, toggle: toggleDensity } = useDensity()

  // Shared UI state, lifted up to App:
  const [tab, setTab] = useState<View>('today') // default = the command center
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false) // is the Add form open?
  const [applying, setApplying] = useState(false) // is ⚡ Batch Apply open?
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
          {/* 🛠 templates & settings */}
          <button
            className={tab === 'settings' ? 'act' : ''}
            onClick={() => {
              setTab('settings')
              setSelectedId(null)
            }}
            title="Templates & settings"
          >
            🛠
          </button>
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

      {tab === 'settings' && (
        <TemplatesView
          templates={state.templates}
          setTemplate={setTemplate}
          sampleProject={projects.find((p) => p.listStatus !== 'CO') ?? projects[0]}
          getProjectState={getProjectState}
        />
      )}

      {tab === 'projects' &&
        (applying ? (
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
          // The Landing: a cross-project capture bar + the searchable list of every house.
          <div className="projects-landing">
            <QuickAdd projects={projects} getProjectState={getProjectState} addOrder={addOrder} />
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
              getProjectState={getProjectState}
            />
          </div>
        ))}
    </div>
  )
}

export default App
