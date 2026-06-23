/**
 * ProjectSettings.tsx — the ⚙️ "Project settings" panel.
 *
 * One place to edit a project's CONFIGURATION across all four streams — the
 * dropdowns, the engineer, and the links/dates that used to sit inline in each
 * tab. The detail views are now read-only + action buttons; THIS is where you
 * change things. It's shown (toggled by the gear) regardless of which tab
 * you're on, so you can set a project up once.
 *
 * Every field follows the same override pattern: it shows the effective value
 * (your saved override, else the default we matched), and editing saves an
 * override via setField. Nothing here is destructive.
 */
import type {
  PermitResponsible,
  Project,
  ProjectState,
  SepticSource,
  SepticSystem,
  ServiceType,
  Utility,
  WaterSource,
} from '../types'
import {
  engineerOf,
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
import { permitExpiresOf } from '../lib/permitExpiry'
import { useEffect, useState } from 'react'
import { investorNames } from '../lib/investor'

interface Props {
  project: Project
  ps: ProjectState
  setField: <K extends keyof ProjectState>(id: number, field: K, value: ProjectState[K]) => void
  /** Edit the core roster facts (address, model, parcel, permit, status…). */
  updateFacts: (id: number, patch: Partial<Project>) => void
  /** Close the panel (the Done button). */
  onClose: () => void
}

/** listStatus options with plain-English labels (the type allows all eight). */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'NotApplied', label: 'Active (default)' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'Applied', label: 'Applied' },
  { value: 'Scheduled', label: 'Scheduled' },
  { value: 'MeterSet', label: 'Meter set' },
  { value: 'PowerOn', label: 'Power on' },
  { value: 'Hold', label: 'On hold' },
  { value: 'CO', label: 'C.O. — finished' },
]

