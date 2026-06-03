/**
 * ProjectList.tsx — the sidebar: search + filters + one row per project.
 *
 * Now stream-aware: the badge, the "next action" hint, and which filters
 * apply all depend on the current tab. The row layout itself is identical
 * for all three streams — only the DATA shown in it changes, and that's
 * computed by one helper (rowInfo) so the rendering stays simple.
 */
import { useState, type ReactNode } from 'react'
import type { Project, ProjectState, Stream } from '../types'
import {
  electricNeedsAction,
  engineerOf,
  isElectricDone,
  isPermitDone,
  isSepticDone,
  isWaterDone,
  needsVerify,
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
  permitNeedsAction,
  permitResponsibleOf,
  septicNeedsAction,
  septicSourceOf,
  utilityOf,
  waterNeedsAction,
  waterSourceOf,
} from '../lib/nextAction'
import { DoneChip, PermitBadge, SepticBadge, UtilityBadge, WaterBadge } from './Badges'
import Filters, { NO_FILTERS, countActive, type FilterState } from './Filters'

interface Props {
  stream: Stream
  /** The live roster from saved state (not the hard-coded file!). */
  projects: Project[]
  selectedId: number | null
  onSelect: (id: number) => void
  onAdd: () => void
  getProjectState: (id: number) => ProjectState
}

/** Everything one row needs to display, per stream. */
interface RowInfo {
  badge: ReactNode
  next: string
  done: boolean
  needsAction: boolean
}

function rowInfo(stream: Stream, p: Project, ps: ProjectState): RowInfo {
  if (stream === 'electric') {
    return {
      badge: needsVerify(p, ps) ? <span className="badge warn">verify?</span> : <UtilityBadge p={p} ps={ps} />,
      next: nextElectricAction(p, ps).label,
      done: isElectricDone(ps),
      needsAction: electricNeedsAction(p, ps),
    }
  }
  if (stream === 'water') {
    return {
      badge: <WaterBadge p={p} ps={ps} />,
      next: nextWaterAction(p, ps).label,
      done: isWaterDone(p, ps),
      needsAction: waterNeedsAction(p, ps),
    }
  }
  if (stream === 'permit') {
    return {
      badge: <PermitBadge ps={ps} />,
      next: nextPermitAction(ps).label,
      done: isPermitDone(ps),
      needsAction: permitNeedsAction(ps),
    }
  }
  return {
    badge: <SepticBadge ps={ps} />,
    next: nextSepticAction(ps).label,
    done: isSepticDone(ps),
    needsAction: septicNeedsAction(ps),
  }
}

function ProjectList({ stream, projects, selectedId, onSelect, onAdd, getProjectState }: Props) {
  // Local UI state. Note: App renders this component with key={tab}, so
  // switching tabs gives you a FRESH copy — search and filters reset.
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS)

  // Distinct engineer names for the electric filter dropdown.
  const engineers = [
    ...new Set(projects.map((p) => engineerOf(p, getProjectState(p.id))).filter(Boolean)),
  ].sort()

  // Apply search + every active filter. A project must pass ALL of them.
  const q = search.toLowerCase()
  const visible = projects.filter((p) => {
    const ps = getProjectState(p.id)
    const info = rowInfo(stream, p, ps)

    const matchesSearch =
      p.address.toLowerCase().includes(q) ||
      p.subdivision.toLowerCase().includes(q) ||
      p.model.toLowerCase().includes(q)
    if (!matchesSearch) return false

    // Stream-specific dropdowns:
    if (stream === 'electric' && filters.utility && utilityOf(p, ps) !== filters.utility) return false
    if (stream === 'electric' && filters.engineer && engineerOf(p, ps) !== filters.engineer) return false
    if (stream === 'water' && filters.waterSource && waterSourceOf(p, ps) !== filters.waterSource) return false
    if (stream === 'septic' && filters.septicSource && septicSourceOf(ps) !== filters.septicSource) return false
    if (stream === 'permit' && filters.permitResponsible && permitResponsibleOf(ps) !== filters.permitResponsible) return false

    // Shared checkboxes:
    if (filters.needsActionOnly && !info.needsAction) return false
    if (filters.hideDone && info.done) return false
    return true
  })

  const nActive = countActive(filters, stream)

  return (
    <aside className="sidebar">
      <div className="search-row">
        <input
          className="search"
          placeholder={`Search ${projects.length} projects…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={'filter-btn' + (showFilters || nActive > 0 ? ' on' : '')}
          onClick={() => setShowFilters(!showFilters)}
          title="Filters"
        >
          ▾ {nActive > 0 ? nActive : ''}
        </button>
      </div>

      {showFilters && (
        <Filters stream={stream} filters={filters} onChange={setFilters} engineers={engineers} />
      )}

      <button className="add-btn" onClick={onAdd}>
        ＋ Add project
      </button>

      <div className="list">
        {visible.map((p) => {
          const ps = getProjectState(p.id)
          const info = rowInfo(stream, p, ps)
          return (
            <div
              key={p.id}
              className={'item' + (p.id === selectedId ? ' sel' : '')}
              onClick={() => onSelect(p.id)}
            >
              <div className="item-top">
                <span className="item-addr">{p.address}</span>
                {info.done ? <DoneChip /> : info.badge}
              </div>
              <div className="item-sub">
                {p.model} · {p.subdivision}
              </div>
              <div className="item-next">{info.next}</div>
            </div>
          )
        })}
        {visible.length === 0 && <p className="muted pad">No matches.</p>}
      </div>
    </aside>
  )
}

export default ProjectList
