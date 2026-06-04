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
import { useTheme } from './hooks/useTheme'
import { useDensity } from './hooks/useDensity'
import { useResizableSidebar } from './hooks/useResizableSidebar'
import ProjectList from './components/ProjectList'
import Detail from './components/Detail'
import Dashboard from './components/Dashboard'
import ExportImport from './components/ExportImport'
import AddProject from './components/AddProject'
import QuickAdd from './components/QuickAdd'

// The tabs. Pure config, so adding a tab = adding a line.
const TABS: { key: Stream; label: string }[] = [
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
    replaceState,
  } = useProjects()

  // Dark mode (persists per device — see hooks/useTheme.ts).
  const { theme, toggle: toggleTheme } = useTheme()

  // Compact/comfortable spacing (same pattern as dark mode).
  const { density, toggle: toggleDensity } = useDensity()

  // Draggable list/detail divider; remembers its width.
  const { width: sidebarWidth, layoutRef, startDrag } = useResizableSidebar()

  // Shared UI state, lifted up to App:
  const [tab, setTab] = useState<Stream>('electric')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false) // is the Add form open?

  // The roster now lives in saved state (so added projects persist).
  const projects = state.roster

  // Find the selected project object (or undefined if nothing selected).
  const selected = projects.find((p) => p.id === selectedId)

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
              // Switching tabs also clears the selection, so each tab
              // greets you with its own dashboard (same as the old tool).
              onClick={() => {
                setTab(t.key)
                setSelectedId(null)
              }}
            >
              {t.label}
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
        </nav>
      </header>

      {/* The Quick-Add capture bar — only on the Materials tab. */}
      {tab === 'materials' && <QuickAdd projects={projects} addOrder={addOrder} />}

      {/* The layout is a 3-column grid: list | drag-handle | detail.
          We set the FIRST column's width through a CSS variable (--sidebar-w)
          rather than hard-coding it, so the dragging hook can change it live
          and the responsive "stack on narrow screens" rule in App.css can
          still override it. The `as CSSProperties` cast just tells TypeScript
          we know a custom --variable is allowed here. */}
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
    </div>
  )
}

export default App
