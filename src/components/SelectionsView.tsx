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
import { useEffect, useState } from 'react'
import type {
  Project,
  ProjectState,
  SelectionChoice,
  SelectionsCatalog,
  ShareSubmissionChoices,
} from '../types'
import { defaultSelections, resolveSelectionSections } from '../data/selections'
import { buildSelectionsReport, openSelectionsPrint, selectionsMailto } from '../lib/selectionsReport'
import {
  browseUrlFor,
  buildSharePayload,
  countShareChoices,
  createOrRefreshShare,
  getShareForProject,
  pendingSubmissionsFor,
  resolveSubmissions,
  revokeShare,
  shareUrlFor,
  type ShareRow,
  type SubmissionRow,
} from '../lib/selectionShare'
import { hasSupabase } from '../lib/supabase'
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
  /** Apply a client's share-link submission onto the saved selections (one
   *  setState in useProjects — see the 📥 review banner below). */
  applySelectionSubmission: (id: number, sub: ShareSubmissionChoices) => void
  /** The owner-editable catalog (Settings → Selections setup). Resolved per
   *  model here; falls back to code defaults when absent. */
  catalog?: SelectionsCatalog
  /** The effective vendors directory — finish-trade recipients + browse links. */
  vendors: Vendor[]
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
  applySelectionSubmission,
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

  /* ---- Client share link (lib/selectionShare.ts) ----
     `share` = this house's active link, if one was minted; `pending` = client
     submissions waiting for review (newest first). Both live in their own
     Postgres tables — nothing here touches the workbench blob. */
  const [share, setShare] = useState<ShareRow | null>(null)
  const [pending, setPending] = useState<SubmissionRow[]>([])
  useEffect(() => {
    if (!hasSupabase) return
    let alive = true // ignore results that land after we switched houses
    getShareForProject(p.id).then((row) => alive && setShare(row))
    pendingSubmissionsFor(p.id).then((rows) => alive && setPending(rows))
    return () => {
      alive = false
    }
  }, [p.id])

  function note(msg: string, ms = 4000) {
    setActionNote(msg)
    setTimeout(() => setActionNote(null), ms)
  }

  /** Mint (or refresh) this house's client link and copy it. Re-clicking is
   *  safe: same token, same URL — just a fresh snapshot of catalog + choices. */
  async function makeClientLink() {
    const payload = buildSharePayload(p, ps.selections, sections, vendors)
    const row = await createOrRefreshShare(p.id, payload)
    if (!row) return note('Could not create the link — cloud not connected.')
    setShare(row)
    try {
      await navigator.clipboard.writeText(shareUrlFor(row.token))
      note(share ? 'Link refreshed with today’s form & copied ✓' : 'Client link copied ✓ — text or email it')
    } catch {
      note('Link ready below — use its Copy button.')
    }
  }

  async function copyShareUrl() {
    if (!share) return
    try {
      await navigator.clipboard.writeText(shareUrlFor(share.token))
      note('Copied ✓')
    } catch {
      note('Copy failed — long-press / select the link text instead.')
    }
  }

  async function doRevoke() {
    if (!share) return
    if (!confirm('Turn off the client link? Anyone holding the URL loses access immediately. You can make a new link any time.')) return
    if (await revokeShare(share.token)) {
      setShare(null)
      note('Link revoked.')
    } else {
      note('Could not revoke — check the connection and try again.')
    }
  }

  /** Apply the newest client submission to the saved selections. Older pending
   *  ones (superseded) are marked dismissed so the banner clears everywhere. */
  async function applySubmission() {
    const latest = pending[0]
    if (!latest || locked) return
    const who = latest.client_name.trim() || 'the client'
    if (
      !confirm(
        `Apply ${who}'s submitted choices to ${p.address}?\n\nCategories they answered replace what's saved; everything they left blank stays as-is. You can still edit before locking.`,
      )
    )
      return
    applySelectionSubmission(p.id, latest.choices)
    await resolveSubmissions(latest.id, pending.slice(1).map((s) => s.id))
    setPending([])
    note('Applied ✓ — look it over, then lock when the client signs.')
  }

  async function dismissSubmissions() {
    if (!pending.length) return
    if (!confirm('Dismiss the submitted choices without applying them?')) return
    await resolveSubmissions(null, pending.map((s) => s.id))
    setPending([])
  }

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

      {/* 📥 A client filled out their share link — review & apply. Shows the
          NEWEST submission; applying dismisses older superseded ones too. */}
      {pending.length > 0 && (
        <div className="sel-sub-banner">
          <Icon name="move_to_inbox" size={20} className="sel-sub-icon" fill />
          <span className="sel-sub-meta">
            <b>{pending[0].client_name.trim() || 'Client'} submitted choices</b> (
            {countShareChoices(pending[0].choices)} answered) on{' '}
            {new Date(pending[0].submitted_at).toLocaleString()}
            {pending.length > 1 ? ` — plus ${pending.length - 1} older` : ''}.{' '}
            {locked ? 'Unlock the form below to apply them.' : 'Applying fills the form below; you can still edit before locking.'}
          </span>
          <span className="sel-spacer" />
          <button className="btn btn-primary btn-sm" disabled={locked} onClick={applySubmission}>
            <Icon name="task_alt" size={16} />
            Apply
          </button>
          <button className="btn btn-secondary btn-sm" onClick={dismissSubmissions}>
            Dismiss
          </button>
        </div>
      )}

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
        {hasSupabase && (
          <button
            className="btn btn-secondary btn-sm"
            disabled={locked}
            title={
              locked
                ? 'Selections are locked — unlock to share'
                : 'Make a private link the client opens on their phone — no login'
            }
            onClick={makeClientLink}
          >
            <Icon name="link" size={16} />
            {share ? 'Refresh client link' : 'Client link'}
          </button>
        )}
        {actionNote && <span className="sel-action-note">{actionNote}</span>}
      </div>

      {/* The active client link — text/email THIS to the homeowner. Refresh
          re-snapshots the form (same URL); Revoke kills it immediately. */}
      {share && (
        <div className="sel-share-row">
          <Icon name="phone_iphone" size={16} color="var(--rust)" />
          <span className="sel-share-label">Client link</span>
          <code className="sel-share-url">{shareUrlFor(share.token)}</code>
          <button className="btn btn-secondary btn-sm" onClick={copyShareUrl}>
            <Icon name="content_copy" size={14} />
            Copy
          </button>
          <button className="btn btn-secondary btn-sm" onClick={doRevoke}>
            <Icon name="link_off" size={14} />
            Revoke
          </button>
        </div>
      )}

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
                    {browseUrlFor(cat, vendors) && (
                      <a
                        className="sel-browse"
                        href={browseUrlFor(cat, vendors)}
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
