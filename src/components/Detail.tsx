/**
 * Detail.tsx — the right-hand panel for ONE project, on the current tab.
 *
 * Two layers:
 *   1. A thin shared shell: back button, ⚙️ gear, address, notes, delete.
 *   2. One read-only "body" per stream (Electric/Water/Septic/Permit) showing
 *      a one-line config SUMMARY, the checklist, action buttons, and alerts.
 *
 * All the EDITABLE config (utility, engineer, water source, septic type,
 * permit responsible/links/dates) now lives behind the ⚙️ gear, in
 * ProjectSettings.tsx — so the everyday view stays clean and the raw links
 * stay hidden until you open settings.
 */
import { useState } from 'react'
import type { OrderItem, OrderStatus, Project, ProjectState, Stream, Task } from '../types'
import { ELECTRIC_STEPS, PERMIT_STEPS, septicStepsFor, waterStepsFor } from '../data/lifecycles'
import {
  engineerOf,
  isElectricDone,
  isPermitDone,
  isSepticDone,
  isWaterDone,
  needsVerify,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  permitCountyStatusOf,
  permitIssuedOf,
  permitPortalOf,
  permitResponsibleOf,
  septicSourceOf,
  septicSystemOf,
  serviceTypeOf,
  sharepointFolderOf,
  utilityOf,
  waterSourceOf,
} from '../lib/nextAction'
import { shutoffFor } from '../lib/shutoff'
import { permitExpiresOf, permitExpiryFor } from '../lib/permitExpiry'
import { isMaterialsDone, ordersSummary } from '../lib/orders'
import { GEORGES } from '../data/contacts'
import Checklist from './Checklist'
import ContactLinks from './ContactLinks'
import DocumentsBox from './DocumentsBox'
import PermitReviewItems from './PermitReviewItems'
import PermitNotifications from './PermitNotifications'
import ProjectSettings from './ProjectSettings'
import MaterialsBody from './MaterialsBody'

/** The updater functions every body needs — grouped to avoid repetition. */
interface Updaters {
  toggleStep: (id: number, stream: Stream, stepId: string, done: boolean) => void
  setStepNote: (id: number, stream: Stream, stepId: string, note: string) => void
  setNote: (id: number, stream: Stream, text: string) => void
  setField: <K extends keyof ProjectState>(id: number, field: K, value: ProjectState[K]) => void
  addProjectFiles: (id: number, files: File[]) => Promise<{ ok: number; failed: string[] }>
  removeProjectFile: (id: number, index: number) => void
  addOrder: (id: number, order: { category: string; status: OrderStatus }) => void
  updateOrder: (id: number, orderId: string, patch: Partial<OrderItem>) => void
  removeOrder: (id: number, orderId: string) => void
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'done' | 'doneAt'>) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
  dismissNotification: (id: number, sourceKey: string) => void
}

/** A tab in the project workspace: the Overview summary, or one stream. */
type DetailTab = 'overview' | Stream

interface Props extends Updaters {
  project: Project
  ps: ProjectState
  tasks: Task[]
  /** Custom email wording from ⚙️ Settings → Templates. */
  templates?: Record<string, import('../types').TemplateOverride>
  /** Stream tab to open on (from a Today/Tasks deep-link). Default: Overview. */
  initialStream?: Stream
  onBack: () => void
  /** Permanently remove this project (App deletes + returns to the list). */
  onDelete: () => void
}

const NOTE_LABEL: Record<Stream, string> = {
  electric: 'Electric notes',
  water: 'Water notes',
  septic: 'Septic / sewer notes',
  permit: 'Permit notes',
  materials: 'Materials / order notes',
}

// Small label lookups for the read-only summaries.
const SERVICE_LABEL: Record<string, string> = { OH: 'Overhead', UG: 'Underground', '': 'service?' }
const WATER_LABEL: Record<string, string> = {
  Well: 'Well',
  City: 'City Water',
  CityWM: 'City Water + main ext.',
  '': 'source?',
}

/** The five streams, for the per-project overview strip at the top of Detail. */
const STREAM_TABS: { key: Stream; icon: string; name: string }[] = [
  { key: 'electric', icon: '⚡', name: 'Electric' },
  { key: 'water', icon: '💧', name: 'Water' },
  { key: 'septic', icon: '🚽', name: 'Septic' },
  { key: 'permit', icon: '📋', name: 'Permit' },
  { key: 'materials', icon: '🛒', name: 'Materials' },
]

