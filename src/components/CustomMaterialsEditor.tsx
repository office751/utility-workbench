/**
 * CustomMaterialsEditor.tsx — 🛠 Settings → Custom materials.
 *
 * Manage the extra order categories you've added beyond the built-in list
 * (data/orders.ts). They live in the cloud blob (WorkbenchState
 * .customOrderCategories) and show up in EVERY project's 🛒 Materials order
 * picker under "Your materials". Two ways they get there:
 *   1. Type a brand-new name in a house's "➕ Custom material…" box (the app
 *      auto-remembers it — see useProjects.addOrder).
 *   2. Add / rename / remove them here.
 *
 * Like adding an order, edits save immediately (the blob autosaves) — there's no
 * "Save" button on purpose. Renaming CASCADES to orders already placed under the
 * old name (useProjects.renameCustomCategory), so fixing a typo fixes the orders
 * too. Removing only takes the name out of the picker; existing orders keep it.
 */
import { useState } from 'react'
import type { ProjectState } from '../types'
import { MATERIAL_CATEGORIES, ORDER_CATEGORIES, SITE_SERVICES } from '../data/orders'
import Icon from './Icon'

interface Props {
  /** The owner-added material names (WorkbenchState.customOrderCategories). */
  categories: string[]
  /** All project progress — used only to count how many orders use each name. */
  projects: Record<number, ProjectState>
  /** Replace the whole custom list (used by add + remove). */
  onSave: (list: string[]) => void
  /** Rename one custom material (cascades to existing orders in useProjects). */
  onRename: (oldName: string, newName: string) => void
}

function CustomMaterialsEditor({ categories, projects, onSave, onRename }: Props) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  // How many orders (across every house) use each category — powers the
  // "N in use" hint and the remove confirmation. Cheap to recompute on render.
  const usage: Record<string, number> = {}
  for (const ps of Object.values(projects)) {
    for (const o of ps.orders ?? []) usage[o.category] = (usage[o.category] ?? 0) + 1
  }

  // Names already spoken for — the built-ins (materials + site services) plus
  // the current custom list — lowercased for case-insensitive matching. Passing
  // `except` lets a row skip its OWN name when validating a rename.
  const takenExcept = (except?: string) =>
    new Set(
      [...ORDER_CATEGORIES, ...SITE_SERVICES, ...categories]
        .filter((c) => c !== except)
        .map((c) => c.toLowerCase()),
    )

  /** Validate a proposed name → an error message, or null if it's fine. */
  function validate(name: string, except?: string): string | null {
    const t = name.trim()
    if (!t) return 'Type a name first.'
    if (takenExcept(except).has(t.toLowerCase())) return `“${t}” is already available.`
    return null
  }

  function add() {
    const t = draft.trim()
    const err = validate(t)
    if (err) {
      setError(err)
      return
    }
    onSave([...categories, t])
    setDraft('')
    setError(null)
  }

  function remove(name: string) {
    const count = usage[name] ?? 0
    const msg =
      count > 0
        ? `Remove “${name}” from the picker? ${count} order${count > 1 ? 's' : ''} already placed under it will keep the name — this only takes it out of the dropdown.`
        : `Remove “${name}” from the picker?`
    if (!confirm(msg)) return
    onSave(categories.filter((c) => c !== name))
  }

  return (
    <section className="cme-editor">
      <div className="cme-head">
        <h2>🧱 Custom materials</h2>
      </div>
      <p className="muted">
        Extra materials you can order beyond the built-in list. They appear in every project&rsquo;s 🛒
        Materials picker under &ldquo;Your materials.&rdquo; Changes save automatically.
      </p>

      {categories.length === 0 ? (
        <p className="muted cme-empty">
          None yet — add one below (e.g. Gutters, HVAC, Insulation), or just type a new name into a
          house&rsquo;s &ldquo;➕ Custom material…&rdquo; box and it lands here.
        </p>
      ) : (
        <ul className="cme-list">
          {categories.map((c) => (
            <CustomRow
              key={c}
              name={c}
              count={usage[c] ?? 0}
              validate={(next) => validate(next, c)}
              onRename={onRename}
              onRemove={remove}
            />
          ))}
        </ul>
      )}

      {/* Add a new one. Enter or the button commits; a bad name shows why. */}
      <div className="cme-add">
        <input
          className="cme-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="New material name (e.g. Gutters)"
          aria-label="New custom material name"
        />
        <button className="mini" onClick={add} disabled={!draft.trim()}>
          ＋ Add material
        </button>
      </div>
      {error && <p className="cme-error">{error}</p>}

      {/* Read-only reminder of what's already built in, so you don't re-add it. */}
      <details className="cme-builtins">
        <summary>Built-in materials (always in the picker)</summary>
        <p className="muted cme-builtins-list">{MATERIAL_CATEGORIES.join(' · ')}</p>
      </details>
    </section>
  )
}

/** One editable custom-material row: rename on blur/Enter, remove with the ✕.
 *  Because the list keys rows by name, changing a name remounts the row — so the
 *  local draft always starts fresh from the current name with no syncing. */
function CustomRow({
  name,
  count,
  validate,
  onRename,
  onRemove,
}: {
  name: string
  count: number
  validate: (next: string) => string | null
  onRename: (oldName: string, newName: string) => void
  onRemove: (name: string) => void
}) {
  const [draft, setDraft] = useState(name)
  const [err, setErr] = useState<string | null>(null)

  function commit() {
    const next = draft.trim()
    if (!next || next === name) {
      setDraft(name) // empty or unchanged → snap back, no-op
      setErr(null)
      return
    }
    const e = validate(next)
    if (e) {
      setErr(e) // keep the draft visible so they can fix it
      return
    }
    onRename(name, next)
  }

  return (
    <li className="cme-row">
      <input
        className="cme-input cme-name"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          if (err) setErr(null)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setDraft(name)
            setErr(null)
            e.currentTarget.blur()
          }
        }}
        aria-label={`Rename ${name}`}
      />
      {count > 0 && (
        <span className="cme-count" title={`${count} order${count > 1 ? 's' : ''} use this material`}>
          {count} in use
        </span>
      )}
      <button className="team-x cme-del" title={`Remove ${name}`} aria-label={`Remove ${name}`} onClick={() => onRemove(name)}>
        <Icon name="delete" size={16} />
      </button>
      {err && <span className="cme-row-err">{err}</span>}
    </li>
  )
}

export default CustomMaterialsEditor
