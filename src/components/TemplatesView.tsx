/**
 * TemplatesView.tsx — ⚙️ Settings → Templates: edit the wording of every
 * automated workflow in one place.
 *
 * Each template is plain text with {{placeholders}} (the legend shows what's
 * available). Edits save automatically (cloud-synced like everything else) and
 * a live preview shows the result using one of your real projects. "↺ Reset"
 * returns a template to the built-in default.
 *
 * Future workflows (the load form, follow-up emails, …) register themselves in
 * data/templates.ts and appear here automatically.
 */
import { useState } from 'react'
import type { Project, ProjectState, TemplateOverride } from '../types'
import { templateSpecs, type TemplateSpec } from '../data/templates'
import { effectiveTemplate, renderTemplate } from '../lib/templates'
import { VENDORS, vendorTemplateVars } from '../data/vendors'
import { buildDukePacket, buildSecoPacket } from '../lib/loadForm'
import { DOCS_MARKER, permitHandoffVars } from '../lib/permitHandoff'
import { projectStatusVars } from '../lib/statusReport'

interface Props {
  templates: Record<string, TemplateOverride> | undefined
  setTemplate: (id: string, patch: Partial<TemplateOverride> | null) => void
  /** A real project to feed the live preview. */
  sampleProject?: Project
  getProjectState: (id: number) => ProjectState
}

/** Preview variables for a template, using a real project when we have one. */
function previewVars(spec: TemplateSpec, sample: Project | undefined, getPS: (id: number) => ProjectState) {
  if (spec.id.startsWith('vendor:')) {
    const v = VENDORS.find((x) => `vendor:${x.id}` === spec.id) ?? VENDORS[0]
    if (sample) return vendorTemplateVars(v, sample, getPS(sample.id))
    return { vendor: v.name, address: '123 SW Example St', site: '123 SW Example St, Ocala, FL 34470', parcel: '0000-000-000', permit: 'BLDR-26-00-00000', model: 'F-LH', city: 'Ocala', zip: '34470', items: '  • Trusses' }
  }
  if (spec.id.startsWith('apply:') && sample) {
    const ps = getPS(sample.id)
    return {
      address: sample.address,
      site: `${sample.address}, ${sample.city}, FL ${sample.zip}`,
      parcel: sample.parcel,
      permit: sample.permit,
      model: sample.model,
      packet: spec.id === 'apply:SECO' ? buildSecoPacket(sample, ps) : buildDukePacket(sample, ps),
    }
  }
  if (spec.id.startsWith('permit:') && sample) {
    // Preview exactly what the draft will contain: the {{docs}} section is
    // the [PASTE HERE] marker (the real download links ride the clipboard,
    // minted at click time — not on a settings page).
    const vars = permitHandoffVars(sample, getPS(sample.id))
    vars.docs = DOCS_MARKER
    return vars
  }
  if (spec.id.startsWith('status:') && sample) {
    // Subject tokens (date/count/scope) + the per-project body tokens together,
    // so the card previews both the header line and a sample project block.
    return {
      date: new Date().toLocaleDateString(),
      count: '12',
      scope: 'all active',
      ...projectStatusVars(sample, getPS(sample.id), getPS),
    }
  }
  return {}
}

function TemplateCard({
  spec,
  override,
  setTemplate,
  sample,
  getPS,
}: {
  spec: TemplateSpec
  override: TemplateOverride | undefined
  setTemplate: Props['setTemplate']
  sample: Project | undefined
  getPS: (id: number) => ProjectState
}) {
  const [open, setOpen] = useState(false)
  const eff = effectiveTemplate(override ? { [spec.id]: override } : undefined, spec.id, spec)
  const customized = !!override && (override.subject !== undefined || override.body !== undefined)
  const vars = previewVars(spec, sample, getPS)

  return (
    <div className={'tpl-card' + (open ? ' open' : '')}>
      <button className="tpl-head" onClick={() => setOpen((o) => !o)}>
        <span className="tpl-name">
          {spec.icon} {spec.name}
          {customized && <span className="tpl-pill">customized</span>}
        </span>
        <span className="tpl-toggle">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="tpl-body">
          <p className="muted tpl-desc">{spec.description}</p>

          <label className="tpl-label">
            Subject
            <input
              value={eff.subject}
              onChange={(e) => setTemplate(spec.id, { subject: e.target.value })}
            />
          </label>

          <label className="tpl-label">
            Body
            <textarea
              rows={9}
              value={eff.body}
              onChange={(e) => setTemplate(spec.id, { body: e.target.value })}
            />
          </label>

          {/* What you can drop into the text. */}
          <div className="tpl-vars">
            {spec.vars.map((v) => (
              <span key={v.token} className="tpl-var" title={v.desc}>
                <code>{v.token}</code> {v.desc}
              </span>
            ))}
          </div>

          <div className="tpl-preview">
            <div className="tpl-preview-h">
              Preview{sample ? ` — using ${sample.address}` : ''}
            </div>
            <div className="tpl-preview-subject">{renderTemplate(eff.subject, vars)}</div>
            <pre className="tpl-preview-body">{renderTemplate(eff.body, vars)}</pre>
          </div>

          {customized && (
            <button
              className="mini"
              onClick={() => {
                if (confirm(`Reset "${spec.name}" to the default wording?`)) setTemplate(spec.id, null)
              }}
            >
              ↺ Reset to default
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TemplatesView({ templates, setTemplate, sampleProject, getProjectState }: Props) {
  const specs = templateSpecs()
  const groups = [...new Set(specs.map((s) => s.group))]

  return (
    <section className="templates-view">
      <h2>🛠 Templates</h2>
      <p className="muted">
        The wording behind every automated workflow — edit it here once and every button that uses it
        updates everywhere. Use the <code>{'{{placeholders}}'}</code> shown under each editor; they fill in
        live from whichever project you're on. Changes save automatically.
      </p>

      {groups.map((g) => (
        <div key={g} className="tpl-group">
          <h3>{g}</h3>
          {specs
            .filter((s) => s.group === g)
            .map((s) => (
              <TemplateCard
                key={s.id}
                spec={s}
                override={templates?.[s.id]}
                setTemplate={setTemplate}
                sample={sampleProject}
                getPS={getProjectState}
              />
            ))}
        </div>
      ))}

      <p className="muted tpl-coming">
        Coming soon to this page: the SECO/Duke <b>load form</b> templates and any future workflow we add.
      </p>
    </section>
  )
}

export default TemplatesView
