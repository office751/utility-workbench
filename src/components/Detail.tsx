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
import { useEffect, useState } from 'react'
import type { OrderItem, OrderStatus, Project, ProjectState, SelectionChoice, SelectionsCatalog, Stream, Task } from '../types'
import {
  type StepDef,
  electricSteps,
  isStepListCustomized,
  permitSteps,
  septicStepsFor,
  stepListKey,
  stepsFor,
  waterStepsFor,
} from '../data/lifecycles'
import StepEditor from './StepEditor'
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
import { permitExpiryFor } from '../lib/permitExpiry'
import { permitHandoffDraft, permitHandoffDraftWithLinks, type HandoffDraft } from '../lib/permitHandoff'
import { confirmSend } from '../lib/confirmSend'
import { DUKE_PORTAL_URL, dukeWebPayloadText, dukeWebPayloadTextWithDirections } from '../lib/dukeWebApply'
import { meterNotifyDraft } from '../lib/loadForm'
import { getShareUrl } from '../lib/files'
import { grantedProjectIds, shareFileToInvestor } from '../lib/investor'
import { writeRichClipboard } from '../lib/richCopy'
import { isMaterialsDone, ordersSummary } from '../lib/orders'
import { GEORGES } from '../data/contacts'
// SECO's real load form, pre-filled from this project — same helper Batch
// Apply uses (lib/secoForm.ts); this just adds a second place to download it.
import { SECO_BLANK_FORM_URL, fillSecoLoadForm } from '../lib/secoForm'
// Duke's load form (Residential Service Information Form), generated pre-filled
// so Adam can attach it to the WO# reply instead of retyping Duke's blank.
import { fillDukeLoadForm } from '../lib/dukeForm'
import Checklist from './Checklist'
import ContactLinks from './ContactLinks'
import DocumentsBox from './DocumentsBox'
import PermitReviewItems from './PermitReviewItems'
import PermitNotifications from './PermitNotifications'
import InvestorCuration from './InvestorCuration'
import ProjectSettings from './ProjectSettings'
import MaterialsBody from './MaterialsBody'
import SelectionsView from './SelectionsView'
import Icon from './Icon'
import GuideCallout from './GuideCallout'

/** The updater functions every body needs — grouped to avoid repetition. */
interface Updaters {
  toggleStep: (id: number, stream: Stream, stepId: string, done: boolean) => void
  setStepNote: (id: number, stream: Stream, stepId: string, note: string) => void
  setNote: (id: number, stream: Stream, text: string) => void
  setField: <K extends keyof ProjectState>(id: number, field: K, value: ProjectState[K]) => void
  addProjectFiles: (id: number, files: File[]) => Promise<{ ok: number; failed: string[] }>
  removeProjectFile: (id: number, index: number) => void
  addOrder: (id: number, order: { category: string; status: OrderStatus; orderedOn?: string }) => void
  updateOrder: (id: number, orderId: string, patch: Partial<OrderItem>) => void
  removeOrder: (id: number, orderId: string) => void
  /** Seed the model's standard order categories on an empty Materials tab. */
  seedStandardOrders: (id: number) => void
  setSelection: (id: number, area: 'interior' | 'exterior', categoryId: string, choice: SelectionChoice) => void
  setAdditionalRequests: (id: number, text: string) => void
  lockSelections: (id: number, signature: string, printedName: string) => void
  unlockSelections: (id: number) => void
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'done' | 'doneAt'>) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
  dismissNotification: (id: number, sourceKey: string) => void
  /** Hide one flagged inspection result (tombstone, not delete — see useProjects). */
  dismissInspection: (id: number, sourceKey: string) => void
  /** Save / clear the GLOBAL step list for a stream-variant key (the step editor). */
  setStepList: (key: string, steps: StepDef[]) => void
  resetStepList: (key: string) => void
  /** Edit this project's core roster facts (address, model, parcel, permit…). */
  updateProjectFacts: (id: number, patch: Partial<Project>) => void
}

/** A tab in the project workspace: Overview, the homeowner Selections, or one
 *  stream. 'selections' is deliberately NOT a Stream (it has no checklist /
 *  notes bucket), so it's rendered in its own branch below. */
type DetailTab = 'overview' | 'selections' | Stream

