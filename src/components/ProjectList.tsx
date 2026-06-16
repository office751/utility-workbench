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
import Icon from './Icon'

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
  // Icons are Material Symbols ligature names (the design's single icon set).
  return [
    mk('electric', 'bolt', isElectricDone(ps), electricNeedsAction(p, ps)),
    mk('water', 'water_drop', isWaterDone(p, ps), waterNeedsAction(p, ps)),
    mk('septic', 'plumbing', isSepticDone(ps), septicNeedsAction(ps)),
    mk('permit', 'description', isPermitDone(ps), permitNeedsAction(ps)),
    mk('materials', 'shopping_cart', isMaterialsDone(ps), materialsNeedsAction(ps)),
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
  return label
}

/** One status cell, rendered to the design's strip style (icon + marker). */
function StatusCell({ cell }: { cell: Cell }) {
  const attn = cell.state === 'fire'
  const done = cell.state === 'done'
  const iconColor = attn
    ? 'var(--warn)'
    : cell.key === 'water' && done
      ? 'var(--info)'
      : 'var(--ink-2)'
  return (
    <span className={'sstrip-cell' + (attn ? ' attn' : '')} title={`${cell.key}: ${cell.state}`}>
      <Icon name={cell.icon} size={15} color={iconColor} />
      {done && <Icon name="check" size={13} color="var(--success)" />}
      {attn && <Icon name="priority_high" size={13} color="var(--warn)" />}
      {cell.state === 'go' && <span className="sstrip-na">·</span>}
    </span>
  )
}

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
    if (filters.investorOnly && !ps.isInvestorProject) return false
    return true
  })

  const nActive = countActive(filters)

  return (
    <section className="project-list-wrap">
      <div className="pl-panel">
        <div className="pl-head">
          {/* search + Filter */}
          <div className="pl-search-row">
            <div className="search-wrap">
              <Icon name="search" size={17} color="var(--ink-3)" className="search-ico" />
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
              className={'btn btn-secondary' + (showFilters || nActive > 0 ? ' on' : '')}
              onClick={() => setShowFilters(!showFilters)}
              title="Filters"
            >
              <Icon name="filter_list" size={18} />
              Filter
              {nActive > 0 && <span className="btn-count">{nActive}</span>}
            </button>
          </div>

          {/* count + toolbar */}
          <div className="pl-actions-row">
            <span className="pl-count">
              Showing <b>{visible.length}</b> of {projects.length}
            </span>
            <span className="pl-spacer" />
            <button
              className="btn btn-secondary btn-sm"
              onClick={onBatchApply}
              title="Draft electric applications for every house that needs one"
            >
              <Icon name="bolt" size={16} />
              Batch apply
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onStatusReport}
              title="Build a status update for one, several, or all houses"
            >
              <Icon name="description" size={16} />
              Status report
            </button>
            <ShareMenu visible={visible.map((r) => r.p)} all={projects} getProjectState={getProjectState} />
            <button className="btn btn-primary btn-sm" onClick={onAdd}>
              <Icon name="add" size={16} />
              Add project
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="pl-filters">
            <Filters filters={filters} onChange={setFilters} />
          </div>
        )}

        {/* rows */}
        {visible.map(({ p, ps, cells, next }) => (
          <div key={p.id} className="prow" onClick={() => onSelect(p.id)}>
            <div className="prow-main">
              <div className="prow-addr-line">
                <span className="prow-addr">{p.address}</span>
                {p.listStatus === 'CO' && <span className="prow-pill co">C.O.</span>}
                {p.listStatus === 'Hold' && <span className="prow-pill hold">HOLD</span>}
                {ps.isInvestorProject && (
                  <span className="prow-investor" title={`Investor project — ${ps.investorName || 'investor not named'}`}>
                    <Icon name="person" size={13} />
                    {ps.investorName || 'Investor'}
                  </span>
                )}
              </div>
              <div className="prow-sub">
                {p.model} · {p.subdivision} · {p.city} {p.zip}
                {p.permit && <> · {p.permit}</>}
              </div>
              {next && (
                <div className="prow-stage">
                  <Icon name="arrow_right_alt" size={16} color="var(--rust)" />
                  <span>{next}</span>
                </div>
              )}
            </div>
            <div className="sstrip">
              {cells.map((c) => (
                <StatusCell key={c.key} cell={c} />
              ))}
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="pl-empty">No matches.</p>}
      </div>
    </section>
  )
}

export default ProjectList
