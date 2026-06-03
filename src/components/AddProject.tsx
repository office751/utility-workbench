/**
 * AddProject.tsx — the "+ Add project" form, shown in the right-hand pane.
 *
 * A classic React form: ONE state object holds every field, each input is
 * "controlled" (value from state, onChange back into state), and Save hands
 * the finished object up to App. Nothing is stored until you hit Save —
 * Cancel just throws the local state away.
 */
import { useState } from 'react'
import type { Project, ServiceType, Utility, WaterSource } from '../types'

interface Props {
  /** Called with the new project's facts; App adds it + selects it. */
  onSave: (facts: Omit<Project, 'id' | 'listStatus'>) => void
  onCancel: () => void
}

function AddProject({ onSave, onCancel }: Props) {
  // Every form field in one object. 'Ocala' is prefilled since most lots
  // are there — typing over a default beats typing from scratch.
  const [form, setForm] = useState({
    address: '',
    city: 'Ocala',
    zip: '',
    model: '',
    parcel: '',
    subdivision: '',
    electricCo: '' as Utility,
    permit: '',
    workOrder: '',
    serviceType: '' as ServiceType,
    waterSource: '' as WaterSource,
    engineer: '',
  })

  // Merge one changed field into the form (same pattern as Filters).
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })

  // The only hard requirement is an address (use "TBD ..." for unassigned
  // house numbers — the app already knows what TBD means).
  const canSave = form.address.trim().length > 0

  return (
    <section className="detail">
      <h2>＋ Add a project</h2>
      <p className="meta">
        Only the address is required — everything else can be filled in later
        from the detail view. Use “TBD …” if the house number isn’t assigned yet.
      </p>

      <div className="form-grid">
        <label className="span2">
          Address *
          <input
            value={form.address}
            onChange={(e) => set({ address: e.target.value })}
            placeholder="14667 SW 79th Terrace Rd"
            autoFocus
          />
        </label>

        <label>
          City
          <input value={form.city} onChange={(e) => set({ city: e.target.value })} />
        </label>

        <label>
          ZIP
          <input value={form.zip} onChange={(e) => set({ zip: e.target.value })} placeholder="34473" />
        </label>

        <label>
          Model / floor plan
          <input value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="E2-RH" />
        </label>

        <label>
          Parcel #
          <input value={form.parcel} onChange={(e) => set({ parcel: e.target.value })} placeholder="8011-1376-25" />
        </label>

        <label className="span2">
          Subdivision
          <input
            value={form.subdivision}
            onChange={(e) => set({ subdivision: e.target.value })}
            placeholder="Marion Oaks Unit 11"
          />
        </label>

        <label>
          Permit #
          <input value={form.permit} onChange={(e) => set({ permit: e.target.value })} placeholder="BLDR-26-…" />
        </label>

        <label>
          Duke WO# (if any)
          <input value={form.workOrder} onChange={(e) => set({ workOrder: e.target.value })} />
        </label>

        <label>
          Electric utility
          <select value={form.electricCo} onChange={(e) => set({ electricCo: e.target.value as Utility })}>
            <option value="">— unknown / verify —</option>
            <option value="SECO">SECO</option>
            <option value="DUKE">Duke</option>
            <option value="CLAY">Clay</option>
          </select>
        </label>

        <label>
          Service
          <select value={form.serviceType} onChange={(e) => set({ serviceType: e.target.value as ServiceType })}>
            <option value="">?</option>
            <option value="OH">Overhead</option>
            <option value="UG">Underground</option>
          </select>
        </label>

        <label>
          Water source
          <select value={form.waterSource} onChange={(e) => set({ waterSource: e.target.value as WaterSource })}>
            <option value="">— unknown —</option>
            <option value="Well">Well</option>
            <option value="City">City Water</option>
            <option value="CityWM">City Water + main extension</option>
          </select>
        </label>

        <label>
          Engineer (if known)
          <input value={form.engineer} onChange={(e) => set({ engineer: e.target.value })} />
        </label>
      </div>

      <div className="form-actions">
        {/* disabled button + hint until the address is filled in */}
        <button className="primary" disabled={!canSave} onClick={() => onSave(form)}>
          ✓ Add project
        </button>
        <button className="mini" onClick={onCancel}>
          Cancel
        </button>
        {!canSave && <span className="muted">Enter an address to save.</span>}
      </div>
    </section>
  )
}

export default AddProject
