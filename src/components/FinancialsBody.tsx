/**
 * FinancialsBody.tsx — the 💵 Draws tab on a project (construction-loan draw
 * tracking). Rendered ONLY for roles with canSeeFinancials (admin + business
 * owner) — the tab pill itself is gated in Detail.tsx.
 *
 * Two modes:
 *  1. No tracking yet → a setup card: pick a draw-schedule template (🛠
 *     Settings → Draw schedule templates), fill in the lender, start.
 *     Starting COPIES the template onto the project — from then on this
 *     contract's stages/amounts/checklists are its own (every contract's
 *     draw schedule is a bit different — that's the whole design).
 *  2. Tracking → the loan header card + one card per draw: a checklist of
 *     what must be done (and attached as proof), the "📨 Request draw" email
 *     button (Adam's real wording, see the 'draw:request' template), and
 *     requested/funded stamps.
 *
 * All the actual logic (status, drafts, template copying) lives in
 * lib/draws.ts where it's unit-tested; this file is just the rendering.
 */
import { useState } from 'react'
import type { Project, ProjectDraw, ProjectFinancials, ProjectState, TemplateOverride } from '../types'
import type { DrawTemplate } from '../data/drawTemplates'
import {
  DRAW_STATUS_LABEL,
  blankDraw,
  drawRequestDraft,
  drawStatus,
  drawsSummary,
  instantiateDraws,
} from '../lib/draws'
import GuideCallout from './GuideCallout'
import Icon from './Icon'

/** YYYY-MM-DD → the short local form the rest of the app shows (7/2/2026).
 *  Noon avoids the classic off-by-one-day timezone trap on date-only strings. */
function friendlyDate(ymd: string): string {
  const ms = Date.parse(`${ymd}T12:00:00`)
  return Number.isNaN(ms) ? ymd : new Date(ms).toLocaleDateString()
}

/** Today as YYYY-MM-DD (the closingDate convention). */
const today = () => new Date().toISOString().slice(0, 10)

interface Props {
  project: Project
  ps: ProjectState
  /** Owner-editable schedule templates (Settings → Draw schedule templates). */
  drawTemplates: DrawTemplate[]
  /** Custom email wording (Settings → Templates, id 'draw:request'). */
  templates?: Record<string, TemplateOverride>
  setFinancials: (id: number, fin: ProjectFinancials | undefined) => void
  updateDraw: (id: number, drawId: string, patch: Partial<ProjectDraw> | null) => void
  addDraw: (id: number, draw: ProjectDraw) => void
}

function FinancialsBody({ project: p, ps, drawTemplates, templates, setFinancials, updateDraw, addDraw }: Props) {
  const fin = ps.financials
  return fin ? (
    <Tracking
      p={p}
      fin={fin}
      templates={templates}
      setFinancials={setFinancials}
      updateDraw={updateDraw}
      addDraw={addDraw}
    />
  ) : (
    <Setup p={p} drawTemplates={drawTemplates} setFinancials={setFinancials} />
  )
}

/* ==================== mode 1: start tracking ==================== */

function Setup({
  p,
  drawTemplates,
  setFinancials,
}: {
  p: Project
  drawTemplates: DrawTemplate[]
  setFinancials: Props['setFinancials']
}) {
  const [templateId, setTemplateId] = useState(drawTemplates[0]?.id ?? '')
  const picked = drawTemplates.find((t) => t.id === templateId)
  // Lender fields start from the template's defaults but are per-contract.
  const [lender, setLender] = useState('')
  const [lenderEmail, setLenderEmail] = useState('')
  const [loanNumber, setLoanNumber] = useState('')
  const [contractPrice, setContractPrice] = useState('')

  function start() {
    setFinancials(p.id, {
      templateId: picked?.id,
      lender: lender.trim() || picked?.lender,
      lenderEmail: lenderEmail.trim() || picked?.email,
      loanNumber: loanNumber.trim() || undefined,
      contractPrice: contractPrice.trim() || undefined,
      draws: picked ? instantiateDraws(picked) : [],
    })
  }

  return (
    <div className="fin-setup vend-card">
      <h3 className="fin-title">💵 Track this house's construction-loan draws</h3>
      <p className="muted">
        Pick the schedule that matches this contract — it's copied onto the house, so you can tune every
        stage, amount, and checklist for THIS deal without touching the template. Templates are edited in
        🛠 Settings → Draw schedule templates.
      </p>
      <div className="vend-row">
        <label className="vend-f vend-grow">
          Draw schedule
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {drawTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.stages.length} draws)
              </option>
            ))}
            <option value="">Blank — I'll add draws myself</option>
          </select>
        </label>
      </div>
      {picked?.description && <p className="muted fin-tpl-desc">{picked.description}</p>}
      <div className="vend-row">
        <label className="vend-f vend-grow">
          Lender
          <input value={lender} onChange={(e) => setLender(e.target.value)} placeholder={picked?.lender ?? 'FACO Lending'} />
        </label>
        <label className="vend-f vend-grow">
          Lender email (draw requests go here)
          <input value={lenderEmail} onChange={(e) => setLenderEmail(e.target.value)} placeholder={picked?.email ?? 'draws@lender.com'} />
        </label>
      </div>
      <div className="vend-row">
        <label className="vend-f">
          Loan # (optional)
          <input value={loanNumber} onChange={(e) => setLoanNumber(e.target.value)} placeholder="126863" />
        </label>
        <label className="vend-f">
          Contract price (optional)
          <input value={contractPrice} onChange={(e) => setContractPrice(e.target.value)} placeholder="$255,685" />
        </label>
      </div>
      <button className="btn btn-primary btn-sm" onClick={start}>
        <Icon name="request_quote" size={16} />
        Start draw tracking
      </button>
    </div>
  )
}

