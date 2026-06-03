/**
 * Detail.tsx — the right-hand panel for ONE project, on the current tab.
 *
 * Structure: a thin shared shell (back button, address header, notes box)
 * plus one "body" per stream. Each body is its own small component lower in
 * this file — ElectricBody / WaterBody / SepticBody — and they all lean on
 * the same building blocks: Checklist.tsx and lifecycles.ts.
 */
import type {
  PermitResponsible,
  Project,
  ProjectState,
  SepticSource,
  SepticSystem,
  ServiceType,
  Stream,
  Utility,
  WaterSource,
} from '../types'
import { ELECTRIC_STEPS, PERMIT_STEPS, septicStepsFor, waterStepsFor } from '../data/lifecycles'
import {
  engineerOf,
  needsVerify,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  permitResponsibleOf,
  septicSourceOf,
  septicSystemOf,
  serviceTypeOf,
  sharepointFolderOf,
  waterSourceOf,
} from '../lib/nextAction'
import { shutoffFor } from '../lib/shutoff'
import { GEORGES } from '../data/contacts'
import Checklist from './Checklist'
import ContactLinks from './ContactLinks'
import DocumentsBox from './DocumentsBox'

/** The updater functions every body needs — grouped to avoid repetition. */
interface Updaters {
  toggleStep: (id: number, stream: Stream, stepId: string, done: boolean) => void
  setStepNote: (id: number, stream: Stream, stepId: string, note: string) => void
  setNote: (id: number, stream: Stream, text: string) => void
  setField: <K extends keyof ProjectState>(id: number, field: K, value: ProjectState[K]) => void
  addDocuments: (id: number, names: string[]) => void
  removeDocument: (id: number, index: number) => void
}

interface Props extends Updaters {
  stream: Stream
  project: Project
  ps: ProjectState
  onBack: () => void
  /** Permanently remove this project (App deletes + returns to dashboard). */
  onDelete: () => void
}

const NOTE_LABEL: Record<Stream, string> = {
  electric: 'Electric notes',
  water: 'Water notes',
  septic: 'Septic / sewer notes',
  permit: 'Permit notes',
}