interface Props extends Updaters {
  project: Project
  ps: ProjectState
  tasks: Task[]
  /** Custom email wording from ⚙️ Settings → Templates. */
  templates?: Record<string, import('../types').TemplateOverride>
  /** Per-model takeoff status + order lists (⚙️ Settings → Takeoffs). */
  modelTakeoffs?: import('../types').WorkbenchState['modelTakeoffs']
  modelOrderLists?: import('../types').WorkbenchState['modelOrderLists']
  /** Owner-added custom material categories — extends the Materials picker. */
  customOrderCategories?: string[]
  /** Owner-editable Selections catalog (Settings → Selections setup). */
  selectionsCatalog?: SelectionsCatalog
  /** Whether this role's tabs include 📐 Models — decides how the Materials
   *  missing-takeoffs banner phrases its "go gather them" advice. */
  canSeeModels: boolean
  /** Owner-editable vendors directory (Settings → Vendor setup). */
  vendors: import('../data/vendors').Vendor[]
  /** Owner-editable EXTRA utility companies (Settings → Utility companies setup) —
   *  for territories not covered by SECO/Duke/Clay/Marion County Utilities/Georges. */
  utilities: import('../data/utilities').UtilityCompany[]
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

/** The Marion County Property Appraiser "Map It+" 2D Parcel Viewer (GIS). */
const MARION_PARCEL_VIEWER =
  'https://experience.arcgis.com/experience/fdebe26ee2fb40758e399cc5447c5809/page/2D-Parcel-Viewer'

/**
 * Build the Map-button link: open this house's PARCEL on the county GIS, zoomed
 * in — not Google Maps driving directions (which kept nagging to open the Maps
 * app and only showed a pin, not parcel/zoning info).
 *
 * How it works: the Map It+ app reads a "selection" off the URL fragment — it
 * filters the parcel layer to `WHERE PARCEL='<id>'` and zooms to the match.
 * The widget + dataSource ids below are fixed for this published app (they came
 * straight from a real selection URL); only the parcel value changes per house.
 * `encodeURIComponent` turns the `where:…:PARCEL='…'` clause into the exact
 * percent-encoded form the app expects (`:`→`%3A`, `=`→`%3D`, leaving `~` and
 * `'` as-is — matching the captured example byte-for-byte).
 *
 * If a house has no parcel yet (e.g. a TBD lot), we just open the viewer
 * un-zoomed rather than feeding it an empty `PARCEL=''` that matches nothing.
 */
function marionParcelMapUrl(parcel: string): string {
  const pid = parcel.trim()
  if (!pid) return MARION_PARCEL_VIEWER
  const selection = `where:widget_28_output_45699390791734507~dataSource_5-192a100c52f-layer-122:PARCEL='${pid}'`
  return `${MARION_PARCEL_VIEWER}#data_s=${encodeURIComponent(selection)}&zoom_to_selection=true`
}

/** The five streams, for the per-project overview strip at the top of Detail.
 *  Icons are Material Symbols ligature names (the design's single icon set). */
const STREAM_TABS: { key: Stream; icon: string; name: string }[] = [
  { key: 'electric', icon: 'bolt', name: 'Electric' },
  { key: 'water', icon: 'water_drop', name: 'Water' },
  { key: 'septic', icon: 'plumbing', name: 'Septic' },
  { key: 'permit', icon: 'description', name: 'Permit' },
  { key: 'materials', icon: 'shopping_cart', name: 'Materials' },
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
  const [editingSteps, setEditingSteps] = useState(false) // step-editor open on the current stream tab
  // Investor portal: does THIS project have an investor grant? (Empty set
  // until the portal schema exists — the curation UI then never appears.)
  const [granted, setGranted] = useState<Set<number>>(new Set())
  const [shareBump, setShareBump] = useState(0) // refresh curation after a share
  useEffect(() => {
    grantedProjectIds().then(setGranted)
  }, [])

  // The one high-level "where this house is right now" badge for the header:
  // the first stream that isn't done yet, with its next action.
  const stageStream = STREAM_TABS.find((s) => !streamStatus(s.key, p, ps).done)
  const headerStage = stageStream
    ? `${stageStream.name} — ${streamStatus(stageStream.key, p, ps).label}`
    : 'All streams complete'

  // Quick-open links for the header (reachable from ANY tab now, not just
  // Permit). Both can be empty — we only render the button when there's a URL.
  // sharepointFolderOf = the project's SharePoint document folder;
  // permitPortalOf = the Marion County permit-record portal link.
  const folder = sharepointFolderOf(p, ps)
  const permitUrl = permitPortalOf(p, ps)

  return (
    <section className="detail">
      {/* ---- Detail header: back · address · sub-line · badges · Map/Settings ---- */}
      <div className="pd-header">
        <button className="btn btn-ghost btn-sm pd-back" onClick={onBack}>
          <Icon name="arrow_back" size={16} />
          All projects
        </button>
        <div className="pd-header-row">
          <div className="pd-header-main">
            <h1 className="pd-addr">{p.address}</h1>
            <div className="pd-sub">
              {p.model} · {p.subdivision} · {p.city}, FL {p.zip} · parcel {p.parcel}
              {p.permit && <> · permit {p.permit}</>}
              {p.workOrder && <> · WO# {p.workOrder}</>}
            </div>
            <div className="pd-badges">
              {p.listStatus === 'CO' && <span className="prow-pill co">C.O.</span>}
              {p.listStatus === 'Hold' && <span className="prow-pill hold">HOLD</span>}
              {ps.isInvestorProject ? (
                <span className="pd-badge investor">
                  <Icon name="person" size={14} />
                  Investor: {ps.investorName || 'name not set'}
                </span>
              ) : (
                <span className="pd-badge">
                  <Icon name="domain" size={14} />
                  {ps.ownerName || 'Iron Shield Construction'} · spec build
                </span>
              )}
              <span className="pd-badge accent">
                <Icon name="arrow_right_alt" size={14} />
                {headerStage}
              </span>
            </div>
          </div>
          <div className="pd-header-actions">
            {/* Map → the Marion County GIS 2D Parcel Viewer, zoomed to this
                parcel (see marionParcelMapUrl up top) — replaces Google Maps,
                which nagged to open the app and only gave directions, not
                parcel info. */}
            <a
              className="btn btn-secondary"
              href={marionParcelMapUrl(p.parcel)}
              target="_blank"
              rel="noreferrer"
              title="Open this parcel on the Marion County GIS parcel viewer"
            >
              <Icon name="map" size={18} />
              Map
            </a>
            {/* Project Documents (was the Permit tab's "Open project folder") and
                Permit Portal (was "Open permit record") — moved up here so they're
                reachable from any tab, not just the Permit tab. Each renders only
                when its URL exists. Styled like the Map/Settings header buttons. */}
            {folder && (
              <a
                className="btn btn-secondary"
                href={encodeURI(folder)}
                target="_blank"
                rel="noreferrer"
                title="Open this project's SharePoint document folder"
              >
                <Icon name="folder" size={18} />
                Project Documents
              </a>
            )}
            {permitUrl && (
              <a
                className="btn btn-secondary"
                href={permitUrl}
                target="_blank"
                rel="noreferrer"
                title="Open the Marion County permit record"
              >
                <Icon name="link" size={18} />
                Permit Portal
              </a>
            )}
            <button
              className={'btn btn-secondary' + (showSettings ? ' on' : '')}
              onClick={() => setShowSettings((s) => !s)}
              title="Project settings"
            >
              <Icon name="settings" size={18} />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Tab strip — navigation ONLY (status lives in the Overview cards, once). */}
      <div className="pd-tabs">
        <button
          className={'pd-tab' + (activeTab === 'overview' ? ' active' : '')}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        {STREAM_TABS.map(({ key, name }) => (
          <button
            key={key}
            className={'pd-tab' + (key === activeTab ? ' active' : '')}
            onClick={() => setActiveTab(key)}
          >
            {name}
          </button>
        ))}
        <button
          className={'pd-tab' + (activeTab === 'selections' ? ' active' : '')}
          onClick={() => setActiveTab('selections')}
        >
          Selections
        </button>
      </div>

      {/* The gear panel: all editable config for the whole project. */}
      {showSettings && (
        <ProjectSettings
          project={p}
          ps={ps}
          setField={setField}
          updateFacts={props.updateProjectFacts}
          utilities={props.utilities}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ---- OVERVIEW: at-a-glance status + project-wide things (files, delete) ---- */}
      {activeTab === 'overview' && (
        <div className="overview">
          {/* Status grid — ONE card per stream, the single source of truth.
              (The tabs above are navigation only — no duplicate status marks.) */}
          <div className="pd-status-grid">
            {STREAM_TABS.map(({ key, icon, name }) => {
              const st = streamStatus(key, p, ps)
              const color = st.done ? 'var(--success)' : 'var(--rust)'
              return (
                <button key={key} className="pd-scard" onClick={() => setActiveTab(key)}>
                  <div className="pd-scard-h">
                    <Icon name={icon} size={18} color={color} fill={st.done} />
                    <span className="pd-scard-name">{name}</span>
                    <span className="pd-scard-spacer" />
                    {st.done ? (
                      <Icon name="check_circle" size={16} color="var(--success)" fill />
                    ) : (
                      <span className="pd-scard-prog">In progress</span>
                    )}
                  </div>
                  <div className="pd-scard-status">{st.label}</div>
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
            onShareInvestor={
              granted.has(p.id)
                ? async (doc, caption) => {
                    const row = await shareFileToInvestor(p.id, doc, caption)
                    if (row) setShareBump((b) => b + 1)
                    return !!row
                  }
                : undefined
            }
          />

          {/* What the investor sees + their questions (granted projects only). */}
          {granted.has(p.id) && <InvestorCuration projectId={p.id} refreshKey={shareBump} />}

          {/* Danger zone — confirm() forces a deliberate yes before deleting. */}
          <div className="pd-footer">
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (confirm(`Remove ${p.address} and ALL its progress (electric, water, septic, permit)?`)) {
                  onDelete()
                }
              }}
            >
              <Icon name="delete" size={16} />
              Remove this project
            </button>
          </div>
        </div>
      )}

      {/* ---- SELECTIONS: homeowner finish choices. Its OWN branch — NOT a
              Stream, so it skips the ContactLinks / step-editor / notes block. ---- */}
      {activeTab === 'selections' && (
        <SelectionsView
          project={p}
          ps={ps}
          setSelection={props.setSelection}
          setAdditionalRequests={props.setAdditionalRequests}
          lockSelections={props.lockSelections}
          unlockSelections={props.unlockSelections}
          catalog={props.selectionsCatalog}
          vendors={props.vendors}
        />
      )}

      {/* ---- STREAM tabs: contacts + the stream body + that stream's notes ---- */}
      {activeTab !== 'overview' && activeTab !== 'selections' && (
        <>
          <ContactLinks stream={activeTab} p={p} ps={ps} utilities={props.utilities} />

          {activeTab === 'electric' && <ElectricBody {...props} />}
          {activeTab === 'water' && <WaterBody {...props} />}
          {activeTab === 'septic' && <SepticBody {...props} />}
          {activeTab === 'permit' && <PermitBody {...props} />}
          {activeTab === 'materials' && (
            <MaterialsBody
              project={p}
              ps={ps}
              canSeeModels={props.canSeeModels}
              templates={props.templates}
              modelTakeoffs={props.modelTakeoffs}
              modelOrderLists={props.modelOrderLists}
              customCategories={props.customOrderCategories ?? []}
              vendors={props.vendors}
              addOrder={props.addOrder}
              updateOrder={props.updateOrder}
              removeOrder={props.removeOrder}
              seedStandardOrders={props.seedStandardOrders}
            />
          )}

          {/* Edit the standard checklist for this stream (global, all houses). */}
          {activeTab !== 'materials' &&
            (editingSteps ? (
              <StepEditor
                key={stepListKey(activeTab, p, ps)}
                streamLabel={(() => {
                  const base = STREAM_TABS.find((s) => s.key === activeTab)?.name ?? activeTab
                  // Append the variant (Well / City / Septic-INRB / Sewer) so it's
                  // clear WHICH list you're editing (each variant is its own list).
                  const variant = stepListKey(activeTab, p, ps).split(':')[1]
                  return variant ? `${base} (${variant})` : base
                })()}
                current={stepsFor(activeTab, p, ps)}
                isCustomized={isStepListCustomized(stepListKey(activeTab, p, ps))}
                onSave={(steps) => props.setStepList(stepListKey(activeTab, p, ps), steps)}
                onReset={() => props.resetStepList(stepListKey(activeTab, p, ps))}
                onClose={() => setEditingSteps(false)}
              />
            ) : (
              <button className="btn btn-ghost btn-sm edit-steps-btn" onClick={() => setEditingSteps(true)}>
                <Icon name="edit" size={16} />
                Edit {STREAM_TABS.find((s) => s.key === activeTab)?.name ?? activeTab} steps
              </button>
            ))}

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

function ElectricBody({ project: p, ps, toggleStep, setStepNote, setField, templates }: Props) {
  const next = nextElectricAction(p, ps)
  const shutoff = shutoffFor(ps)
  const u = utilityOf(p, ps)
  const eng = engineerOf(p, ps)
  // ⚡ Duke web application:
  //   building → computing directions from the map services
  //   opened   → portal launched + fill-data copied; now waiting on Claude
  //              to drive the form (a button can't type into Duke's portal)
  //   noclip   → same, but the browser blocked the clipboard write
  const [dukeState, setDukeState] = useState<'idle' | 'building' | 'opened' | 'noclip'>('idle')
  // 📸 Meter-notify email (the green-tag photos the utility needs before a
  // meter set). Same busy-flag idiom as the Duke portal button below.
  const [notifying, setNotifying] = useState(false)
  const [notifyNote, setNotifyNote] = useState<string | null>(null)
  // 📄 SECO load-form download — same busy-flag idiom; true only while the
  // blank PDF is being fetched + filled (it's a network round-trip).
  const [formBusy, setFormBusy] = useState(false)

  /** Copy this project's portal fill-data (JSON) — including computed
   *  turn-by-turn directions from the nearest main road — and open the
   *  Builder Portal. The clipboard payload is what fills the form: Claude
   *  driving the browser reads it from there. The button itself can ONLY
   *  open the portal + stage the data — it cannot fill the form, because
   *  the portal is a separate, logged-in site the app can't reach into.
   *  So we open it, then show a hint telling Adam how to kick off the
   *  Claude-driven fill (and the state stays put instead of flashing away). */
  async function openDukePortal() {
    setDukeState('building')
    let text: string
    try {
      // ~2s: geocode + nearest main road + route (OSM/OSRM, see directions.ts)
      text = await dukeWebPayloadTextWithDirections(p, ps)
    } catch {
      text = dukeWebPayloadText(p, ps) // offline → no directions, still fills
    }
    let copied = false
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      // clipboard refused — `copied` stays false; portal still opens
    }
    window.open(DUKE_PORTAL_URL, '_blank', 'noopener')
    setDukeState(copied ? 'opened' : 'noclip')
  }

  /** Draft the "home is ready for the meter set" email — with the photo
   *  checklist the utility asks for — to SECO Engineering or the Duke EDA
   *  office. mailto only; no project data is mutated. */
  function notifyReadyForMeter() {
    const draft = meterNotifyDraft(p, ps, templates)
    if (!draft) {
      setNotifyNote('⚠️ Set the utility (SECO or Duke) first.')
      return
    }
    if (
      !confirmSend(`Notify ${draft.to} that ${p.address} is ready for the meter?`, [
        'This email only LISTS the photos (green tag · downpipe · sweep · straps · clear path).',
        'You must ATTACH the actual photos yourself before sending.',
      ])
    )
      return
    setNotifying(true)
    setNotifyNote(`Drafting to ${draft.to}…`)
    window.location.href = draft.mailto
    // Clear the transient note when the busy window ends so "Drafting…" doesn't
    // linger as a stuck message after the mail client has opened.
    setTimeout(() => {
      setNotifying(false)
      setNotifyNote(null)
    }, 1500)
  }

  // SECO: fetch the bundled blank PDF, pre-fill it from THIS project, and
  // download it so Adam can tick the few radio buttons, sign, and attach it.
  // Same logic as BatchApply's downloadSecoForm — just scoped to the single
  // p/ps already in scope here (no getProjectState needed for one house).
  async function downloadSecoForm() {
    setFormBusy(true)
    try {
      const blank = await (await fetch(SECO_BLANK_FORM_URL)).arrayBuffer()
      const bytes = await fillSecoLoadForm(blank, p, ps)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `SECO Load Form - ${p.address}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Couldn't build the SECO form: ${(e as Error).message}`)
    } finally {
      setFormBusy(false)
    }
  }

  // Duke: generate the Residential Service Information Form pre-filled from THIS
  // project and download it, so Adam can attach it to the WO# reply (mailto
  // can't carry an attachment — same download-then-attach flow as SECO).
  async function downloadDukeForm() {
    setFormBusy(true)
    try {
      const bytes = await fillDukeLoadForm(p, ps)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `Duke Load Form - ${p.address}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Couldn't build the Duke form: ${(e as Error).message}`)
    } finally {
      setFormBusy(false)
    }
  }

  return (
    <>
      {needsVerify(p, ps) && (
        <div className="banner">
          <Icon name="warning" size={15} color="var(--warn)" /> Territory not verified — confirm SECO vs Duke before
          applying (subdivision: {p.subdivision}). Set the utility in Settings.
        </div>
      )}

      {/* Read-only config summary — edit these in Settings. */}
      <p className="summary">
        <Icon name="bolt" size={15} color="var(--rust)" /> {u || 'utility?'} ·{' '}
        {SERVICE_LABEL[serviceTypeOf(p, ps)]} · Engineer: {eng || '—'}
      </p>

      {/* Duke applies through a multi-page WEB form, not email — this opens
          the portal and stages the fill data. The actual form-filling is
          done by Claude driving the browser; see the hint shown after. */}
      {u === 'DUKE' && (
        <div className="contact-row">
          <button className="contact" onClick={openDukePortal} disabled={dukeState === 'building'}>
            <Icon name={dukeState === 'building' ? 'hourglass_top' : dukeState === 'idle' ? 'bolt' : 'check'} size={15} />
            {dukeState === 'building'
              ? ' Computing directions + fill data…'
              : dukeState === 'opened' || dukeState === 'noclip'
                ? ' Portal opened — see next step ↓'
                : ' Duke portal — new service application'}
          </button>
        </div>
      )}

      {/* Duke's load form (Residential Service Information Form), pre-filled and
          downloaded — the piece you attach to the WO# reply. Sits right under
          the portal button because it's step 2 of the same Duke flow. */}
      {u === 'DUKE' && (
        <div className="contact-row">
          <button
            className="contact"
            onClick={downloadDukeForm}
            disabled={formBusy}
            title="Download the Duke load form (Residential Service Information Form) pre-filled from this project — then attach it, with the site plan, to your reply to Duke's Work Order email"
          >
            <Icon name={formBusy ? 'hourglass_top' : 'description'} size={15} />
            {formBusy ? ' Building…' : ' Load form (PDF)'}
          </button>
        </div>
      )}
      {u === 'DUKE' && <GuideCallout id="apply-duke" />}

      {/* SECO's apply-flow button, in the same visual spot as Duke's portal
          button above — SECO doesn't have a web portal, just a pre-filled
          load form to attach to the application email. */}
      {u === 'SECO' && (
        <div className="contact-row">
          <button
            className="contact"
            onClick={downloadSecoForm}
            disabled={formBusy}
            title="Download the SECO load form pre-filled from this project — then tick Single Family / service / e-mail, sign, and attach it"
          >
            <Icon name={formBusy ? 'hourglass_top' : 'description'} size={15} />
            {formBusy ? ' Building…' : ' Load form (PDF)'}
          </button>
        </div>
      )}

      {/* The crucial bit the old button hid: opening the portal is only
          step one. The form gets filled by ASKING CLAUDE — spell that out
          so it never again looks like "nothing happened". */}
      {(dukeState === 'opened' || dukeState === 'noclip') && (
        <div className="banner duke-next">
          ✅ Builder Portal opened in a new tab
          {dukeState === 'opened' ? ' · fill data copied to your clipboard' : ''}.
          <br />
          <b>To auto-fill the application:</b> sign in on that tab, then tell Claude:{' '}
          <span className="duke-say">“apply for Duke on {p.address}”</span>. Claude fills every
          field and stops at the summary for you to press <b>Submit</b>.
          {dukeState === 'noclip' && (
            <>
              <br />
              <span className="muted">
                (Your browser blocked the clipboard this time — that's fine, Claude recomputes the
                fill data itself.)
              </span>
            </>
          )}
        </div>
      )}

      {/* 📸 Once the home green-tags: tell the utility it's ready for the meter
          set and send the photos they require (SECO Engineering / Duke EDA). */}
      {(u === 'SECO' || u === 'DUKE') && (
        <div className="contact-row">
          <button className="contact" onClick={notifyReadyForMeter} disabled={notifying}>
            <Icon name={notifying ? 'hourglass_top' : 'photo_camera'} size={15} />
            {notifying ? ' Drafting…' : ' Notify utility — ready for meter'}
          </button>
        </div>
      )}
      {notifyNote && <p className={'shutoff' + (notifyNote.startsWith('⚠️') ? ' warn' : '')}>{notifyNote}</p>}
      {(u === 'SECO' || u === 'DUKE') && <GuideCallout id="meter-ready" />}

      <p className="next-line">
        Next: <b>{next.label}</b>
      </p>

      <Checklist
        projectId={p.id}
        stream="electric"
        steps={electricSteps()}
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
            <Icon name="schedule" size={14} /> Shut off / transfer electric by <b>{shutoff.date}</b> ({shutoff.daysLeft}{' '}
            days)
          </span>
        )}

        {ps.closingDate && (
          <label className="transfer">
            <input
              type="checkbox"
              checked={ps.transferred ?? false}
              onChange={(e) => setField(p.id, 'transferred', e.target.checked)}
            />
            Account transferred / shut off
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
      <p className="summary">
        <Icon name="water_drop" size={15} color="var(--info)" /> {WATER_LABEL[source]}
      </p>

      <GuideCallout id="manage-water" />

      {source === 'CityWM' && (
        <div className="flag">
          <Icon name="construction" size={15} /> Water-main extension required — agreement, fees, and construction come
          before the tap/meter.
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
        <Icon name="plumbing" size={15} color="var(--rust)" /> {source === 'Sewer' ? 'City Sewer' : 'Septic'}
        {source === 'Septic' && system && <> · {system}</>}
      </p>

      <GuideCallout id="manage-septic" />

      {source === 'Septic' && (
        <p className="provider">
          Private provider: {GEORGES.name} · {GEORGES.contact} · {GEORGES.phone}
        </p>
      )}

      {/* The INRB conditional: picking INRB (in ⚙️ Settings) adds a step to the
          checklist (see septicStepsFor in lifecycles.ts) — this flag explains why. */}
      {source === 'Septic' && system === 'INRB' && (
        <div className="flag">
          <Icon name="description" size={15} /> INRB system — a recorded INRB notice must be sent to Georges Plumbing
          (it appears as a checklist step below).
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

function PermitBody({ project: p, ps, toggleStep, setStepNote, tasks, addTask, updateTask, removeTask, dismissNotification, dismissInspection, templates }: Props) {
  // 📨 Email Jennifer needs a moment to mint download links for the project's
  // files (a cloud call per file), so it's a button with a busy state rather
  // than a plain link.
  const [drafting, setDrafting] = useState(false)
  const [draftNote, setDraftNote] = useState<string | null>(null)

  async function emailJennifer() {
    if (
      !confirmSend(`Hand off the permit for ${p.address} to Jennifer?`, [
        'The draft has a [PASTE HERE] line — paste the file links (copied to your clipboard) over it before sending.',
        'Job cost + financing are filled in by hand.',
      ])
    )
      return
    setDrafting(true)
    setDraftNote(null)

    // Kick off the link minting, but DON'T await it yet — see the Safari
    // note below. We hand this same promise to the clipboard and then await
    // it ourselves for the mailto.
    const draftPromise = permitHandoffDraftWithLinks(p, ps, templates, getShareUrl)

    // Raw signed URLs are 300+ characters of token soup, so they don't go in
    // the draft. The docs section is a [PASTE HERE] marker and the CLIPBOARD
    // gets the links as rich text — clickable file names. writeRichClipboard
    // handles the browser quirks (Safari needs promise-based writes inside
    // the click; some Chromes need resolved blobs). If no links get minted,
    // the content promises reject and the clipboard is left exactly as it was.
    const contentOf = (pick: (d: HandoffDraft) => string) =>
      draftPromise.then((d) => {
        if (d.linked === 0) throw new Error('nothing to copy')
        return pick(d)
      })
    let clipboardOk = false
    try {
      await writeRichClipboard(contentOf((d) => d.docsHtml), contentOf((d) => d.docsText))
      clipboardOk = true
    } catch {
      /* clipboard unavailable, or nothing to copy — handled below */
    }

    try {
      const draft = await draftPromise
      if (draft.linked === 0) {
        // Nothing linkable (no files, or every mint failed) — names-only draft.
        window.location.href = draft.mailto
        if (draft.failed > 0) {
          setDraftNote('⚠️ Could not create download links — the draft lists file names only. Share links from the 📂 Files box instead.')
        }
      } else if (clipboardOk) {
        window.location.href = draft.mailto // [PASTE HERE] marker flavor
        setDraftNote(
          draft.failed > 0
            ? `⚠️ ${draft.linked} download link(s) are on your clipboard — paste them over the [PASTE HERE] line. ${draft.failed} file(s) couldn't be linked and show "(link to follow)".`
            : `✓ Draft opened. ${draft.linked} download link(s) are on your clipboard as clickable file names — paste them over the [PASTE HERE] line.`,
        )
      } else {
        // Links exist but the clipboard write failed — never leave a
        // [PASTE HERE] marker pointing at an empty clipboard. Fall back to
        // the flavor with raw URLs in the body: uglier, still works.
        window.location.href = draft.mailtoWithUrls
        setDraftNote("⚠️ Couldn't copy the clickable links, so the draft carries the raw URLs instead.")
      }
    } catch {
      // Couldn't build the linked draft at all — still open one, names only.
      setDraftNote('⚠️ Could not create download links — the draft lists file names only. Share links from the 📂 Files box instead.')
      window.location.href = permitHandoffDraft(p, ps, templates).mailto
    } finally {
      setDrafting(false)
    }
  }

  const next = nextPermitAction(ps)
  // (folder + permitUrl moved to the main Detail() header — see "Project
  //  Documents" / "Permit Portal" buttons there. Not needed in PermitBody now.)
  const expiry = permitExpiryFor(p, ps)
  const countyStatus = permitCountyStatusOf(p)
  const issued = permitIssuedOf(p, ps)
  // (expiry date is shown by the ⏰ reminder line below, with days-left +
  // urgency color — so it's NOT repeated in the summary line. Audit, 2026.)

  return (
    <>
      {/* 🔔 FYI notifications the portal scanner pulled in (dismissible). */}
      <PermitNotifications
        notes={ps.notifications ?? []}
        onDismiss={(sk) => dismissNotification(p.id, sk)}
      />

      {/* 🔍 This project's flagged inspection results (reference info from
          the nightly scan — the cross-project feed lives on the 🔍 tab).
          We hide dismissed:true rows here AND gate the whole block on the
          filtered count, so the list disappears once they're all dismissed.
          (Dismissing tombstones the row — see dismissInspection — so the
          scanner won't re-add it on the next nightly run.) */}
      {(ps.inspections ?? []).filter((i) => !i.dismissed).length > 0 && (
        <div className="insp-list insp-inline">
          {(ps.inspections ?? [])
            .filter((i) => !i.dismissed)
            .map((i) => (
              <div key={i.sourceKey} className="insp-row static">
                <span className={'insp-status ' + (/disapprov|fail|reject|denied/i.test(i.status) ? 'fail' : 'partial')}>
                  {i.status}
                </span>
                <span className="insp-main">
                  <span className="insp-desc">{i.desc}</span>
                </span>
                <span className="insp-date muted">{i.date || ''}</span>
                {/* Same small ✕ dismiss button the task rows use (.trow-x) —
                    tombstones this result so it stops showing here and on the
                    cross-project 🔍 tab, without deleting it from the data. */}
                <button
                  className="trow-x"
                  title="Dismiss this inspection result"
                  aria-label="Dismiss inspection result"
                  onClick={() => dismissInspection(p.id, i.sourceKey)}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Read-only summary — edit responsible / links / dates in Settings. */}
      <p className="summary">
        <Icon name="description" size={15} color="var(--rust)" /> Responsible: {permitResponsibleOf(ps)}
        {countyStatus && <> · County: {countyStatus}</>}
        {issued && <> · Issued {issued}</>}
      </p>

      {/* Permit-package handoff. (The "Open project folder" and "Open permit
          record" links that used to live here moved UP to the project header —
          "Project Documents" and "Permit Portal" — so they're reachable from
          any tab, not just this one.) */}
      <div className="contact-row">
        {/* New-permit handoff: drafts the package email to Jennifer's
            Permitting Service, pre-filled with site facts and the standard
            sub lineup. File download links land on the CLIPBOARD as clickable
            names — paste them over the draft's [PASTE HERE] marker, fill the
            [FILL IN] blanks, send. */}
        <button className="contact" onClick={emailJennifer} disabled={drafting}>
          <Icon name={drafting ? 'hourglass_top' : 'mail'} size={15} />
          {drafting ? ' Creating download links…' : ' Email Jennifer — permit package'}
        </button>
      </div>

      {/* Feedback after drafting: ✓ links minted (plain) or ⚠️ fallback (warn). */}
      {draftNote && <p className={'shutoff' + (draftNote.startsWith('⚠️') ? ' warn' : '')}>{draftNote}</p>}

      <GuideCallout id="permit-jennifer" />

      {/* Expiry reminder (only when a date is known), colored by urgency. */}
      {expiry && (
        <p className={'shutoff' + (expiry.daysLeft <= 7 ? ' due' : expiry.daysLeft <= 30 ? ' warn' : '')}>
          <Icon name="schedule" size={14} />{' '}
          {expiry.daysLeft < 0 ? (
            <>
              Permit EXPIRED <b>{expiry.date}</b> ({-expiry.daysLeft} days ago)
            </>
          ) : (
            <>
              Permit expires <b>{expiry.date}</b> ({expiry.daysLeft} days)
            </>
          )}
        </p>
      )}

      <p className="next-line">
        Next: <b>{next.label}</b>
      </p>

      <Checklist
        projectId={p.id}
        stream="permit"
        steps={permitSteps()}
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
