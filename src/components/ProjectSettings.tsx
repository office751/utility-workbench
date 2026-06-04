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

interface Props {
  project: Project
  ps: ProjectState
  setField: <K extends keyof ProjectState>(id: number, field: K, value: ProjectState[K]) => void
  /** Close the panel (the Done button). */
  onClose: () => void
}

function ProjectSettings({ project: p, ps, setField, onClose }: Props) {
  const septicIsSeptic = septicSourceOf(ps) === 'Septic'

  return (
    <div className="proj-settings card">
      <div className="ps-head">
        <span>⚙️ Project settings</span>
        <span className="muted">— overrides for this project; saved automatically</span>
        <button className="mini" onClick={onClose}>
          ✓ Done
        </button>
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
