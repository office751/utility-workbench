/**
 * MondayRunbook.tsx — the "Runbook" tab on a property's card in Monday.com.
 *
 * Open a house → see the NEXT step with its action button, the routine
 * watch-items (permit expiry, shut-off deadline, open orders), and the full
 * checklist by stage. Steps are Monday subitems, so they can also be ticked
 * off in plain Monday. Logic lives in runbook.ts; this file is only the UI.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  actionsFor,
  addSteps,
  extraRows,
  loadHouse,
  loadTemplate,
  markPermitIssued,
  missingSteps,
  nextStep,
  routineFor,
  setStepDone,
  stagesFor,
  startRunbook,
  TEMPLATE_BOARD_URL,
  type Action,
  type House,
  type Stage,
  type StepRow,
  type TemplateStep,
} from './runbook'
import { getItemId, inIframe } from './mondayClient'

const CSS = `
.rb{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#eaeaea;background:#181b34;min-height:100vh;padding:16px 20px 40px;box-sizing:border-box}
.rb *{box-sizing:border-box}
.rb h1{font-size:20px;margin:0 0 2px}.rb .sub{color:#9aa0b8;font-size:13px;margin-bottom:14px}
.rb .card{background:#20243f;border:1px solid #2e3358;border-radius:10px;padding:14px 16px;margin-bottom:14px}
.rb .next{border-color:#4f6bff;background:#22285a}
.rb .eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9aa0b8;margin-bottom:4px}
.rb .big{font-size:17px;font-weight:600;margin-bottom:10px}
.rb .btns{display:flex;flex-wrap:wrap;gap:8px}
.rb .btn{display:inline-block;background:#4f6bff;color:#fff;text-decoration:none;border:0;border-radius:6px;padding:7px 12px;font-size:13px;cursor:pointer;font-family:inherit}
.rb .btn.ghost{background:transparent;border:1px solid #4f6bff;color:#c7d0ff}
.rb .btn:disabled{opacity:.5;cursor:default}
.rb .note{color:#c9cde6;font-size:12px;margin-top:8px}
.rb .chips{display:flex;flex-wrap:wrap;gap:6px}
.rb .chip{font-size:12px;padding:4px 9px;border-radius:999px;background:#2e3358;color:#dfe3ff;text-decoration:none}
.rb .chip.crit{background:#7a1f2b;color:#ffd9de}.rb .chip.warn{background:#7a5a12;color:#ffefc2}.rb .chip.ok{background:#1f5a3a;color:#c8f5dc}
.rb .stage{margin-bottom:10px}.rb .stage h3{font-size:14px;margin:0 0 6px;color:#c7d0ff;display:flex;justify-content:space-between}
.rb .step{display:flex;align-items:flex-start;gap:10px;padding:7px 8px;border-radius:6px}
.rb .step:hover{background:#262b4d}.rb .step.done{opacity:.55}.rb .step.isnext{background:#2a3170}
.rb .step input{margin-top:3px;width:16px;height:16px;cursor:pointer}
.rb .step .lbl{flex:1;font-size:13px}.rb .step .when{font-size:11px;color:#9aa0b8}
.rb .mini{font-size:11px;color:#c7d0ff;text-decoration:underline;margin-left:8px;cursor:pointer;background:none;border:0;padding:0;font-family:inherit}
.rb .err{background:#7a1f2b;color:#ffd9de;padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:13px}
.rb .muted{color:#9aa0b8;font-size:13px}
`

export default function MondayRunbook() {
  const [itemId, setItemId] = useState<number | null>(null)
  const [house, setHouse] = useState<House | null>(null)
  const [rows, setRows] = useState<StepRow[]>([])
  const [template, setTemplate] = useState<TemplateStep[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [showAll, setShowAll] = useState(false)

  const reload = useCallback(async (id: number) => {
    try {
      const [r, t] = await Promise.all([loadHouse(id), loadTemplate()])
      setHouse(r.house)
      setRows(r.steps)
      setTemplate(t)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    getItemId().then((id) => {
      if (!id) {
        setErr(inIframe() ? 'Open this view from a property on the Construction Job List.' : 'Add ?item=<monday item id> to the URL to test locally.')
        return
      }
      setItemId(id)
      void reload(id)
    })
  }, [reload])

  const stages: Stage[] = useMemo(() => (house ? stagesFor(house, template) : []), [house, template])
  const missing = useMemo(() => missingSteps(stages, rows), [stages, rows])
  const extras = useMemo(() => extraRows(stages, rows), [stages, rows])
  const next = useMemo(() => (house ? nextStep(house, stages, rows) : null), [house, stages, rows])
  const routine = useMemo(() => (house ? routineFor(house) : []), [house])
  const started = rows.length > 0

  async function run(label: string, fn: () => Promise<void>) {
    if (!itemId) return
    setBusy(label)
    try {
      await fn()
      await reload(itemId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  function onAction(a: Action) {
    if (a.copy) void navigator.clipboard?.writeText(a.copy).catch(() => undefined)
    if (a.special === 'mark-issued' && house) void run('issued', () => markPermitIssued(house))
  }

  const rowFor = (stage: Stage, stepId: string) => rows.find((r) => r.stage === stage.key && r.key === stepId)

  return (
    <div className="rb">
      <style>{CSS}</style>
      {err && <div className="err">{err}</div>}
      {!house && !err && <div className="muted">Loading…</div>}
      {house && (
        <>
          <h1>{house.name}</h1>
          <div className="sub">
            {[house.city, house.subdivision, house.model && `Model ${house.model}`, house.permit && `Permit ${house.permit}`, house.permitStatus].filter(Boolean).join(' · ')}
          </div>

          {!started ? (
            <div className="card next">
              <div className="eyebrow">Runbook</div>
              <div className="big">This house has no checklist yet.</div>
              <div className="muted" style={{ marginBottom: 10 }}>
                Start it to add the standard steps for a {house.waterLabel || 'water-unset'} / {house.septicLabel || 'septic'} lot with {house.electricCo || 'unknown'} power (
                {stages.reduce((n, s) => n + s.steps.length, 0)} steps). Set Water/Well, Septic/Sewer and Electric Co. on the card first if they are blank.
              </div>
              <button className="btn" disabled={!!busy} onClick={() => void run('start', () => startRunbook(house, stages))}>
                {busy === 'start' ? 'Adding steps…' : 'Start runbook'}
              </button>
            </div>
          ) : next ? (
            <div className="card next">
              <div className="eyebrow">Next step · {next.stage.title}</div>
              <div className="big">{next.step.label}</div>
              {next.step.tip && <div className="note" style={{ marginTop: 0, marginBottom: 10 }}>{next.step.tip}</div>}
              <ActionButtons actions={actionsFor(house, next.stage.key, next.step.id)} onAction={onAction} busy={busy} />
              {next.row && (
                <div style={{ marginTop: 12 }}>
                  <button className="btn ghost" disabled={!!busy} onClick={() => void run('done', () => setStepDone(next.row!, true))}>
                    {busy === 'done' ? 'Saving…' : '✓ Mark this step done'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="card next">
              <div className="eyebrow">Runbook</div>
              <div className="big">Every step is done{house.closingDate ? '' : ' — add a Closing Date when it goes under contract'}.</div>
            </div>
          )}

          <div className="card">
            <div className="eyebrow">Keep an eye on</div>
            <div className="chips">
              {routine.map((r, i) =>
                r.href ? (
                  <a key={i} className={`chip ${r.tone}`} href={r.href} target="_blank" rel="noreferrer">
                    {r.text}
                  </a>
                ) : (
                  <span key={i} className={`chip ${r.tone}`}>
                    {r.text}
                  </span>
                ),
              )}
            </div>
          </div>

          {started && (
            <div className="card">
              <div className="eyebrow" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>Checklist</span>
                <span>
                  {missing.length > 0 && (
                    <button className="mini" disabled={!!busy} onClick={() => void run('sync', () => addSteps(house, missing))}>
                      {busy === 'sync' ? 'adding…' : `add ${missing.length} new template step${missing.length === 1 ? '' : 's'}`}
                    </button>
                  )}
                  <a className="mini" href={TEMPLATE_BOARD_URL} target="_blank" rel="noreferrer">
                    edit template
                  </a>
                  <button className="mini" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? 'hide finished' : 'show finished'}
                  </button>
                </span>
              </div>
              {stages.map((stage) => {
                const total = stage.steps.length
                const doneN = stage.steps.filter((s) => rowFor(stage, s.id)?.done).length
                const visible = stage.steps.filter((s) => showAll || !rowFor(stage, s.id)?.done)
                return (
                  <div className="stage" key={stage.key}>
                    <h3>
                      <span>{stage.title}</span>
                      <span className="muted">
                        {doneN}/{total}
                      </span>
                    </h3>
                    {visible.length === 0 && <div className="muted" style={{ padding: '4px 8px' }}>All done.</div>}
                    {visible.map((s) => {
                      const row = rowFor(stage, s.id)
                      const isNext = next?.stage.key === stage.key && next.step.id === s.id
                      const acts = actionsFor(house, stage.key, s.id)
                      return (
                        <div className={`step${row?.done ? ' done' : ''}${isNext ? ' isnext' : ''}`} key={s.id}>
                          <input
                            type="checkbox"
                            checked={!!row?.done}
                            disabled={!row || !!busy}
                            title={row ? '' : 'Not in this house’s checklist yet — re-start the runbook to add new template steps'}
                            onChange={(e) => row && void run('tick', () => setStepDone(row, e.target.checked))}
                          />
                          <div className="lbl">
                            {s.label}
                            {s.tip && !row?.done && <span className="when" title={s.tip}> · {s.tip}</span>}
                            {row?.done && row.doneOn && <span className="when"> · {row.doneOn}</span>}
                            {!row?.done && acts.length > 0 && !isNext && (
                              <span>
                                {acts.slice(0, 2).map((a, i) =>
                                  a.href ? (
                                    <a key={i} className="mini" href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={() => onAction(a)}>
                                      {a.label}
                                    </a>
                                  ) : (
                                    <button key={i} className="mini" onClick={() => onAction(a)}>
                                      {a.label}
                                    </button>
                                  ),
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {extras.filter((r) => showAll || !r.done).length > 0 && (
                <div className="stage">
                  <h3>
                    <span>Other steps for this house</span>
                    <span className="muted">{extras.filter((r) => r.done).length}/{extras.length}</span>
                  </h3>
                  {extras
                    .filter((r) => showAll || !r.done)
                    .map((r) => (
                      <div className={`step${r.done ? ' done' : ''}`} key={r.subitemId}>
                        <input type="checkbox" checked={r.done} disabled={!!busy} onChange={(e) => void run('tick', () => setStepDone(r, e.target.checked))} />
                        <div className="lbl">
                          {r.name}
                          {r.done && r.doneOn && <span className="when"> · {r.doneOn}</span>}
                        </div>
                      </div>
                    ))}
                </div>
              )}
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                Add a one-off step for this house by adding a subitem to it in Monday. Change the steps every house gets on the Runbook Template board.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ActionButtons({ actions, onAction, busy }: { actions: Action[]; onAction: (a: Action) => void; busy: string }) {
  if (!actions.length) return <div className="muted">No shortcut for this step — do it, then mark it done.</div>
  return (
    <div>
      <div className="btns">
        {actions.map((a, i) =>
          a.href ? (
            <a key={i} className="btn" href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={() => onAction(a)}>
              {a.label}
            </a>
          ) : (
            <button key={i} className="btn" disabled={!!busy} onClick={() => onAction(a)}>
              {busy && a.special ? 'Saving…' : a.label}
            </button>
          ),
        )}
      </div>
      {actions.filter((a) => a.note).map((a, i) => (
        <div className="note" key={i}>
          {a.note}
        </div>
      ))}
    </div>
  )
}