function Detail(props: Props) {
  const { stream, project: p, ps, setNote, onBack, onDelete } = props

  return (
    <section className="detail">
      <button className="mini back" onClick={onBack}>
        ← {stream} dashboard
      </button>
      <h2>{p.address}</h2>
      <p className="meta">
        {p.model} · {p.subdivision} · {p.city}, FL {p.zip} · parcel {p.parcel}
        {p.permit && <> · permit {p.permit}</>}
        {p.workOrder && <> · WO# {p.workOrder}</>}
      </p>

      {/* Click-to-call / pre-filled email buttons for this tab. */}
      <ContactLinks stream={stream} p={p} ps={ps} />

      {/* Render the body for whichever tab we're on. */}
      {stream === 'electric' && <ElectricBody {...props} />}
      {stream === 'water' && <WaterBody {...props} />}
      {stream === 'septic' && <SepticBody {...props} />}
      {stream === 'permit' && <PermitBody {...props} />}

      <label className="notes-label">
        {NOTE_LABEL[stream]}
        <textarea
          rows={3}
          value={ps.notes[stream]}
          onChange={(e) => setNote(p.id, stream, e.target.value)}
          placeholder="Anything worth remembering…"
        />
      </label>

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
    </section>
  )
}

/* ==================== ELECTRIC ==================== */

function ElectricBody({ project: p, ps, toggleStep, setStepNote, setField }: Props) {
  const next = nextElectricAction(p, ps)
  const shutoff = shutoffFor(ps)

  return (
    <>
      {needsVerify(p, ps) && (
        <div className="banner">
          ⚠️ Territory not verified — confirm SECO vs Duke before applying
          (subdivision: {p.subdivision}).
        </div>
      )}

      <div className="settings">
        <label>
          Utility
          <select
            value={ps.electricCo ?? p.electricCo}
            onChange={(e) => setField(p.id, 'electricCo', e.target.value as Utility)}
          >
            <option value="">— unknown —</option>
            <option value="SECO">SECO</option>
            <option value="DUKE">Duke</option>
            <option value="CLAY">Clay</option>
          </select>
        </label>

        <label>
          Service
          <select
            value={serviceTypeOf(p, ps)}
            onChange={(e) => setField(p.id, 'serviceType', e.target.value as ServiceType)}
          >
            <option value="">?</option>
            <option value="OH">Overhead</option>
            <option value="UG">Underground</option>
          </select>
        </label>

        <label>
          Engineer
          <input
            value={engineerOf(p, ps)}
            onChange={(e) => setField(p.id, 'engineer', e.target.value)}
            placeholder="not assigned"
          />
        </label>
      </div>

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

function WaterBody({ project: p, ps, toggleStep, setStepNote, setField }: Props) {
  const source = waterSourceOf(p, ps)
  const next = nextWaterAction(p, ps)

  return (
    <>
      <div className="settings">
        <label>
          Water source
          <select
            value={source}
            onChange={(e) => setField(p.id, 'waterSource', e.target.value as WaterSource)}
          >
            <option value="">— unknown —</option>
            <option value="Well">Well</option>
            <option value="City">City Water</option>
            <option value="CityWM">City Water + main extension</option>
          </select>
        </label>
      </div>

      {source === 'CityWM' && (
        <div className="flag">
          🛠 Water-main extension required — agreement, fees, and construction
          come before the tap/meter.
        </div>
      )}

      {/* No source yet → no checklist to show. */}
      {!source ? (
        <div className="flag">Set the water source above to load its checklist.</div>
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

function SepticBody({ project: p, ps, toggleStep, setStepNote, setField }: Props) {
  const source = septicSourceOf(ps)
  const system = septicSystemOf(ps)
  const next = nextSepticAction(ps)

  return (
    <>
      <div className="settings">
        <label>
          Wastewater
          <select
            value={source}
            onChange={(e) => setField(p.id, 'septicSource', e.target.value as SepticSource)}
          >
            <option value="Septic">Septic (DEP onsite)</option>
            <option value="Sewer">City Sewer</option>
          </select>
        </label>

        {/* System type only applies to septic lots. */}
        {source === 'Septic' && (
          <label>
            System type
            <select
              value={system}
              onChange={(e) => setField(p.id, 'septicSystem', e.target.value as SepticSystem)}
            >
              <option value="">— select —</option>
              <option value="INRB">INRB — recorded notice required</option>
              <option value="ATU">ATU — aerobic treatment unit</option>
              <option value="NA">N/A — conventional system</option>
            </select>
          </label>
        )}
      </div>

      {source === 'Septic' && (
        <p className="provider">
          Private provider: {GEORGES.name} · {GEORGES.contact} · {GEORGES.phone}
        </p>
      )}

      {/* The INRB conditional: picking INRB adds a step to the checklist
          (see septicStepsFor in lifecycles.ts) — this flag explains why. */}
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

function PermitBody({ project: p, ps, toggleStep, setStepNote, setField, addDocuments, removeDocument }: Props) {
  const next = nextPermitAction(ps)
  const folder = sharepointFolderOf(p, ps) // matched default, unless overridden
  const permitUrl = ps.permitUrl ?? ''

  return (
    <>
      <div className="settings">
        <label>
          Responsible
          <select
            value={permitResponsibleOf(ps)}
            onChange={(e) => setField(p.id, 'permitResponsible', e.target.value as PermitResponsible)}
          >
            <option value="Us">Us (Iron Shield)</option>
            <option value="Owner">Owner</option>
            <option value="GC">General contractor</option>
          </select>
        </label>

        {/* These two URLs are editable per project. The folder is pre-filled
            for the projects we could match from SharePoint; paste the rest. */}
        <label className="grow">
          SharePoint folder
          <input
            value={folder}
            onChange={(e) => setField(p.id, 'sharepointUrl', e.target.value)}
            placeholder="https://…sharepoint.com/…/<parcel>"
          />
        </label>

        <label className="grow">
          County permit page
          <input
            value={permitUrl}
            onChange={(e) => setField(p.id, 'permitUrl', e.target.value)}
            placeholder="https://…marionfl.org/…"
          />
        </label>
      </div>

      {/* Quick-open links (only show when a URL exists). encodeURI handles the
          spaces in the SharePoint folder names. target=_blank opens a new tab. */}
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

      <DocumentsBox
        docs={ps.permitDocs ?? []}
        onAdd={(names) => addDocuments(p.id, names)}
        onRemove={(i) => removeDocument(p.id, i)}
      />
    </>
  )
}

export default Detail