/* ==================== mode 2: the schedule ==================== */

function Tracking({
  p,
  fin,
  templates,
  setFinancials,
  updateDraw,
  addDraw,
}: {
  p: Project
  fin: ProjectFinancials
  templates?: Record<string, TemplateOverride>
  setFinancials: Props['setFinancials']
  updateDraw: Props['updateDraw']
  addDraw: Props['addDraw']
}) {
  const [editingLoan, setEditingLoan] = useState(false)

  return (
    <div className="fin">
      {/* ---- loan header: who's lending, and where the schedule stands ---- */}
      <div className="fin-head vend-card">
        {editingLoan ? (
          <>
            <div className="vend-row">
              <label className="vend-f vend-grow">
                Lender
                <input value={fin.lender ?? ''} onChange={(e) => setFinancials(p.id, { ...fin, lender: e.target.value })} />
              </label>
              <label className="vend-f vend-grow">
                Lender email
                <input value={fin.lenderEmail ?? ''} onChange={(e) => setFinancials(p.id, { ...fin, lenderEmail: e.target.value })} />
              </label>
            </div>
            <div className="vend-row">
              <label className="vend-f">
                Loan #
                <input value={fin.loanNumber ?? ''} onChange={(e) => setFinancials(p.id, { ...fin, loanNumber: e.target.value })} />
              </label>
              <label className="vend-f">
                Contract price
                <input value={fin.contractPrice ?? ''} onChange={(e) => setFinancials(p.id, { ...fin, contractPrice: e.target.value })} />
              </label>
              <button className="mini" onClick={() => setEditingLoan(false)}>
                Done
              </button>
            </div>
          </>
        ) : (
          <div className="fin-head-row">
            <div>
              <div className="fin-head-lender">
                {fin.lender || '(no lender set)'}
                {fin.loanNumber && <span className="muted"> · Loan #{fin.loanNumber}</span>}
                {fin.contractPrice && <span className="muted"> · {fin.contractPrice}</span>}
              </div>
              <div className="muted">{drawsSummary(fin)}</div>
            </div>
            <button className="mini" onClick={() => setEditingLoan(true)}>
              ✏️ Edit loan info
            </button>
          </div>
        )}
      </div>

      <GuideCallout id="request-draw" />

      {/* ---- one card per draw ---- */}
      {fin.draws.map((d) => (
        <DrawCard key={d.id} p={p} fin={fin} d={d} templates={templates} updateDraw={updateDraw} />
      ))}

      <div className="fin-foot">
        <button className="mini" onClick={() => addDraw(p.id, blankDraw())}>
          ＋ Add draw
        </button>
        <button
          className="mini fin-stop"
          onClick={() => {
            if (window.confirm('Stop tracking draws on this house? The schedule and its check-offs are removed (the templates in Settings are untouched).'))
              setFinancials(p.id, undefined)
          }}
        >
          Stop tracking
        </button>
      </div>
    </div>
  )
}

/** One draw: label + amount + status, its checklist, and the request/funded actions. */
function DrawCard({
  p,
  fin,
  d,
  templates,
  updateDraw,
}: {
  p: Project
  fin: ProjectFinancials
  d: ProjectDraw
  templates?: Record<string, TemplateOverride>
  updateDraw: Props['updateDraw']
}) {
  const [newItem, setNewItem] = useState('')
  const status = drawStatus(d)
  const draft = drawRequestDraft(p, fin, d, templates)

  const setItems = (items: ProjectDraw['items']) => updateDraw(p.id, d.id, { items })

  return (
    <div className={`fin-draw vend-card fin-draw--${status}`}>
      <div className="fin-draw-head">
        <input
          className="fin-draw-label"
          value={d.label}
          onChange={(e) => updateDraw(p.id, d.id, { label: e.target.value })}
          placeholder="3rd Draw"
        />
        <input
          className="fin-draw-amount"
          value={d.amount ?? ''}
          onChange={(e) => updateDraw(p.id, d.id, { amount: e.target.value || undefined })}
          placeholder="$45,000"
        />
        <span className={`fin-chip fin-chip--${status}`}>{DRAW_STATUS_LABEL[status]}</span>
        <button
          className="team-x"
          title="Remove this draw"
          aria-label={`Remove ${d.label || 'draw'}`}
          onClick={() => {
            if (window.confirm(`Remove "${d.label || 'this draw'}" from the schedule?`)) updateDraw(p.id, d.id, null)
          }}
        >
          <Icon name="delete" size={16} />
        </button>
      </div>

      {/* What must be true (and attached as proof) before requesting. */}
      <ul className="fin-items">
        {d.items.map((it) => (
          <li key={it.id}>
            <label className="fin-item">
              <input
                type="checkbox"
                checked={!!it.done}
                onChange={() => setItems(d.items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
              />
              <span className={it.done ? 'fin-item-done' : ''}>{it.text}</span>
            </label>
            <button
              className="team-x fin-item-x"
              title="Remove item"
              aria-label={`Remove ${it.text}`}
              onClick={() => setItems(d.items.filter((x) => x.id !== it.id))}
            >
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
        <li className="fin-item-add">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newItem.trim()) {
                setItems([...d.items, { id: `di-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`, text: newItem.trim() }])
                setNewItem('')
              }
            }}
            placeholder="＋ add a checklist item, Enter to save"
          />
        </li>
      </ul>

      {/* Actions: draft the request email + stamp the dates. Requesting is
          never HARD-blocked on the checklist (fail open — the lender call is
          Adam's); the status chip is the advice. */}
      <div className="fin-draw-actions">
        {!d.requestedOn && !d.fundedOn && (
          <a
            className={`btn btn-secondary btn-sm${fin.lenderEmail ? '' : ' btn-disabled'}`}
            href={fin.lenderEmail ? draft.mailto : undefined}
            title={fin.lenderEmail ? `To: ${draft.to}` : 'Set the lender email first (✏️ Edit loan info)'}
            onClick={(e) => {
              if (!fin.lenderEmail) {
                e.preventDefault()
                return
              }
              updateDraw(p.id, d.id, { requestedOn: today() })
            }}
          >
            <Icon name="outgoing_mail" size={16} />
            Request draw…
          </a>
        )}
        {d.requestedOn && !d.fundedOn && (
          <>
            <span className="muted">Requested {friendlyDate(d.requestedOn)}</span>
            {/* Re-open the same draft (lender asked for a resend / more info). */}
            <a className="btn btn-ghost btn-sm" href={draft.mailto} title={`To: ${draft.to}`}>
              <Icon name="outgoing_mail" size={16} />
              Draft again
            </a>
            <button className="btn btn-secondary btn-sm" onClick={() => updateDraw(p.id, d.id, { fundedOn: today() })}>
              <Icon name="paid" size={16} />
              Mark funded
            </button>
            <button className="mini" onClick={() => updateDraw(p.id, d.id, { requestedOn: undefined })}>
              undo
            </button>
          </>
        )}
        {d.fundedOn && (
          <>
            <span className="fin-funded">✓ Funded {friendlyDate(d.fundedOn)}</span>
            <button className="mini" onClick={() => updateDraw(p.id, d.id, { fundedOn: undefined })}>
              undo
            </button>
          </>
        )}
      </div>
      {!d.requestedOn && !d.fundedOn && (
        <p className="muted fin-attach-note">
          Attach the proof (inspection approvals, survey, C.O.) before sending — a draft can't carry files.
        </p>
      )}
    </div>
  )
}

export default FinancialsBody
