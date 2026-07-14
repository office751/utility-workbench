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
import { useEffect, useState, type KeyboardEvent } from 'react'
import { investorNames } from '../lib/investor'
import type { UtilityCompany } from '../data/utilities'
import { MODELS_DEFAULT, modelKey } from '../data/models'
import { LEGAL } from '../data/legal'

interface Props {
  project: Project
  ps: ProjectState
  setField: <K extends keyof ProjectState>(id: number, field: K, value: ProjectState[K]) => void
  /** Edit the core roster facts (address, model, parcel, permit, status…). */
  updateFacts: (id: number, patch: Partial<Project>) => void
  /** Owner-editable EXTRA utility companies (Settings → Utility companies
   *  setup) — power the extra electric options + the water/sewer company
   *  pickers below (those only appear once at least one matching entry exists). */
  utilities: UtilityCompany[]
  /** Close the panel (the Done button). */
  onClose: () => void
}

/** The TEXT facts edited through the draft-then-commit flow below (Status is
 *  a <select>, so it commits straight from onChange — no draft needed). */
type TextFact = 'address' | 'city' | 'zip' | 'model' | 'parcel' | 'subdivision' | 'permit' | 'workOrder'

/** Snapshot a project's text facts into a plain draft object. */
function factSnapshot(p: Project): Record<TextFact, string> {
  return {
    address: p.address,
    city: p.city,
    zip: p.zip,
    model: p.model,
    parcel: p.parcel,
    subdivision: p.subdivision,
    permit: p.permit,
    workOrder: p.workOrder,
  }
}

/** Enter = commit now (blur triggers the save, same as tabbing away). */
function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur()
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

