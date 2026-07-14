/**
 * ProjectList.tsx — the Projects LANDING: one searchable list of every house.
 *
 * Project-first: no stream is chosen here. Each row is deliberately QUIET
 * (June 2026 declutter): address, facts sub-line, the single most-urgent next
 * action, and ONE right-side detail that follows your lens — the permit-status
 * pill by default, the owner under the investor filter, the permit # when a
 * status chip is active. The old 5-icon stream strip is gone; per-stream
 * status lives one click away on the project's Overview. Permit-status chips
 * above the list are the fast filter (they share state with the Filter panel).
 */
import { useState } from 'react'
import type { Project, ProjectState, Stream } from '../types'
import {
  closingNeedsAction,
  closingPending,
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
  permitStatus,
  PERMIT_STATUS_LABEL,
  septicNeedsAction,
  waterNeedsAction,
  type PermitStatus,
} from '../lib/nextAction'
import { shutoffFor } from '../lib/shutoff'
import { isMaterialsDone, materialsNeedsAction, ordersSummary } from '../lib/orders'
import Filters, { NO_FILTERS, PERMIT_FILTER_ORDER, countActive, type FilterState } from './Filters'
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
  state: CellState
}

/** One status per stream — no longer rendered as a strip, but still the brain
 *  behind the needs-action/hide-completed filters and the next-action line. */
function streamCells(p: Project, ps: ProjectState): Cell[] {
  const mk = (key: Stream, done: boolean, fire: boolean): Cell => ({
    key,
    state: done ? 'done' : fire ? 'fire' : 'go',
  })
  return [
    mk('electric', isElectricDone(ps), electricNeedsAction(p, ps)),
    mk('water', isWaterDone(p, ps), waterNeedsAction(p, ps)),
    mk('septic', isSepticDone(ps), septicNeedsAction(ps)),
    mk('permit', isPermitDone(ps), permitNeedsAction(ps)),
    mk('materials', isMaterialsDone(ps), materialsNeedsAction(ps)),
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

/**
 * The ONE right-side detail on each row, following the active lens:
 *   investor filter on → who the house belongs to;
 *   a permit-status chip active → the permit # (every row's pill would just
 *   repeat the chip, so show the next-most-useful fact instead);
 *   otherwise → the permit-status pill.
 */
function RowSide({ p, ps, status, filters }: { p: Project; ps: ProjectState; status: PermitStatus; filters: FilterState }) {
  if (filters.investorOnly) {
    return (
      <span className="prow-owner" title="Who this house belongs to">
        <Icon name="person" size={14} />
        {ps.investorName || ps.ownerName || 'Iron Shield'}
      </span>
    )
  }
  if (filters.permitStatus !== 'all') {
    return <span className="prow-permitno" title="Permit #">{p.permit || '—'}</span>
  }
  return <span className={`pstatus pstatus--${status}`}>{PERMIT_STATUS_LABEL[status]}</span>
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
    // The CLOSING fire: shut-off deadline ≤ 10 days. It outranks the ordinary
    // next-action line — missing it means paying a sold house's power bill.
    const closingFire = closingNeedsAction(ps)
    const so = closingFire ? shutoffFor(ps) : null
    return {
      p,
      ps,
      status: permitStatus(p, ps),
      // A house under contract isn't "completed" until its closing checklist
      // is walked — keep it visible under the Hide-completed filter.
      allDone: cells.every((c) => c.state === 'done') && !closingPending(p, ps),
      anyFire: cells.some((c) => c.state === 'fire') || closingFire,
      next: so ? `Shut off / transfer electric by ${so.date}` : nextLine(p, ps, cells),
    }
  })

  // Everything EXCEPT the permit-status choice and hide-CO. The chip counts are
  // computed over this pool so they always add up to what clicking would show.
  const pool = rows.filter(({ p, ps, allDone, anyFire }) => {
    // Search across the strings you'd actually have in hand (+ owner/investor).
    if (q) {
      const hay = [p.address, p.subdivision, p.model, p.permit, p.parcel, p.workOrder, p.city, p.zip,
        ps.ownerName, ps.investorName]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.needsActionOnly && !anyFire) return false
    if (filters.hideDone && allDone) return false
    if (filters.investorOnly && !ps.isInvestorProject) return false
    return true
  })

  // Per-bucket chip counts. The buckets partition the roster (a C.O. house is
  // ONLY 'co'), so hide-CO never skews a specific bucket's count — it only
  // decides whether the default "All" view includes finished homes.
  const chipCount: Record<PermitStatus, number> = { co: 0, issued: 0, 'not-ours': 0, 'in-review': 0, 'not-applied': 0 }
  for (const r of pool) chipCount[r.status]++
  const allCount = pool.filter((r) => !(filters.hideCO && r.p.listStatus === 'CO')).length

  // A specific chip BYPASSES hide-CO: clicking "C.O." is an explicit ask to see
  // finished homes, and no other bucket contains them anyway.
  const visible =
    filters.permitStatus === 'all'
      ? pool.filter((r) => !(filters.hideCO && r.p.listStatus === 'CO'))
      : pool.filter((r) => r.status === filters.permitStatus)

  const nActive = countActive(filters)
  const setChip = (s: FilterState['permitStatus']) => setFilters({ ...filters, permitStatus: s })

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

          {/* count + toolbar — secondary actions live behind one ⋯ menu (less is more) */}
          <div className="pl-actions-row">
            <span className="pl-count">
              Showing <b>{visible.length}</b> of {projects.length}
            </span>
            <span className="pl-spacer" />
            <ShareMenu
              visible={visible.map((r) => r.p)}
              all={projects}
              getProjectState={getProjectState}
              onBatchApply={onBatchApply}
              onStatusReport={onStatusReport}
            />
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

        {/* Permit-status chips — the one-tap filter (same state as the panel).
            A chip only renders when it has houses (or is the active choice, so
            you can always un-click it). */}
        <div className="pl-chips" role="tablist" aria-label="Filter by permit status">
          <button className={'pl-chip' + (filters.permitStatus === 'all' ? ' act' : '')} onClick={() => setChip('all')}>
            All <span className="pl-chip-n">{allCount}</span>
          </button>
          {PERMIT_FILTER_ORDER.filter((s) => chipCount[s] > 0 || filters.permitStatus === s).map((s) => (
            <button
              key={s}
              className={'pl-chip' + (filters.permitStatus === s ? ' act' : '')}
              onClick={() => setChip(filters.permitStatus === s ? 'all' : s)}
            >
              {PERMIT_STATUS_LABEL[s]} <span className="pl-chip-n">{chipCount[s]}</span>
            </button>
          ))}
        </div>

        {/* rows */}
        {visible.map(({ p, ps, status, next }) => (
          <div key={p.id} className="prow" onClick={() => onSelect(p.id)}>
            <div className="prow-main">
              <div className="prow-addr-line">
                <span className="prow-addr">{p.address}</span>
                {p.listStatus === 'CO' && <span className="prow-pill co">C.O.</span>}
                {p.listStatus === 'Hold' && <span className="prow-pill hold">HOLD</span>}
                {ps.underContract && p.listStatus !== 'CO' && (
                  <span className="prow-pill uc" title="Under contract — closing checklist on this house's Overview">
                    UNDER CONTRACT
                  </span>
                )}
                {/* Under the investor filter the right side already names them. */}
                {ps.isInvestorProject && !filters.investorOnly && (
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
            <RowSide p={p} ps={ps} status={status} filters={filters} />
          </div>
        ))}
        {visible.length === 0 && <p className="pl-empty">No matches.</p>}
      </div>
    </section>
  )
}

export default ProjectList
