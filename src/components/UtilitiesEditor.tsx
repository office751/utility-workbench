/**
 * UtilitiesEditor.tsx — 🛠 Settings → Utility companies setup.
 *
 * Owner-editable roster of EXTRA utility companies, for projects whose
 * territory isn't SECO, Duke, Clay (electric), Marion County Utilities
 * (water/sewer), or Georges Plumbing (septic) — those built-ins keep their
 * real automation (the SECO PDF load form, Duke's web-portal apply flow) and
 * aren't edited here. An entry added here just gets a call/email button,
 * the same as Clay does today — no auto-filled application packet.
 *
 * Edits happen on a LOCAL working copy (instant); "Save changes" commits the
 * whole list to the cloud blob in one shot — the same working-copy/save
 * pattern as VendorsEditor (read that file first if this looks unfamiliar).
 */
import { useState } from 'react'
import type { UtilityCompany, UtilityKind } from '../data/utilities'
import Icon from './Icon'

const newId = () => 'u-' + (crypto.randomUUID?.() ?? `${performance.now()}`)
const clone = (u: UtilityCompany[]): UtilityCompany[] => JSON.parse(JSON.stringify(u))

interface Props {
  utilities: UtilityCompany[]
  onSave: (utilities: UtilityCompany[]) => void
}

/** The three sections, in display order, with their own "add" label + icon. */
const SECTIONS: { kind: UtilityKind; label: string; icon: string; addLabel: string }[] = [
  { kind: 'electric', label: '⚡ Electric', icon: 'bolt', addLabel: 'Add electric company' },
  { kind: 'water', label: '💧 Water', icon: 'water_drop', addLabel: 'Add water company' },
  { kind: 'sewer', label: '🚽 Sewer / septic', icon: 'plumbing', addLabel: 'Add sewer / septic company' },
]

function UtilitiesEditor({ utilities, onSave }: Props) {
  const [work, setWork] = useState<UtilityCompany[]>(() => clone(utilities))
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  /** Apply an immutable edit to the working copy. */
  function mutate(fn: (list: UtilityCompany[]) => void) {
    setWork((prev) => {
      const next = clone(prev)
      fn(next)
      return next
    })
    setDirty(true)
    setSaved(false)
  }

  // Patch/remove operate on the WHOLE working list by id, since each section
  // below renders a filtered view of `work`, not the array's own indices.
  const patch = (id: string, p: Partial<UtilityCompany>) =>
    mutate((list) => {
      const row = list.find((u) => u.id === id)
      if (row) Object.assign(row, p)
    })
  const remove = (id: string) => mutate((list) => {
    const i = list.findIndex((u) => u.id === id)
    if (i >= 0) list.splice(i, 1)
  })
  const add = (kind: UtilityKind) =>
    mutate((list) => list.push({ id: newId(), kind, name: '' }))

  function save() {
    onSave(work)
    setDirty(false)
    setSaved(true)
  }

  return (
    <section className="vend-editor">
      <div className="vend-editor-head">
        <h2>🔌 Utility companies setup</h2>
        <div className="vend-editor-actions">
          {saved && <span className="selcat-saved">Saved ✓</span>}
          <button className="mini primary" onClick={save} disabled={!dirty}>
            Save changes
          </button>
        </div>
      </div>
      <p className="muted">
        Extra companies for projects whose territory isn't SECO, Duke, or Clay (electric) — or Marion County
        Utilities (water/sewer) / Georges Plumbing (septic). Anything added here gets a call/email button on the
        project's tab, but no auto-filled application packet — those three keep their special handling.
      </p>

      {SECTIONS.map(({ kind, label, icon, addLabel }) => (
        <div key={kind} className="vend-section">
          <h4>
            <Icon name={icon} size={16} /> {label}
          </h4>
          {work
            .filter((u) => u.kind === kind)
            .map((u) => (
              <div key={u.id} className="vend-card">
                <div className="vend-row">
                  <label className="vend-f vend-grow">
                    Name
                    <input
                      value={u.name}
                      onChange={(e) => patch(u.id, { name: e.target.value })}
                      placeholder="Company name"
                    />
                  </label>
                  <button
                    className="team-x vend-del"
                    title="Remove company"
                    aria-label={`Remove ${u.name || 'company'}`}
                    onClick={() => remove(u.id)}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>

                <div className="vend-row">
                  <label className="vend-f vend-grow">
                    Phone
                    <input
                      value={u.phone ?? ''}
                      onChange={(e) => patch(u.id, { phone: e.target.value || undefined })}
                      placeholder="352-555-1234"
                    />
                  </label>
                  <label className="vend-f vend-grow">
                    Email
                    <input
                      value={u.email ?? ''}
                      onChange={(e) => patch(u.id, { email: e.target.value || undefined })}
                      placeholder="orders@utility.com"
                    />
                  </label>
                  <label className="vend-f vend-grow">
                    Contact name (optional)
                    <input
                      value={u.contact ?? ''}
                      onChange={(e) => patch(u.id, { contact: e.target.value || undefined })}
                      placeholder="Jane Doe"
                    />
                  </label>
                </div>
              </div>
            ))}

          <button className="mini" onClick={() => add(kind)}>
            ＋ {addLabel}
          </button>
        </div>
      ))}
    </section>
  )
}

export default UtilitiesEditor
