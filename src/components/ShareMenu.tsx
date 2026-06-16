/**
 * ShareMenu.tsx — the 📤 Share button on the Projects landing.
 *
 * Three ways to hand the list to someone:
 *   📊 Excel (.xlsx)  — every column; current view or all projects
 *   🖨 Print view     — YOU pick which columns, then a clean printable page
 *                       opens (no more export → hide rows → set print area)
 *   📋 Copy as text   — tab-separated; pastes into Excel/Sheets or a message
 *
 * The print column choice is remembered for next time.
 */
import { useState } from 'react'
import type { Project, ProjectState } from '../types'
import { COLUMNS, copyAsText, downloadXlsx, loadPrintCols, openPrintView, savePrintCols } from '../lib/exportList'
import Icon from './Icon'

interface Props {
  /** The rows currently visible (search + filters applied). */
  visible: Project[]
  /** The whole roster (for "all projects" export). */
  all: Project[]
  getProjectState: (id: number) => ProjectState
}

function ShareMenu({ visible, all, getProjectState }: Props) {
  const [open, setOpen] = useState(false)
  const [choosing, setChoosing] = useState(false) // the print column-chooser
  const [cols, setCols] = useState<string[]>(loadPrintCols)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const filtered = visible.length !== all.length

  const toggleCol = (id: string) =>
    setCols((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]))

  // Keep the chooser's order matching the master column order, not click order.
  const orderedCols = COLUMNS.filter((c) => cols.includes(c.id)).map((c) => c.id)

  async function excel(projects: Project[]) {
    setBusy(true)
    try {
      await downloadXlsx(projects, getProjectState)
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  async function copy() {
    await copyAsText(visible, getProjectState, orderedCols)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setOpen(false)
    }, 900)
  }

  function print() {
    savePrintCols(orderedCols)
    openPrintView(
      visible,
      getProjectState,
      orderedCols,
      filtered ? `${visible.length} of ${all.length} projects (filtered view)` : `${all.length} projects`,
    )
    setChoosing(false)
    setOpen(false)
  }

  return (
    <div className="share-menu">
      <button
        className="btn btn-secondary btn-sm share-btn"
        onClick={() => setOpen((o) => !o)}
        title="Export / print / share this list"
      >
        <Icon name="ios_share" size={16} />
        Share {busy && '…'}
      </button>

      {open && !choosing && (
        <div className="share-pop">
          <button className="share-opt" onClick={() => setChoosing(true)}>
            🖨 Print view… <span className="muted">pick columns → clean printout</span>
          </button>
          <button className="share-opt" onClick={() => excel(visible)}>
            📊 Excel — current view ({visible.length})
          </button>
          {filtered && (
            <button className="share-opt" onClick={() => excel(all)}>
              📊 Excel — all projects ({all.length})
            </button>
          )}
          <button className="share-opt" onClick={copy}>
            {copied ? '✓ Copied!' : <>📋 Copy as text <span className="muted">pastes into Excel / a message</span></>}
          </button>
          <button className="share-opt x" onClick={() => setOpen(false)}>
            ✕ Close
          </button>
        </div>
      )}

      {open && choosing && (
        <div className="share-pop chooser">
          <div className="chooser-head">
            What should the printout include?
            <span className="muted"> · {visible.length} project{visible.length === 1 ? '' : 's'} (current view)</span>
          </div>
          <div className="chooser-grid">
            {COLUMNS.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={cols.includes(c.id)} onChange={() => toggleCol(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
          <div className="chooser-actions">
            <button className="mini" onClick={() => setCols(COLUMNS.map((c) => c.id))}>
              All
            </button>
            <button className="mini" onClick={() => setCols(loadPrintCols())}>
              ↺ Last used
            </button>
            <span className="spacer" />
            <button className="mini" onClick={() => setChoosing(false)}>
              ← Back
            </button>
            <button className="mini primary" disabled={orderedCols.length === 0} onClick={print}>
              🖨 Print {orderedCols.length} column{orderedCols.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ShareMenu
