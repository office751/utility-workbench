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
import { applicationDraft } from '../lib/loadForm'

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

  const renderGroup = (label: string, group: Project[]) =>
    group.length > 0 && (
      <div className="ba-group" key={label}>
        <h3>
          {label} <span className="muted">({group.length})</span>
        </h3>
        {group.map((p) => {
          const ps = getProjectState(p.id)
          const d = applicationDraft(p, ps, templates)
          if (!d) return null
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
              <div className="ba-actions">
                <button className="doc-btn" onClick={() => setPreviewId(previewId === p.id ? null : p.id)}>
                  👁 {previewId === p.id ? 'Hide' : 'Preview'}
                </button>
                <a className="doc-btn" href={d.mailto} title={`Draft to ${d.to} (CC office)`}>
                  ✉️ Draft email
                </a>
                <button className="doc-btn" onClick={() => copyPacket(p)} title="Copy just the filled form (e.g. for the Duke portal)">
                  {copiedId === p.id ? '✓ Copied' : '📋 Copy form'}
                </button>
                <button
                  className="doc-btn applied"
                  onClick={() => markApplied(p.id)}
                  title="Check this house's 'verified' + 'application submitted' steps"
                >
                  ✓ Mark applied
                </button>
              </div>
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

      {renderGroup('⚡ SECO', bySeco)}
      {renderGroup('⚡ Duke', byDuke)}

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
        📎 Reminder: SECO wants the signed notification form + site plan attached; Duke wants the site plan.
        Attach from the project's 📎 Files before sending.
      </p>
    </section>
  )
}

export default BatchApply
