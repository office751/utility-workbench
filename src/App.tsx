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
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import QuickAdd from './components/QuickAdd'
// Code-splitting: the rare / heavy screens load on demand (their own chunks)
// instead of bloating the first paint. Today/Tasks/ProjectList stay eager (the
// landing surfaces). Each lazy() screen renders inside the <Suspense> below.
const BatchApply = lazy(() => import('./components/BatchApply'))
const StatusReport = lazy(() => import('./components/StatusReport'))
const Detail = lazy(() => import('./components/Detail'))
import Today from './components/Today'
import TasksView from './components/TasksView'
const ModelsView = lazy(() => import('./components/ModelsView'))
const InspectionsView = lazy(() => import('./components/InspectionsView'))
const TemplatesView = lazy(() => import('./components/TemplatesView'))
const SelectionsCatalogEditor = lazy(() => import('./components/SelectionsCatalogEditor'))
import ExportImport from './components/ExportImport'
const AddProject = lazy(() => import('./components/AddProject'))
import InvestorInbox from './components/InvestorInbox'
import { publishInvestorSnapshots } from './lib/investorPublish'
import { ROLES, type AppRole } from './data/roles'
const PeopleView = lazy(() => import('./components/PeopleView'))
const VendorsView = lazy(() => import('./components/VendorsView'))
const VendorsEditor = lazy(() => import('./components/VendorsEditor'))
import { VENDORS, orderMailto } from './data/vendors'
import { collectPendingOrders } from './lib/orders'
import { modelKey } from './data/models'
const UtilitiesEditor = lazy(() => import('./components/UtilitiesEditor'))
const CustomMaterialsEditor = lazy(() => import('./components/CustomMaterialsEditor'))
const GuideView = lazy(() => import('./components/GuideView'))

/** A top-level view. 'settings' (🛠), 'people' (👥), 'vendors' (🚚), and 'guide'
 *  (📖) are header buttons, not tabs. */
type View = 'today' | 'tasks' | 'projects' | 'models' | 'inspections' | 'settings' | 'people' | 'vendors' | 'guide'

// The top nav tabs. Pure config. `label` is the pill text (no emoji — the
// Calm Canvas header keeps the nav clean); `icon` is kept for reference.
// Inspections was demoted OUT of the top nav (July 2026 declutter — Adam
// checks the county portal for that); the screen still exists behind the
// More menu, so nothing was lost, just quieted.
const TABS: { key: View; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'projects', label: 'Projects' },
  { key: 'models', label: 'Models' },
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