function ProjectSettings({ project: p, ps, setField, updateFacts, utilities, onClose }: Props) {
  /* The core roster facts are edited through a local DRAFT that commits on
   * BLUR (tab away / click elsewhere / Enter), not on every keystroke. Two
   * reasons, both about what the save does (see lib/projectFacts.ts):
   *   1. Saved values are TRIMMED — trimming per keystroke would eat the
   *      space you just typed mid-address ("14667 SW…" could never be typed).
   *   2. A permit-# change re-derives the permit checklist. Per keystroke
   *      that would re-derive against half-typed numbers ("2025" already
   *      looks like an issued permit); on blur it runs once, against the
   *      finished value. */
  const [facts, setFacts] = useState<Record<TextFact, string>>(() => factSnapshot(p))
  // Re-sync the draft whenever the SAVED facts change underneath us: switching
  // to another house, our own commit landing (now trimmed), or another
  // device's edit arriving over realtime sync. None of these fire mid-typing.
  // This is React's documented "adjust state while rendering" pattern: we
  // remember the last saved snapshot we synced from, and when the saved facts
  // no longer match it, reset the draft right here in render (React re-runs
  // the component immediately, before touching the DOM — no flicker, and the
  // focused input keeps its focus, unlike a key= remount).
  const savedSnap = JSON.stringify(factSnapshot(p))
  const [seenSnap, setSeenSnap] = useState(savedSnap)
  if (savedSnap !== seenSnap) {
    setSeenSnap(savedSnap)
    setFacts(factSnapshot(p))
  }

  /** Type into the draft (nothing saved yet). */
  const draft = (field: TextFact, value: string) => setFacts((d) => ({ ...d, [field]: value }))
  /** Commit one field on blur. The updater trims + ignores no-op patches, so
   *  tabbing through unchanged fields writes nothing. We also trim the draft
   *  locally, because a no-op save (e.g. only whitespace changed) won't echo
   *  a state change back to re-sync it. */
  const commit = (field: TextFact) => {
    setFacts((d) => ({ ...d, [field]: d[field].trim() }))
    updateFacts(p.id, { [field]: facts[field] } as Partial<Project>)
  }
  // Status commits straight from its <select> — a picked option IS final.
  const fact = (field: 'listStatus', value: string) => updateFacts(p.id, { [field]: value } as Partial<Project>)

  // What the app reads the typed model AS (takeoffs, load form, selections
  // all key off this) — e.g. "Model F-LH" → F. Empty = model not recognized.
  const resolvedModel = modelKey(facts.model)
  const modelSpec = MODELS_DEFAULT[resolvedModel]
  // Is there a legal description on file for the typed parcel? (The SECO
  // application needs it — data/legal.ts is regenerated by a code script.)
  const legalOnFile = Boolean(LEGAL[facts.parcel.trim()])

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

      {/* ---- Project details (the core roster facts — editable anytime) ----
           Text inputs edit the DRAFT and save on blur/Enter — see the comment
           on `facts` above for why (trimming + permit-checklist re-derive). */}
      <h4>🏠 Project details</h4>
      <p className="ps-note muted">
        The core facts for this house — fix anything that changed (e.g. a “TBD” address that now has a house number).
        Fields save when you tab or click away.
      </p>
      <div className="settings">
        <label className="grow">
          Address
          <input
            value={facts.address}
            onChange={(e) => draft('address', e.target.value)}
            onBlur={() => commit('address')}
            onKeyDown={blurOnEnter}
            placeholder="14667 SW 79th Terrace Rd"
          />
        </label>
        <label>
          City
          <input
            value={facts.city}
            onChange={(e) => draft('city', e.target.value)}
            onBlur={() => commit('city')}
            onKeyDown={blurOnEnter}
          />
        </label>
        <label>
          ZIP
          <input
            value={facts.zip}
            onChange={(e) => draft('zip', e.target.value)}
            onBlur={() => commit('zip')}
            onKeyDown={blurOnEnter}
            placeholder="34473"
          />
        </label>
        <label>
          Model / floor plan
          {/* Free text (roster models carry suffixes like "F-LH"), with the
              known models offered as suggestions — same list the takeoffs +
              load form read (data/models.ts). */}
          <input
            list="model-fact-options"
            value={facts.model}
            onChange={(e) => draft('model', e.target.value)}
            onBlur={() => commit('model')}
            onKeyDown={blurOnEnter}
            placeholder="E2-RH"
          />
          <datalist id="model-fact-options">
            {Object.keys(MODELS_DEFAULT).map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          {/* The model drives takeoffs + the electric load form — show what
              the app reads the typed value AS, or warn when it can't. */}
          {facts.model.trim() === '' ? (
            <small className="ps-hint muted">drives takeoffs + the electric load form</small>
          ) : modelSpec ? (
            <small className="ps-hint muted">
              reads as “{resolvedModel}” ({modelSpec.sqft} sqft / {modelSpec.tons} T) — drives takeoffs + the electric load form
            </small>
          ) : (
            <small className="ps-hint warn">
              ⚠ not a model the app knows — takeoffs + the load form won’t auto-fill
            </small>
          )}
        </label>
        <label>
          Parcel #
          <input
            value={facts.parcel}
            onChange={(e) => draft('parcel', e.target.value)}
            onBlur={() => commit('parcel')}
            onKeyDown={blurOnEnter}
            placeholder="8011-1376-25"
          />
          {/* The parcel keys the SECO legal-description lookup (data/legal.ts,
              regenerated by a script) — a changed parcel may need a refresh. */}
          {facts.parcel.trim() !== '' && !legalOnFile ? (
            <small className="ps-hint warn">
              ⚠ no legal description on file for this parcel — SECO applications need one (ask for a legal-description refresh)
            </small>
          ) : (
            <small className="ps-hint muted">keys the legal-description lookup for SECO applications</small>
          )}
        </label>
        <label className="grow">
          Subdivision
          <input
            value={facts.subdivision}
            onChange={(e) => draft('subdivision', e.target.value)}
            onBlur={() => commit('subdivision')}
            onKeyDown={blurOnEnter}
            placeholder="Marion Oaks Unit 11"
          />
        </label>
        <label>
          Permit #
          <input
            value={facts.permit}
            onChange={(e) => draft('permit', e.target.value)}
            onBlur={() => commit('permit')}
            onKeyDown={blurOnEnter}
            placeholder="2025020809"
          />
          {/* The permit # is a lookup KEY, not just a label — flag it. (The
              permit checklist re-derives automatically on change unless steps
              were hand-toggled; see lib/projectFacts.ts.) */}
          <small className="ps-hint muted">
            The permit # links this house to the county portal + SharePoint — double-check it.
          </small>
        </label>
        <label>
          Duke WO# (if any)
          <input
            value={facts.workOrder}
            onChange={(e) => draft('workOrder', e.target.value)}
            onBlur={() => commit('workOrder')}
            onKeyDown={blurOnEnter}
          />
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
            {/* Extra companies added in Settings → Utility companies setup —
                contact-only (call/email), no auto-filled application packet. */}
            {utilities
              .filter((u) => u.kind === 'electric')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
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
        {/* Only appears once Adam has added at least one extra water company
            in Settings → Utility companies setup — otherwise MCU is the only
            option and there's nothing to pick from. */}
        {utilities.some((u) => u.kind === 'water') && (
          <label>
            Water company
            <select
              value={ps.waterCompanyId ?? ''}
              onChange={(e) => setField(p.id, 'waterCompanyId', e.target.value || undefined)}
            >
              <option value="">Marion County Utilities (default)</option>
              {/* 'MCU' = the county-GIS check confirmed the default (types.ts).
                  Same contacts as unset — listed so the select displays it. */}
              <option value="MCU">Marion County Utilities (confirmed)</option>
              {utilities
                .filter((u) => u.kind === 'water')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
        )}
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
        {/* Only appears once Adam has added at least one extra sewer/septic
            company — otherwise Georges/MCU stay the only contacts. */}
        {utilities.some((u) => u.kind === 'sewer') && (
          <label>
            Sewer / septic company
            <select
              value={ps.sewerCompanyId ?? ''}
              onChange={(e) => setField(p.id, 'sewerCompanyId', e.target.value || undefined)}
            >
              <option value="">Georges Plumbing (Septic) / Marion County Utilities (Sewer) — default</option>
              {utilities
                .filter((u) => u.kind === 'sewer')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
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
