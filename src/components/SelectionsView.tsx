/**
 * SelectionsView.tsx — the per-project "Selections" tab.
 *
 * The in-app twin of the printed Client Selections & Finishes form: the
 * homeowner's design choices for one house (Interior + Exterior), an
 * Additional Requests box, and a sign-off that LOCKS everything read-only.
 *
 * Like the other stream bodies (e.g. MaterialsBody), this returns a bare
 * fragment — Detail.tsx supplies the surrounding card, header, and tab strip.
 * It reads its data from `ps.selections` and saves through the updater props
 * threaded down from App (useProjects). The category catalog lives in
 * data/selections.ts, so adding a choice is a config edit, not a code change.
 */
import { useState } from 'react'
import type { Project, ProjectState, SelectionCategory, SelectionChoice, SelectionsCatalog } from '../types'
import { defaultSelections, resolveSelectionSections } from '../data/selections'
import { buildSelectionsReport, openSelectionsPrint, selectionsMailto } from '../lib/selectionsReport'
import { finishVendors, type Vendor } from '../data/vendors'
import { modelKey } from '../data/models'
import { OFFICE_CC } from '../data/contacts'
import Icon from './Icon'

interface Props {
  project: Project
  ps: ProjectState
  setSelection: (
    id: number,
    area: 'interior' | 'exterior',
    categoryId: string,
    choice: SelectionChoice,
  ) => void
  setAdditionalRequests: (id: number, text: string) => void
  lockSelections: (id: number, signature: string, printedName: string) => void
  unlockSelections: (id: number) => void
  /** The owner-editable catalog (Settings → Selections setup). Resolved per
   *  model here; falls back to code defaults when absent. */
  catalog?: SelectionsCatalog
  /** The effective vendors directory — finish-trade recipients + browse links. */
  vendors: Vendor[]
}

/** The client's "browse options online" link for a category: its own url wins,
 *  else the linked vendor's website (data/vendors.ts), else none. */
function browseUrl(cat: SelectionCategory, vendors: Vendor[]): string | undefined {
  const direct = cat.url?.trim()
  if (direct) return direct
  if (cat.vendorId) return vendors.find((v) => v.id === cat.vendorId)?.website || undefined
  return undefined
}

