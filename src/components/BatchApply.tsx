/**
 * BatchApply.tsx — ⚡ apply for electric on several houses in minutes.
 *
 * Lists every house that still needs its electric application, grouped by
 * utility. Each row: 👁 preview the fully-filled application, ✉️ draft the
 * email (recipient, subject, packet, and CC all pre-filled from the editable
 * template), 📋 copy the packet text (for the Duke portal), and ✓ Mark applied
 * — which checks the project's verify+submit steps and drops it off this list.
 *
 * No more 9:21pm / 9:23pm / 9:24pm hand-typed application nights.
 */
import { useState } from 'react'
import type { Project, ProjectState, TemplateOverride } from '../types'
import { needsVerify, utilityOf } from '../lib/nextAction'
import { confirmSend } from '../lib/confirmSend'
import { applicationDraft } from '../lib/loadForm'
import { SECO_BLANK_FORM_URL, fillSecoLoadForm } from '../lib/secoForm'
import Icon from './Icon'

interface Props {
  projects: Project[]
  getProjectState: (id: number) => ProjectState
  templates?: Record<string, TemplateOverride>
  markApplied: (id: number) => void
  onClose: () => void
  /** Jump to a project's Electric tab (e.g. to verify its utility first). */
  onOpen: (id: number) => void
}