function App({ role = 'admin', me = '' }: { role?: AppRole; me?: string }) {
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
    dismissInspection,
    setModelTakeoff,
    setModelOrderList,
    addModelFiles,
    removeModelFile,
    setModelInfo,
    addOrder,
    seedStandardOrders,
    updateOrder,
    removeOrder,
    setSelection,
    setAdditionalRequests,
    lockSelections,
    unlockSelections,
    addTask,
    updateTask,
    removeTask,
    setStepList,
    resetStepList,
    updateProjectFacts,
    setTemplate,
    setAssignees,
    requestScan,
    setSelectionsCatalog,
    setVendors,
    setUtilities,
    setCustomOrderCategories,
    renameCustomCategory,
    replaceState,
    saveState,
    saveNow,
  } = useProjects()

  // Effective vendors directory: the owner-edited list from the blob, or the
  // code defaults until first save (migrate seeds it; the ?? is defensive).
  const vendors = state.vendors ?? VENDORS
  // Effective extra-utilities roster: same fallback shape as vendors above
  // (migrate seeds state.utilities to [] on first run; this ?? is defensive).
  const utilities = state.utilities ?? []

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
  // The 🏠 Today tab badge: hard construction DEADLINES only (permit expiry,
  // shut-offs, blocked takeoffs) — matching what the slimmed Today screen
  // actually shows (July 2026). Gone-quiet stalls surface on each project's
  // Overview instead. Tasks have their own badge above, so the two never
  // double-count. Red when anything is critical.
  const todayFires = ac.attention.filter((i) => i.kind !== 'stale')
  const todayBadge = {
    count: todayFires.length,
    fire: todayFires.some((i) => i.severity === 'crit'),
  }

  return (
    <div className="app">
      <header className="app-header">
        {/* ★ Lodestar brand lockup (Calm Canvas). Screen-reader notes: the ★ is
            decorative (aria-hidden skips it — otherwise it reads as "black
            star"), and the sr-only span speaks the same tagline the mouse
            tooltip shows, since title="" alone isn't reliably announced. */}
        <div className="brand-lockup" title="Lodestar — your command center">
          <span className="brand-star" aria-hidden="true">★</span>
          <span className="brand-word">Lodestar</span>
          <span className="sr-only"> — your command center</span>
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
          <button className="icon-btn" onClick={toggleTheme} title="Toggle dark mode" aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
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
            {/* Demoted from the top nav (July 2026) — the cross-project
                inspection feed, one click away for whoever still wants it. */}
            {roleCfg.tabs.includes('inspections') && (
              <button
                className="menu-item"
                onClick={() => {
                  setTab('inspections')
                  setSelectedId(null)
                }}
              >
                🔍 Inspections
              </button>
            )}
            <button
              className="menu-item"
              onClick={() => {
                setTab('vendors')
                setSelectedId(null)
              }}
            >
              🚚 Vendors
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setTab('guide')
                setSelectedId(null)
              }}
            >
              📖 Guide
            </button>
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

      <Suspense fallback={<div className="lazy-load">Loading…</div>}>
      {tab === 'today' && (
        <>
          {/* Unread investor messages float to the top of the day. */}
          <InvestorInbox roster={projects} />
          <Today
          ac={ac}
          tasks={state.tasks}
          me={me}
          scanMeta={state.scanMeta}
          onRequestScan={requestScan}
          onOpen={openProject}
          onCompleteTask={(id) => updateTask(id, { done: true, doneAt: new Date().toISOString() })}
          onGoTasks={() => setTab('tasks')}
          />
        </>
      )}

      {tab === 'tasks' &&
        (() => {
          // Build the cross-project "to order" list and enrich each with its
          // one-click order email (same draft as the Materials tab's ✉️ button).
          // Computed here (only when the Tasks tab is open) so TasksView stays a
          // dumb renderer. projById avoids an O(n²) find per pending order.
          const projById = new Map(projects.map((p) => [p.id, p]))
          const pending = collectPendingOrders(projects, getProjectState).map((po) => {
            const proj = projById.get(po.projectId)
            const ps = getProjectState(po.projectId)
            const draft = proj
              ? orderMailto(vendors, po.category, proj, ps, state.templates, state.modelOrderLists?.[modelKey(proj.model)])
              : null
            return { ...po, mailto: draft?.href ?? null, vendorName: draft?.vendor.name ?? null }
          })
          return (
            <TasksView
              tasks={state.tasks}
              addTask={addTask}
              updateTask={updateTask}
              removeTask={removeTask}
              me={me}
              assignees={state.assignees ?? []}
              pendingOrders={pending}
              onOpenOrder={(id) => openProject(id, 'materials')}
              onMarkOrdered={(id, orderId) => updateOrder(id, orderId, { status: 'ordered' })}
            />
          )
        })()}

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

      {tab === 'people' && roleCfg.canManageUsers && (
        <PeopleView roster={projects} assignees={state.assignees ?? []} setAssignees={setAssignees} />
      )}

      {tab === 'vendors' && <VendorsView vendors={vendors} />}

      {tab === 'guide' && <GuideView />}

      {tab === 'settings' && (
        <>
          <TemplatesView
            templates={state.templates}
            setTemplate={setTemplate}
            assignees={state.assignees ?? []}
            setAssignees={setAssignees}
            sampleProject={projects.find((p) => p.listStatus !== 'CO') ?? projects[0]}
            getProjectState={getProjectState}
          />
          <SelectionsCatalogEditor catalog={state.selectionsCatalog} onSave={setSelectionsCatalog} vendors={vendors} />
          <VendorsEditor vendors={vendors} onSave={setVendors} />
          <UtilitiesEditor utilities={utilities} onSave={setUtilities} />
          <CustomMaterialsEditor
            categories={state.customOrderCategories ?? []}
            projects={state.projects}
            onSave={setCustomOrderCategories}
            onRename={renameCustomCategory}
          />
        </>
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
            utilities={utilities}
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
            // THIS house's attention items (deadlines + gone-quiet stalls) —
            // the per-project home of what the slimmed Today no longer lists.
            alerts={ac.attention.filter((i) => i.projectId === selected.id)}
            // Whether this login's role can open 📐 Models — the Materials
            // missing-takeoffs banner words its advice differently for a
            // coworker, whose tab set doesn't include that screen.
            canSeeModels={roleCfg.tabs.includes('models')}
            tasks={state.tasks}
            templates={state.templates}
            modelTakeoffs={state.modelTakeoffs}
            modelOrderLists={state.modelOrderLists}
            customOrderCategories={state.customOrderCategories}
            selectionsCatalog={state.selectionsCatalog}
            vendors={vendors}
            utilities={utilities}
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
            seedStandardOrders={seedStandardOrders}
            setSelection={setSelection}
            setAdditionalRequests={setAdditionalRequests}
            lockSelections={lockSelections}
            unlockSelections={unlockSelections}
            addTask={addTask}
            updateTask={updateTask}
            removeTask={removeTask}
            dismissNotification={dismissNotification}
            dismissInspection={dismissInspection}
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
          // The Landing: a cross-project Quick-Add capture bar above the
          // searchable list of every house. The bar lets ANYONE drop in
          // "ready to order" items from ANY device — type "almond slab" or
          // paste a whole block (one house per line) and it matches the house +
          // item and files it as "To order", skipping anything already on order.
          // This is the device-independent intake path: Carey works from a
          // Windows machine and can't run the Mac-only Messages scanner, so the
          // scanner is now just Adam's convenience — this bar is how orders
          // actually get captured. Restored June 2026 (it was dropped in the
          // Calm-Canvas redesign; only this mount was removed — the parser and
          // CSS survived).
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
              onStatusReport={() => setReporting(true)}
              getProjectState={getProjectState}
            />
          </div>
        ))}
      </Suspense>
    </div>
  )
}

export default App