/** Format an ISO timestamp as a friendly local date+time, blank-safe. */
function whenLocked(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function SelectionsView({
  project: p,
  ps,
  setSelection,
  setAdditionalRequests,
  lockSelections,
  unlockSelections,
  catalog,
  vendors,
}: Props) {
  const sel = ps.selections ?? defaultSelections()
  const locked = sel.lock?.locked ?? false
  // The effective catalog for THIS house's model (per-model hides/overrides).
  const sections = resolveSelectionSections(catalog, modelKey(p.model))
  const report = buildSelectionsReport(p, ps, sections)

  // Local inputs for the sign-off line (only used while unlocked).
  const [sig, setSig] = useState('')
  const [printed, setPrinted] = useState('')
  const [actionNote, setActionNote] = useState<string | null>(null)

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report.fullText)
      setActionNote('Copied ✓')
    } catch {
      setActionNote('Copy failed — select the printed page text instead')
    }
    setTimeout(() => setActionNote(null), 2500)
  }

  // Email recipients: the finish-trade vendors (data/vendors.ts). Default-check
  // the ones that have an email on file.
  const finVendors = finishVendors(vendors)
  const [recipients, setRecipients] = useState<Set<string>>(
    () => new Set(finVendors.filter((v) => v.email).map((v) => v.id)),
  )
  function toggleRecipient(id: string) {
    setRecipients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const canEmail = finVendors.some((v) => v.email && recipients.has(v.id))

  function emailVendors() {
    const chosen = finVendors.filter((v) => v.email && recipients.has(v.id))
    if (!chosen.length) return
    const to = chosen.flatMap((v) => (v.cc ? [v.email, v.cc] : [v.email]))
    const mailto = selectionsMailto(report, to, [OFFICE_CC])
    // A very long selections list can overflow some mail clients' mailto limit.
    if (mailto.length > 1900) {
      setActionNote('Long list — if the draft looks cut off, use Copy and paste it in instead.')
      setTimeout(() => setActionNote(null), 4500)
    }
    // .assign() = same navigation as `location.href = …`, phrased as a method
    // call (the lint's immutability rule flags assigning to a global).
    window.location.assign(mailto)
  }

  function doLock() {
    if (!sig.trim()) return
    if (
      confirm(
        `Lock these selections for ${p.address}?\n\nThis records ${sig.trim()} as the client's final choices and makes the form read-only. An admin can unlock it later if something needs to change.`,
      )
    ) {
      lockSelections(p.id, sig.trim(), printed.trim())
    }
  }

  function doUnlock() {
    if (confirm('Unlock these selections so they can be edited again?')) {
      unlockSelections(p.id)
    }
  }

  return (
    <>
      <p className="summary">
        <Icon name="checklist" size={15} color="var(--rust)" /> The client's final finish choices for
        this house. Pick a common option or type your own; lock it when they sign off.
      </p>

      {/* Export / share the package. Print → "Save as PDF" for the laminated
          job-site copy; Copy → paste anywhere; Email (below) → the finish trades. */}
      <div className="sel-actions">
        <button className="btn btn-secondary btn-sm" onClick={copyReport}>
          <Icon name="content_copy" size={16} />
          Copy
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => openSelectionsPrint(report, p)}>
          <Icon name="print" size={16} />
          Print / Save PDF
        </button>
        <button className="btn btn-primary btn-sm" disabled={!canEmail} onClick={emailVendors}>
          <Icon name="mail" size={16} />
          Email finish trades
        </button>
        {actionNote && <span className="sel-action-note">{actionNote}</span>}
      </div>

      <div className="sel-recipients">
        {finVendors.length === 0 ? (
          <span className="sel-action-note">
            No finish-trade vendors yet — add cabinet / flooring / tile / paint / lighting vendors in
            the Vendors directory (mark each as a finish trade) and they'll appear here.
          </span>
        ) : (
          <>
            <span className="sel-recip-label">To:</span>
            {finVendors.map((v) => (
              <label
                key={v.id}
                className={'sel-recip' + (v.email ? '' : ' no-email')}
                title={v.email || 'No email on file yet — add it in the Vendors directory'}
              >
                <input
                  type="checkbox"
                  disabled={!v.email}
                  checked={recipients.has(v.id)}
                  onChange={() => toggleRecipient(v.id)}
                />
                {v.name}
                {!v.email && ' — no email yet'}
              </label>
            ))}
            <span className="sel-recip-cc">cc {OFFICE_CC}</span>
          </>
        )}
      </div>

      {sections.map((section) => (
        <div className="sel-section" key={section.id}>
          <h3 className="sel-section-title">
            <Icon name={section.icon} size={18} color="var(--rust)" />
            {section.label}
          </h3>
          <div className="sel-rows">
            {section.categories.map((cat) => {
              const choice = sel[section.id][cat.id] ?? {}
              const fieldId = `sel-${section.id}-${cat.id}`
              // Show a clickable swatch grid when any option has a photo;
              // otherwise the plain dropdown.
              const hasSwatches =
                cat.options.length > 0 && !!cat.optionImages && cat.options.some((o) => !!cat.optionImages![o])
              return (
                <div className="sel-row" key={cat.id}>
                  <div className="sel-label">
                    <label htmlFor={fieldId}>{cat.label}</label>
                    {browseUrl(cat, vendors) && (
                      <a
                        className="sel-browse"
                        href={browseUrl(cat, vendors)}
                        target="_blank"
                        rel="noreferrer"
                        title="Browse options online"
                      >
                        Browse ↗
                      </a>
                    )}
                  </div>
                  <div className={'sel-controls' + (hasSwatches ? ' has-swatches' : '')}>
                    {cat.options.length > 0 &&
                      (hasSwatches ? (
                        <div className="sel-swatches" role="radiogroup" aria-label={cat.label}>
                          {cat.options.map((o) => {
                            const img = cat.optionImages?.[o]
                            const isSel = choice.option === o
                            return (
                              <button
                                type="button"
                                key={o}
                                className={'sel-swatch' + (isSel ? ' selected' : '')}
                                disabled={locked}
                                aria-pressed={isSel}
                                title={o}
                                onClick={() =>
                                  setSelection(p.id, section.id, cat.id, {
                                    ...choice,
                                    option: isSel ? undefined : o,
                                  })
                                }
                              >
                                {img ? (
                                  <img className="sel-swatch-img" src={img} alt="" />
                                ) : (
                                  <span className="sel-swatch-img sel-swatch-noimg">
                                    <Icon name="image" size={18} />
                                  </span>
                                )}
                                <span className="sel-swatch-label">{o}</span>
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <select
                          id={fieldId}
                          className="sel-select"
                          value={choice.option ?? ''}
                          disabled={locked}
                          onChange={(e) =>
                            setSelection(p.id, section.id, cat.id, {
                              ...choice,
                              option: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">— choose —</option>
                          {cat.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ))}
                    <input
                      // when there's no option list this input gets the field id
                      id={cat.options.length === 0 ? fieldId : undefined}
                      className="sel-writein"
                      value={choice.writeIn ?? ''}
                      disabled={locked}
                      placeholder={
                        cat.hint ? `${cat.hint}…` : cat.options.length ? 'Other / notes…' : 'Type choice…'
                      }
                      onChange={(e) =>
                        setSelection(p.id, section.id, cat.id, {
                          ...choice,
                          writeIn: e.target.value || undefined,
                        })
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="sel-section">
        <h3 className="sel-section-title">
          <Icon name="edit_note" size={18} color="var(--rust)" />
          Additional Requests
        </h3>
        <textarea
          className="sel-additional"
          rows={4}
          value={sel.additionalRequests ?? ''}
          disabled={locked}
          placeholder="Anything not listed above — special requests, upgrades, notes. (Subject to builder review; may affect cost or timeline.)"
          onChange={(e) => setAdditionalRequests(p.id, e.target.value)}
        />
      </div>

      {/* ---- Sign-off lock-in ---- */}
      {locked ? (
        <div className="sel-locked-banner">
          <Icon name="lock" size={20} className="sel-locked-icon" fill />
          <span className="sel-locked-meta">
            <b>Selections locked.</b> Signed by {sel.lock?.signature || '—'}
            {sel.lock?.printedName ? ` (${sel.lock.printedName})` : ''}
            {whenLocked(sel.lock?.lockedAt) ? ` on ${whenLocked(sel.lock?.lockedAt)}` : ''}.
          </span>
          <span className="sel-spacer" />
          <button className="btn btn-secondary btn-sm" onClick={doUnlock}>
            <Icon name="lock_open" size={16} />
            Unlock
          </button>
        </div>
      ) : (
        <div className="sel-lock">
          <p className="sel-lock-title">
            <Icon name="draw" size={18} color="var(--rust)" />
            Sign &amp; lock these selections
          </p>
          <div className="sel-lock-fields">
            <label className="sel-lock-field">
              CLIENT SIGNATURE
              <input
                value={sig}
                onChange={(e) => setSig(e.target.value)}
                placeholder="Type full name to sign"
              />
            </label>
            <label className="sel-lock-field">
              PRINTED NAME (OPTIONAL)
              <input
                value={printed}
                onChange={(e) => setPrinted(e.target.value)}
                placeholder="Printed name"
              />
            </label>
            <button className="btn btn-primary" disabled={!sig.trim()} onClick={doLock}>
              <Icon name="lock" size={16} />
              Lock selections
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default SelectionsView