function ProjectSettings({ project: p, ps, setField, updateFacts, onClose }: Props) {
  // Edit a core roster fact (address, model, …) directly on the project. Only
  // string-valued fields are edited here, so the computed-key cast is safe.
  type FactField = 'address' | 'city' | 'zip' | 'model' | 'parcel' | 'subdivision' | 'permit' | 'workOrder' | 'listStatus'
  const fact = (field: FactField, value: string) => updateFacts(p.id, { [field]: value } as Partial<Project>)
  const septicIsSeptic = septicSourceOf(ps) === 'Septic'
  const isInvestor = ps.isInvestorProject ?? false

  // Names of existing portal investors → the "pick an investor" datalist.
  // (Owners can read these; empty before the portal schema exists. Adam can
  //  always just TYPE a name that isn't on the list.)
  const [knownInvestors, setKnownInvestors] = useState<string[]>([])
  useEffect(() => {
    investorNames().then(setKnownInvestors)
  }, [])

  return (
    <div className="proj-settings card">
      <div className="ps-head">
        <span>⚙️ Project settings</span>
        <span className="muted">— details &amp; overrides for this project; saved automatically</span>
        <button className="mini" onClick={onClose}>
          ✓ Done
        </button>
      </div>

      {/* ---- Project details (the core roster facts — editable anytime) ---- */}
      <h4>🏠 Project details</h4>
      <p className="ps-note muted">
        The core facts for this house — fix anything that changed (e.g. a “TBD” address that now has a house number).
      </p>
      <div className="settings">
        <label className="grow">
          Address
          <input value={p.address} onChange={(e) => fact('address', e.target.value)} placeholder="14667 SW 79th Terrace Rd" />
        </label>
        <label>
          City
          <input value={p.city} onChange={(e) => fact('city', e.target.value)} />
        </label>
        <label>
          ZIP
          <input value={p.zip} onChange={(e) => fact('zip', e.target.value)} placeholder="34473" />
        </label>
        <label>
          Model / floor plan
          <input value={p.model} onChange={(e) => fact('model', e.target.value)} placeholder="E2-RH" />
        </label>
        <label>
          Parcel #
          <input value={p.parcel} onChange={(e) => fact('parcel', e.target.value)} placeholder="8011-1376-25" />
        </label>
        <label className="grow">
          Subdivision
          <input value={p.subdivision} onChange={(e) => fact('subdivision', e.target.value)} placeholder="Marion Oaks Unit 11" />
        </label>
        <label>
          Permit #
          <input value={p.permit} onChange={(e) => fact('permit', e.target.value)} placeholder="2025020809" />
        </label>
        <label>
          Duke WO# (if any)
          <input value={p.workOrder} onChange={(e) => fact('workOrder', e.target.value)} />
        </label>
        <label>
          Status
          <select value={p.listStatus} onChange={(e) => fact('listStatus', e.target.value)}>
            {STATUS_OPTIONS.some((o) => o.value === p.listStatus) ? null : (
              <option value={p.listStatus}>{String(p.listStatus)}</option>
            )}
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ---- Ownership ---- */}
      <h4>👤 Ownership</h4>
      <div className="settings">
        <label className="grow">
          Owner
          <input
            value={ps.ownerName ?? ''}
            onChange={(e) => setField(p.id, 'ownerName', e.target.value)}
            placeholder="Iron Shield Construction (our spec build)"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={isInvestor}
            onChange={(e) => setField(p.id, 'isInvestorProject', e.target.checked)}
          />
          This is an investor's project
        </label>
        {isInvestor && (
          <label className="grow">
            Investor name
            <input
              list="investor-name-options"
              value={ps.investorName ?? ''}
              onChange={(e) => setField(p.id, 'investorName', e.target.value)}
              placeholder="pick an investor or type a new name"
            />
            <datalist id="investor-name-options">
              {knownInvestors.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
        )}
      </div>

      {/* ---- Electric ---- */}
      <h4>⚡ Electric</h4>
      <div className="settings">
        <label>
          Utility
          <select
            value={utilityOf(p, ps)}
            onChange={(e) => setField(p.id, 'electricCo', e.target.value as Utility)}
          >
            <option value="">— unknown —</option>
            <option value="SECO">SECO</option>
            <option value="DUKE">Duke</option>
            <option value="CLAY">Clay</option>
          </select>
        </label>
        {/* Duke replies (load form, meter-notify) go to whichever EDA office
            emailed the Work Order — Ocala for most jobs, Inverness out west. */}
        {utilityOf(p, ps) === 'DUKE' && (
          <label>
            Duke EDA office
            {/* No silent default: the office decides where BOTH the load-form
                reply and the meter-notify email go, so make it an explicit
                choice and warn until one is picked. */}
            <select
              value={ps.dukeOffice ?? ''}
              onChange={(e) => setField(p.id, 'dukeOffice', e.target.value as 'Ocala' | 'Inverness')}
            >
              <option value="">— choose office —</option>
              <option value="Ocala">Ocala (EDA-Ocala)</option>
              <option value="Inverness">Inverness (EDA-Inverness)</option>
            </select>
            <small className="ps-hint muted">most Marion County → Ocala; western/Citrus → Inverness</small>
            {!ps.dukeOffice && (
              <small className="ps-hint warn">⚠ Pick an office — every Duke email for this house routes here.</small>
            )}
          </label>
        )}
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

      {/* ---- Water ---- */}
      <h4>💧 Water</h4>
      <div className="settings">
        <label>
          Water source
          <select
            value={waterSourceOf(p, ps)}
            onChange={(e) => setField(p.id, 'waterSource', e.target.value as WaterSource)}
          >
            <option value="">— unknown —</option>
            <option value="Well">Well</option>
            <option value="City">City Water</option>
            <option value="CityWM">City Water + main extension</option>
          </select>
        </label>
      </div>

      {/* ---- Septic ---- */}
      <h4>🚽 Septic / sewer</h4>
      <div className="settings">
        <label>
          Wastewater
          <select
            value={septicSourceOf(ps)}
            onChange={(e) => setField(p.id, 'septicSource', e.target.value as SepticSource)}
          >
            <option value="Septic">Septic (DEP onsite)</option>
            <option value="Sewer">City Sewer</option>
          </select>
        </label>
        {septicIsSeptic && (
          <label>
            System type
            <select
              value={septicSystemOf(ps)}
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

      {/* ---- Permit ---- */}
      <h4>📋 Permit</h4>
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
        <label>
          Permit issued
          <input
            type="date"
            value={permitIssuedOf(p, ps)}
            onChange={(e) => setField(p.id, 'permitIssuedDate', e.target.value)}
          />
        </label>
        <label>
          Permit expires
          <input
            type="date"
            value={permitExpiresOf(p, ps)}
            onChange={(e) => setField(p.id, 'permitExpiresDate', e.target.value)}
          />
        </label>
        <label className="grow">
          SharePoint folder link
          <input
            value={sharepointFolderOf(p, ps)}
            onChange={(e) => setField(p.id, 'sharepointUrl', e.target.value)}
            placeholder="https://…sharepoint.com/…"
          />
        </label>
        <label className="grow">
          County permit page link
          <input
            value={permitPortalOf(p, ps)}
            onChange={(e) => setField(p.id, 'permitUrl', e.target.value)}
            placeholder="https://…marionfl.org/…"
          />
        </label>
      </div>
    </div>
  )
}

export default ProjectSettings