/** One project's status in a single stream: its next action + whether it's done. */
function streamStatus(key: Stream, p: Project, ps: ProjectState): { label: string; done: boolean } {
  if (key === 'electric') return { label: nextElectricAction(p, ps).label, done: isElectricDone(ps) }
  if (key === 'water') return { label: nextWaterAction(p, ps).label, done: isWaterDone(p, ps) }
  if (key === 'septic') return { label: nextSepticAction(ps).label, done: isSepticDone(ps) }
  if (key === 'permit') return { label: nextPermitAction(ps).label, done: isPermitDone(ps) }
  return { label: ordersSummary(ps), done: isMaterialsDone(ps) }
}

function Detail(props: Props) {
  const { project: p, ps, setField, setNote, onBack, onDelete } = props

  // Which tab is open: the Overview summary, or one stream. Defaults to the
  // deep-linked stream (from Today/Tasks) or Overview.
  const [activeTab, setActiveTab] = useState<DetailTab>(props.initialStream ?? 'overview')
  const [showSettings, setShowSettings] = useState(false)

  return (
    <section className="detail">
      <div className="detail-head">
        <button className="mini back" onClick={onBack}>
          ← All projects
        </button>
        <button
          className={'mini gear' + (showSettings ? ' on' : '')}
          onClick={() => setShowSettings((s) => !s)}
          title="Project settings"
        >
          ⚙️ Settings
        </button>
      </div>

      <h2 className="detail-title">
        {p.address}
        {p.listStatus === 'CO' && <span className="status-pill co">C.O.</span>}
        {p.listStatus === 'Hold' && <span className="status-pill hold">HOLD</span>}
      </h2>
      <p className="meta">
        {p.model} · {p.subdivision} · {p.city}, FL {p.zip} · parcel {p.parcel}
        {p.permit && <> · permit {p.permit}</>}
        {p.workOrder && <> · WO# {p.workOrder}</>}
      </p>

      {/* The workspace tab bar: Overview + the five streams (each shows its status). */}
      <div className="stream-strip">
        <button
          className={'ss-chip' + (activeTab === 'overview' ? ' active' : '')}
          onClick={() => setActiveTab('overview')}
        >
          <span className="ss-name">🏠 Overview</span>
        </button>
        {STREAM_TABS.map(({ key, icon, name }) => {
          const st = streamStatus(key, p, ps)
          return (
            <button
              key={key}
              className={'ss-chip' + (key === activeTab ? ' active' : '') + (st.done ? ' done' : '')}
              onClick={() => setActiveTab(key)}
              title={`${name}: ${st.label}`}
            >
              <span className="ss-name">
                {icon} {name}
                {st.done ? ' ✓' : ''}
              </span>
              <span className="ss-label">{st.label}</span>
            </button>
          )
        })}
      </div>

      {/* The gear panel: all editable config for the whole project. */}
      {showSettings && (
        <ProjectSettings project={p} ps={ps} setField={setField} onClose={() => setShowSettings(false)} />
      )}

      {/* ---- OVERVIEW: at-a-glance status + project-wide things (files, delete) ---- */}
      {activeTab === 'overview' && (
        <div className="overview">
          <div className="overview-cards">
            {STREAM_TABS.map(({ key, icon, name }) => {
              const st = streamStatus(key, p, ps)
              return (
                <button
                  key={key}
                  className={'ov-card' + (st.done ? ' done' : '')}
                  onClick={() => setActiveTab(key)}
                >
                  <div className="ov-card-h">
                    {icon} {name} {st.done ? '✓' : ''}
                  </div>
                  <div className="ov-card-next">{st.label}</div>
                </button>
              )
            })}
          </div>

          {/* Files for this whole project — upload + share by text/email. */}
          <DocumentsBox
            projectId={p.id}
            docs={ps.docs ?? []}
            onAddFiles={(files) => props.addProjectFiles(p.id, files)}
            onRemove={(i) => props.removeProjectFile(p.id, i)}
          />

          {/* Danger zone — confirm() forces a deliberate yes before deleting. */}
          <button
            className="mini danger"
            onClick={() => {
              if (confirm(`Remove ${p.address} and ALL its progress (electric, water, septic, permit)?`)) {
                onDelete()
              }
            }}
          >
            🗑 Remove this project
          </button>
        </div>
      )}

      {/* ---- STREAM tabs: contacts + the stream body + that stream's notes ---- */}
      {activeTab !== 'overview' && (
        <>
          <ContactLinks stream={activeTab} p={p} ps={ps} />

          {activeTab === 'electric' && <ElectricBody {...props} />}
          {activeTab === 'water' && <WaterBody {...props} />}
          {activeTab === 'septic' && <SepticBody {...props} />}
          {activeTab === 'permit' && <PermitBody {...props} />}
          {activeTab === 'materials' && (
            <MaterialsBody
              project={p}
              ps={ps}
              templates={props.templates}
              addOrder={props.addOrder}
              updateOrder={props.updateOrder}
              removeOrder={props.removeOrder}
            />
          )}

          <label className="notes-label">
            {NOTE_LABEL[activeTab]}
            <textarea
              rows={3}
              value={ps.notes[activeTab]}
              onChange={(e) => setNote(p.id, activeTab, e.target.value)}
              placeholder="Anything worth remembering…"
            />
          </label>
        </>
      )}
    </section>
  )
}

/* ==================== ELECTRIC ==================== */

function ElectricBody({ project: p, ps, toggleStep, setStepNote, setField }: Props) {
  const next = nextElectricAction(p, ps)
  const shutoff = shutoffFor(ps)
  const u = utilityOf(p, ps)
  const eng = engineerOf(p, ps)

  return (
    <>
      {needsVerify(p, ps) && (
        <div className="banner">
          ⚠️ Territory not verified — confirm SECO vs Duke before applying
          (subdivision: {p.subdivision}). Set the utility in ⚙️ Settings.
        </div>
      )}

      {/* Read-only config summary — edit these in ⚙️ Settings. */}
      <p className="summary">
        ⚡ {u || 'utility?'} · {SERVICE_LABEL[serviceTypeOf(p, ps)]} · Engineer: {eng || '—'}
      </p>

      <p className="next-line">
        Next: <b>{next.label}</b>
      </p>

      <Checklist
        projectId={p.id}
        stream="electric"
        steps={ELECTRIC_STEPS}
        ps={ps}
        toggleStep={toggleStep}
        setStepNote={setStepNote}
      />

      {/* Closing date + shut-off reminder stay here — they're sale workflow,
          not project config. */}
      <div className="closing">
        <label>
          Closing date
          <input
            type="date"
            value={ps.closingDate ?? ''}
            onChange={(e) => setField(p.id, 'closingDate', e.target.value)}
          />
        </label>

        {shutoff && (
          <span className={'shutoff' + (shutoff.daysLeft <= 7 ? ' due' : shutoff.daysLeft <= 14 ? ' warn' : '')}>
            ⏰ Shut off / transfer electric by <b>{shutoff.date}</b> ({shutoff.daysLeft} days)
          </span>
        )}

        {ps.closingDate && (
          <label className="transfer">
            <input
              type="checkbox"
              checked={ps.transferred ?? false}
              onChange={(e) => setField(p.id, 'transferred', e.target.checked)}
            />
            Account transferred / shut off ✓
          </label>
        )}
      </div>
    </>
  )
}

/* ===================== WATER ===================== */

function WaterBody({ project: p, ps, toggleStep, setStepNote }: Props) {
  const source = waterSourceOf(p, ps)
  const next = nextWaterAction(p, ps)

  return (
    <>
      <p className="summary">💧 {WATER_LABEL[source]}</p>

      {source === 'CityWM' && (
        <div className="flag">
          🛠 Water-main extension required — agreement, fees, and construction
          come before the tap/meter.
        </div>
      )}

      {/* No source yet → no checklist to show. */}
      {!source ? (
        <div className="flag">Set the water source in ⚙️ Settings to load its checklist.</div>
      ) : (
        <>
          <p className="next-line">
            Next: <b>{next.label}</b>
          </p>
          <Checklist
            projectId={p.id}
            stream="water"
            steps={waterStepsFor(p, ps)}
            ps={ps}
            toggleStep={toggleStep}
            setStepNote={setStepNote}
          />
        </>
      )}
    </>
  )
}

/* ================= SEPTIC / SEWER ================= */

function SepticBody({ project: p, ps, toggleStep, setStepNote }: Props) {
  const source = septicSourceOf(ps)
  const system = septicSystemOf(ps)
  const next = nextSepticAction(ps)

  return (
    <>
      <p className="summary">
        🚽 {source === 'Sewer' ? 'City Sewer' : 'Septic'}
        {source === 'Septic' && system && <> · {system}</>}
      </p>

      {source === 'Septic' && (
        <p className="provider">
          Private provider: {GEORGES.name} · {GEORGES.contact} · {GEORGES.phone}
        </p>
      )}

      {/* The INRB conditional: picking INRB (in ⚙️ Settings) adds a step to the
          checklist (see septicStepsFor in lifecycles.ts) — this flag explains why. */}
      {source === 'Septic' && system === 'INRB' && (
        <div className="flag">
          📄 INRB system — a recorded INRB notice must be sent to Georges
          Plumbing (it appears as a checklist step below).
        </div>
      )}

      <p className="next-line">
        Next: <b>{next.label}</b>
      </p>

      <Checklist
        projectId={p.id}
        stream="septic"
        steps={septicStepsFor(ps)}
        ps={ps}
        toggleStep={toggleStep}
        setStepNote={setStepNote}
      />
    </>
  )
}

/* ===================== PERMITTING ===================== */

function PermitBody({ project: p, ps, toggleStep, setStepNote, tasks, addTask, updateTask, removeTask, dismissNotification }: Props) {
  const next = nextPermitAction(ps)
  const folder = sharepointFolderOf(p, ps) // hidden link — opened via the button below
  const permitUrl = permitPortalOf(p, ps)
  const expiry = permitExpiryFor(p, ps)
  const countyStatus = permitCountyStatusOf(p)
  const issued = permitIssuedOf(p, ps)
  const expires = permitExpiresOf(p, ps)

  return (
    <>
      {/* 🔔 FYI notifications the portal scanner pulled in (dismissible). */}
      <PermitNotifications
        notes={ps.notifications ?? []}
        onDismiss={(sk) => dismissNotification(p.id, sk)}
      />

      {/* Read-only summary — edit responsible / links / dates in ⚙️ Settings. */}
      <p className="summary">
        📋 Responsible: {permitResponsibleOf(ps)}
        {countyStatus && <> · County: {countyStatus}</>}
        {issued && <> · Issued {issued}</>}
        {expires && <> · Expires {expires}</>}
      </p>

      {/* Quick-open links — the URL itself stays hidden; you just click to open.
          encodeURI handles spaces in SharePoint folder names. */}
      {(folder || permitUrl) && (
        <div className="contact-row">
          {folder && (
            <a className="contact" href={encodeURI(folder)} target="_blank" rel="noreferrer">
              📁 Open project folder
            </a>
          )}
          {permitUrl && (
            <a className="contact" href={permitUrl} target="_blank" rel="noreferrer">
              🔗 Open permit record
            </a>
          )}
        </div>
      )}

      {/* Expiry reminder (only when a date is known), colored by urgency. */}
      {expiry && (
        <p className={'shutoff' + (expiry.daysLeft <= 7 ? ' due' : expiry.daysLeft <= 30 ? ' warn' : '')}>
          {expiry.daysLeft < 0 ? (
            <>⏰ Permit EXPIRED <b>{expiry.date}</b> ({-expiry.daysLeft} days ago)</>
          ) : (
            <>⏰ Permit expires <b>{expiry.date}</b> ({expiry.daysLeft} days)</>
          )}
        </p>
      )}

      <p className="next-line">
        Next: <b>{next.label}</b>
      </p>

      <Checklist
        projectId={p.id}
        stream="permit"
        steps={PERMIT_STEPS}
        ps={ps}
        toggleStep={toggleStep}
        setStepNote={setStepNote}
      />

      <PermitReviewItems
        projectId={p.id}
        tasks={tasks}
        addTask={addTask}
        updateTask={updateTask}
        removeTask={removeTask}
      />
    </>
  )
}

export default Detail