function BatchApply({ projects, getProjectState, templates, markApplied, onClose, onOpen }: Props) {
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [formBusyId, setFormBusyId] = useState<number | null>(null)

  // Houses that still need an application: active, electric 'submit' not done.
  const candidates = projects.filter((p) => {
    if (p.listStatus === 'CO' || p.listStatus === 'Hold') return false
    const ps = getProjectState(p.id)
    return !ps.steps.electric.submit?.done
  })

  const ready = candidates.filter((p) => {
    const ps = getProjectState(p.id)
    const u = utilityOf(p, ps)
    return (u === 'SECO' || u === 'DUKE') && !needsVerify(p, ps)
  })
  const notReady = candidates.filter((p) => !ready.includes(p))

  const bySeco = ready.filter((p) => utilityOf(p, getProjectState(p.id)) === 'SECO')
  const byDuke = ready.filter((p) => utilityOf(p, getProjectState(p.id)) === 'DUKE')

  async function copyPacket(p: Project) {
    const d = applicationDraft(p, getProjectState(p.id), templates)
    if (!d) return
    await navigator.clipboard.writeText(d.packet)
    setCopiedId(p.id)
    setTimeout(() => setCopiedId(null), 1200)
  }

  // SECO: fetch the bundled blank PDF, pre-fill it from the project, and
  // download it so Adam can tick the few radio buttons, sign, and attach it.
  async function downloadSecoForm(p: Project) {
    setFormBusyId(p.id)
    try {
      const blank = await (await fetch(SECO_BLANK_FORM_URL)).arrayBuffer()
      const bytes = await fillSecoLoadForm(blank, p, getProjectState(p.id))
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `SECO Load Form - ${p.address}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Couldn't build the SECO form: ${(e as Error).message}`)
    } finally {
      setFormBusyId(null)
    }
  }

  const renderGroup = (label: string, group: Project[], utility: 'SECO' | 'DUKE') =>
    group.length > 0 && (
      <div className="ba-group" key={label}>
        <h3>
          {label} <span className="muted">({group.length})</span>
        </h3>
        {/* Plain-English reminder of how THIS utility's process actually works. */}
        <p className="ba-how">
          <Icon name="info" size={16} />
          {utility === 'SECO'
            ? 'SECO is email-first: one email to SECO with the completed load form + site plan attached. Draft it, copy the form data for the PDF, then mark applied.'
            : 'Duke is portal-first, then a reply. Step 1: apply in the Builder Portal. Step 2 unlocks once Duke emails a Work Order # — reply to that email with the completed load form + site plan (keep “WO#…” in the subject).'}
        </p>
        {group.map((p) => {
          const ps = getProjectState(p.id)
          const d = applicationDraft(p, ps, templates)
          if (!d) return null
          const previewBtn = (
            <button className="doc-btn" onClick={() => setPreviewId(previewId === p.id ? null : p.id)}>
              👁 {previewId === p.id ? 'Hide' : 'Preview'}
            </button>
          )
          const copyBtn = (
            <button
              className="doc-btn"
              onClick={() => copyPacket(p)}
              title="Copy the filled load-form data to type into the load form"
            >
              {copiedId === p.id ? '✓ Copied' : '📋 Copy form'}
            </button>
          )
          const appliedBtn = (
            <button
              className="doc-btn applied"
              onClick={() => {
                // Don't let a row be marked applied while it still shows a ⚠ warning
                // (e.g. legal-description-needs-lookup) without a deliberate override.
                if (
                  d.warnings.length > 0 &&
                  !window.confirm(
                    `⚠ ${p.address} still has a warning:\n\n${d.warnings.map((w) => '• ' + w).join('\n')}\n\nMark it applied anyway?`,
                  )
                )
                  return
                markApplied(p.id)
              }}
              title="Check this house's 'verified' + 'application submitted' steps"
            >
              ✓ Mark applied
            </button>
          )
          // SECO's real load form, pre-filled — replaces the text "Copy form"
          // for SECO (Duke keeps Copy form: you type into the .docx Duke sends).
          const secoFormBtn = (
            <button
              className="doc-btn"
              onClick={() => downloadSecoForm(p)}
              disabled={formBusyId === p.id}
              title="Download the SECO load form pre-filled from this project — then tick Single Family / service / e-mail, sign, and attach it"
            >
              📄 {formBusyId === p.id ? 'Building…' : 'Load form (PDF)'}
            </button>
          )
          return (
            <div key={p.id} className="ba-row">
              <div className="ba-info">
                <div className="ba-addr">{p.address}</div>
                <div className="ba-sub muted">
                  {p.model} · {p.subdivision} · parcel {p.parcel}
                  {p.permit && <> · {p.permit}</>}
                </div>
                {d.warnings.length > 0 && (
                  <div className="ba-warn">⚠ {d.warnings.join(' · ')}</div>
                )}
              </div>

              {utility === 'DUKE' ? (
                <div className="ba-steps">
                  <div className="ba-step">
                    <span className="ba-step-label">Step 1</span>
                    <button
                      className="doc-btn"
                      onClick={() => onOpen(p.id)}
                      title="Apply in the Duke Builder Portal (opens this house's Electric tab, where the portal button + fill data live)"
                    >
                      ⚡ Apply in portal
                    </button>
                    <span className="ba-office muted">→ reply goes to {d.to}</span>
                  </div>
                  <div className="ba-step">
                    <span className="ba-step-label">Step 2</span>
                    {p.workOrder ? (
                      <>
                        <a
                          className="doc-btn"
                          href={d.mailto}
                          onClick={(e) => {
                            if (
                              !confirmSend(`Reply to ${d.to} with the load form for ${p.address}?`, [
                                `Keep “WO#${p.workOrder}” in the subject.`,
                                'Attach the completed load form + site plan.',
                              ])
                            )
                              e.preventDefault()
                          }}
                          title={`Reply to ${d.to} with the load form (WO#${p.workOrder})`}
                        >
                          ✉️ Send load form
                        </a>
                        {copyBtn}
                        {previewBtn}
                        {appliedBtn}
                      </>
                    ) : (
                      <>
                        <span className="doc-btn ba-locked">✉️ Send load form</span>
                        <span
                          className="ba-waiting"
                          title="Apply in the portal first; Duke emails a Work Order # (~next day). Paste the WO# in ⚙️ Settings, then reply with the load form."
                        >
                          ⏳ waiting on Duke's WO# email
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="ba-actions">
                  {previewBtn}
                  <a
                    className="doc-btn"
                    href={d.mailto}
                    onClick={(e) => {
                      if (
                        !confirmSend(`Email ${d.to} to apply for ${utility} power at ${p.address}?`, [
                          'Right utility / office for this subdivision?',
                          'Attach the signed load form + site plan.',
                        ])
                      )
                        e.preventDefault()
                    }}
                    title={`Draft to ${d.to} (CC office)`}
                  >
                    ✉️ Draft email
                  </a>
                  {secoFormBtn}
                  {appliedBtn}
                </div>
              )}

              {previewId === p.id && <pre className="ba-preview">{d.body}</pre>}
            </div>
          )
        })}
      </div>
    )

  return (
    <section className="batch-apply">
      <div className="detail-head">
        <button className="mini back" onClick={onClose}>
          ← All projects
        </button>
      </div>
      <h2>⚡ Batch electric applications</h2>
      <p className="muted">
        Every active house that hasn't had its electric application submitted. Draft each email (everything
        pre-filled — tweak wording in 🛠 Templates), send it from your mail app with the site plan attached,
        then hit <b>✓ Mark applied</b> to check it off the house's electric steps.
      </p>

      {ready.length === 0 && <p className="muted pad">🎉 Nothing waiting — every verified house has its application in.</p>}

      {renderGroup('⚡ SECO', bySeco, 'SECO')}
      {renderGroup('⚡ Duke', byDuke, 'DUKE')}

      {notReady.length > 0 && (
        <div className="ba-group">
          <h3>
            ⚠ Verify utility first <span className="muted">({notReady.length})</span>
          </h3>
          <p className="muted ba-note">
            These can't be drafted yet — the utility is unconfirmed, blank, or Clay (applied by phone).
            Open one to set its utility in ⚙️ Settings.
          </p>
          {notReady.map((p) => (
            <div key={p.id} className="ba-row slim">
              <div className="ba-info">
                <div className="ba-addr">{p.address}</div>
                <div className="ba-sub muted">
                  {p.model} · {p.subdivision} · utility: {utilityOf(p, getProjectState(p.id)) || 'not set'}
                </div>
              </div>
              <div className="ba-actions">
                <button className="doc-btn" onClick={() => onOpen(p.id)}>
                  Open →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="muted ba-note">
        📎 SECO: <b>📄 Load form (PDF)</b> downloads the form pre-filled from this project — tick the boxes
        (Single Family / service / e-mail), sign, and attach it with the site plan. Duke's reply attaches the
        completed load form Duke sent you + the site plan (with the septic on it).
      </p>
    </section>
  )
}

export default BatchApply
