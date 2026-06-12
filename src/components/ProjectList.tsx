/**
 * ProjectList.tsx — the Projects LANDING: one searchable list of every house.
 *
 * Project-first: no stream is chosen here. Each row shows the house plus a
 * 5-icon strip (⚡💧🚽📋🛒) summarizing every stream at a glance — ✓ done,
 * ! needs action, · in progress — so you can triage the whole portfolio without
 * opening anything. Click a row to enter that house's workspace (see Detail).
 */
import { useState } from 'react'
import type { Project, ProjectState, Stream } from '../types'
import {
  electricNeedsAction,
  isElectricDone,
  isPermitDone,
  isSepticDone,
  isWaterDone,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  permitNeedsAction,
  septicNeedsAction,
  waterNeedsAction,
} from '../lib/nextAction'
import { isMaterialsDone, materialsNeedsAction, ordersSummary } from '../lib/orders'
import Filters, { NO_FILTERS, countActive, type FilterState } from './Filters'
import ShareMenu from './ShareMenu'

interface Props {
  /** The live roster from saved state. */
  projects: Project[]
  onSelect: (id: number) => void
  onAdd: () => void
  /** Open the ⚡ batch electric-application screen. */
  onBatchApply: () => void
  /** Open the 📋 status-report builder. */
  onStatusReport: () => void
  getProjectState: (id: number) => ProjectState
}

type CellState = 'done' | 'fire' | 'go'
interface Cell {
  key: Stream
  icon: string
  state: CellState
}

/** One status cell per stream — drives the 5-icon row strip. */
function streamCells(p: Project, ps: ProjectState): Cell[] {
  const mk = (key: Stream, icon: string, done: boolean, fire: boolean): Cell => ({
    key,
    icon,
    state: done ? 'done' : fire ? 'fire' : 'go',
  })
  return [
    mk('electric', '⚡', isElectricDone(ps), electricNeedsAction(p, ps)),
    mk('water', '💧', isWaterDone(p, ps), waterNeedsAction(p, ps)),
    mk('septic', '🚽', isSepticDone(ps), septicNeedsAction(ps)),
    mk('permit', '📋', isPermitDone(ps), permitNeedsAction(ps)),
    mk('materials', '🛒', isMaterialsDone(ps), materialsNeedsAction(ps)),
  ]
}

/** The single most-urgent next action across all streams (the first one on fire). */
function nextLine(p: Project, ps: ProjectState, cells: Cell[]): string {
  const fire = cells.find((c) => c.state === 'fire')
  if (!fire) return ''
  const label =
    fire.key === 'electric'
      ? nextElectricAction(p, ps).label
      : fire.key === 'water'
        ? nextWaterAction(p, ps).label
        : fire.key === 'septic'
          ? nextSepticAction(ps).label
          : fire.key === 'permit'
            ? nextPermitAction(ps).label
            : ordersSummary(ps)
  return `→ ${label}`
}

const GLYPH: Record<CellState, string> = { done: '✓', fire: '!', go: '·' }

function ProjectList({ projects, onSelect, onAdd, onBatchApply, onStatusReport, getProjectState }: Props) {
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS)

  const q = search.trim().toLowerCase()

  // Build a row model once, then filter — avoids recomputing stream cells twice.
  const rows = projects.map((p) => {
    const ps = getProjectState(p.id)
    const cells = streamCells(p, ps)
    return {
      p,
      ps,
      cells,
      allDone: cells.every((c) => c.state === 'done'),
      anyFire: cells.some((c) => c.state === 'fire'),
      next: nextLine(p, ps, cells),
    }
  })

  const visible = rows.filter(({ p, ps, allDone, anyFire }) => {
    // Search across the strings you'd actually have in hand (+ owner/investor).
    if (q) {
      const hay = [p.address, p.subdivision, p.model, p.permit, p.parcel, p.workOrder, p.city, p.zip,
        ps.ownerName, ps.investorName]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.hideCO && p.listStatus === 'CO') return false
    if (filters.needsActionOnly && !anyFire) return false
    if (filters.hideDone && allDone) return false
    return true
  })

  const nActive = countActive(filters)

  return (
    <section className="project-list">
      <div className="search-row">
        <div className="search-wrap">
          <input
            className="search"
            placeholder="Search address, permit #, parcel, WO#, city, zip, model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" title="Clear" onClick={() => setSearch('')}>
              ✕
            </button>
          )}
        </div>
        <button
          className={'filter-btn' + (showFilters || nActive > 0 ? ' on' : '')}
          onClick={() => setShowFilters(!showFilters)}
          title="Filters"
        >
          ▾ {nActive > 0 ? nActive : ''}
        </button>
      </div>

      {showFilters && <Filters filters={filters} onChange={setFilters} />}

      <div className="list-head">
        <span className="muted">
          Showing {visible.length} of {projects.length}
        </span>
        <span className="list-head-actions">
          <button className="mini apply-btn" onClick={onBatchApply} title="Draft electric applications for every house that needs one">
            ⚡ Batch apply
          </button>
          <button className="mini" onClick={onStatusReport} title="Build a status update for one, several, or all houses">
            📋 Status report
          </button>
          <ShareMenu visible={visible.map((r) => r.p)} all={projects} getProjectState={getProjectState} />
          <button className="add-btn" onClick={onAdd}>
            ＋ Add project
          </button>
        </span>
      </div>

      <div className="list">
        {visible.map(({ p, ps, cells, next }) => (
          <div key={p.id} className="item" onClick={() => onSelect(p.id)}>
            <div className="item-top">
              <span className="item-addr">{p.address}</span>
              {p.listStatus === 'CO' && <span className="status-pill co">C.O.</span>}
              {p.listStatus === 'Hold' && <span className="status-pill hold">HOLD</span>}
              {ps.isInvestorProject && (
                <span className="item-investor" title={`Investor project — ${ps.investorName || 'investor not named'}`}>
                  👤 {ps.investorName || 'Investor'}
                </span>
              )}
            </div>
            <div className="item-sub">
              {p.model} · {p.subdivision} · {p.city} {p.zip}
              {p.permit && <> · {p.permit}</>}
            </div>
            <div className="row-streams">
              {cells.map((c) => (
                <span key={c.key} className={'row-cell ' + c.state} title={c.key}>
                  {c.icon} {GLYPH[c.state]}
                </span>
              ))}
            </div>
            {next && <div className="item-next">{next}</div>}
          </div>
        ))}
        {visible.length === 0 && <p className="muted pad">No matches.</p>}
      </div>
    </section>
  )
}

export default ProjectList
