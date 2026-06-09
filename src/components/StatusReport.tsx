/**
 * StatusReport.tsx — 📋 build a status update for whoever needs one.
 *
 * Pick the scope (everything / just some houses), pick the depth (a simple
 * one-line overview or a detailed per-stream block), optionally add a note up
 * top, and a live preview builds as you go. Then 📋 copy it, ✉️ start an email,
 * or 🖨 print it.
 *
 * The wording of both shapes lives in 🛠 Settings → Templates, so Adam controls
 * exactly what each update includes.
 */
import { useMemo, useState } from 'react'
import type { Project, ProjectState, TemplateOverride, WorkbenchState } from '../types'
import { buildStatusReport, openStatusPrint } from '../lib/statusReport'

interface Props {
  projects: Project[]
  getProjectState: (id: number) => ProjectState
  templates?: Record<string, TemplateOverride>
  modelTakeoffs?: WorkbenchState['modelTakeoffs']
  onClose: () => void
}

type Scope = 'all' | 'pick'

function StatusReport({ projects, getProjectState, templates, modelTakeoffs, onClose }: Props) {
  const [scope, setScope] = useState<Scope>('all')
  const [detailed, setDetailed] = useState(false)
  const [includeCO, setIncludeCO] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)

  // Which houses end up in the report.
  const selected = useMemo(() => {
    if (scope === 'pick') return projects.filter((p) => picked.has(p.id))
    return includeCO ? projects : projects.filter((p) => p.listStatus !== 'CO')
  }, [scope, picked, includeCO, projects])

  const scopeLabel =
    scope === 'pick'
      ? `${selected.length} selected`
      : includeCO
        ? 'all projects'
        : 'all active'

  const report = useMemo(
    () => buildStatusReport(selected, getProjectState, { detailed, overrides: templates, modelTakeoffs, note, scope: scopeLabel }),
    [selected, getProjectState, detailed, templates, modelTakeoffs, note, scopeLabel],
  )

  // mailto bodies over ~1800 chars get truncated/dropped by some mail clients.
  const emailTooBig = report.mailto.length > 1900

  const toggle = (id: number) =>
    setPicked((cur) => {
      const next = new Set(cur)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  async function copy() {
    await navigator.clipboard.writeText(report.fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <section className="status-report">
      <div className="detail-head">
        <button className="mini back" onClick={onClose}>
          ← All projects
        </button>
      </div>
      <h2>📋 Status report</h2>
      <p className="muted">
        Pick what to include and how much detail; the preview builds live. Then copy it, start an email, or
        print it. Change the wording any time in 🛠 Settings → Templates.
      </p>

      <div className="sr-controls">
        <div className="sr-row">
          <span className="sr-lbl">Scope</span>
          <div className="seg">
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
              All houses
            </button>
            <button className={scope === 'pick' ? 'on' : ''} onClick={() => setScope('pick')}>
              Pick houses
            </button>
          </div>
          {scope === 'all' && (
            <label className="check sr-co">
              <input type="checkbox" checked={includeCO} onChange={(e) => setIncludeCO(e.target.checked)} />
              include completed (C.O.)
            </label>
          )}
        </div>

        <div className="sr-row">
          <span className="sr-lbl">Detail</span>
          <div className="seg">
            <button className={!detailed ? 'on' : ''} onClick={() => setDetailed(false)}>
              Simple overview
            </button>
            <button className={detailed ? 'on' : ''} onClick={() => setDetailed(true)}>
              Detailed
            </button>
          </div>
        </div>

        <div className="sr-row">
          <span className="sr-lbl">Note</span>
          <input
            className="sr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional message at the top (e.g. “Hi Mickey — here's where we stand:”)"
          />
        </div>
      </div>

      {scope === 'pick' && (
        <div className="sr-pick">
          <div className="sr-pick-head">
            <span className="muted">{selected.length} selected</span>
            <button className="mini" onClick={() => setPicked(new Set(projects.map((p) => p.id)))}>
              All
            </button>
            <button className="mini" onClick={() => setPicked(new Set())}>
              None
            </button>
          </div>
          <div className="sr-pick-grid">
            {projects.map((p) => (
              <label key={p.id} className="check sr-pick-item">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                {p.address} <span className="muted">· {p.model}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="sr-actions">
        <button className="doc-btn" onClick={copy} disabled={selected.length === 0}>
          {copied ? '✓ Copied!' : '📋 Copy report'}
        </button>
        <a
          className={'doc-btn' + (selected.length === 0 ? ' disabled' : '')}
          href={selected.length === 0 ? undefined : report.mailto}
          title={emailTooBig ? 'Long report — Copy may paste more reliably than email' : 'Start an email with this report'}
        >
          ✉️ Email report
        </a>
        <button className="doc-btn" onClick={() => openStatusPrint(report)} disabled={selected.length === 0}>
          🖨 Print
        </button>
        <span className="muted sr-count">
          {selected.length} project{selected.length === 1 ? '' : 's'} · {detailed ? 'detailed' : 'simple'}
        </span>
      </div>

      {emailTooBig && (
        <p className="sr-hint">⚠ This report is long — the email button may truncate it. Copy &amp; paste is more reliable for big updates.</p>
      )}

      <div className="sr-preview-h">Preview</div>
      <pre className="sr-preview">{report.fullText}</pre>
    </section>
  )
}

export default StatusReport
