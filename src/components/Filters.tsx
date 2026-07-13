/**
 * Filters.tsx — the cross-project filter panel behind the ▾ button.
 *
 * Project-first navigation: stream isn't picked here anymore, so the old
 * per-stream dropdowns are gone. What's left are filters that apply to a whole
 * house: hide finished (C.O.) homes, show only ones that need action, hide
 * completed ones — plus WHERE THE PERMIT STANDS, which also lives as one-tap
 * chips above the list (same state, two ways to reach it).
 */
import { PERMIT_STATUS_LABEL, type PermitStatus } from '../lib/nextAction'

export interface FilterState {
  hideCO: boolean // hide finished (Certificate of Occupancy) homes — ON by default
  needsActionOnly: boolean
  hideDone: boolean // hide homes where every stream is done
  investorOnly: boolean // show only houses flagged as an investor's project
  /** Show only houses whose permit sits in this bucket ('all' = no filter).
   *  Mirrored by the chips above the list — one shared state. */
  permitStatus: PermitStatus | 'all'
}

/** Default: finished (C.O.) homes hidden so active work isn't cluttered. */
// eslint-disable-next-line react-refresh/only-export-components -- deliberately colocated with its component; only costs hot-reload speed on this file
export const NO_FILTERS: FilterState = {
  hideCO: true,
  needsActionOnly: false,
  hideDone: false,
  investorOnly: false,
  permitStatus: 'all',
}

/** How many *extra* filters are active (shown on the ▾ button). hideCO is the
 *  default, so toggling it OFF counts as an active choice too. */
// eslint-disable-next-line react-refresh/only-export-components -- deliberately colocated with its component
export function countActive(f: FilterState): number {
  let n = 0
  if (f.needsActionOnly) n++
  if (f.hideDone) n++
  if (f.investorOnly) n++
  if (!f.hideCO) n++ // showing C.O. is a deliberate non-default choice
  if (f.permitStatus !== 'all') n++
  return n
}

/** The chip/dropdown order: workflow order, finished states last. */
// eslint-disable-next-line react-refresh/only-export-components -- deliberately colocated with its component
export const PERMIT_FILTER_ORDER: PermitStatus[] = ['not-applied', 'in-review', 'issued', 'not-ours', 'co']

interface Props {
  filters: FilterState
  onChange: (next: FilterState) => void
}

function Filters({ filters, onChange }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })
  return (
    <div className="filters">
      <label className="check">
        <input type="checkbox" checked={filters.hideCO} onChange={(e) => set({ hideCO: e.target.checked })} />
        Hide finished (C.O.)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={filters.needsActionOnly}
          onChange={(e) => set({ needsActionOnly: e.target.checked })}
        />
        Needs my action
      </label>
      <label className="check">
        <input type="checkbox" checked={filters.hideDone} onChange={(e) => set({ hideDone: e.target.checked })} />
        Hide completed
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={filters.investorOnly}
          onChange={(e) => set({ investorOnly: e.target.checked })}
        />
        👤 Investor projects only
      </label>
      <label className="check">
        Permit:{' '}
        <select
          className="filter-select"
          value={filters.permitStatus}
          onChange={(e) => set({ permitStatus: e.target.value as FilterState['permitStatus'] })}
        >
          <option value="all">All</option>
          {PERMIT_FILTER_ORDER.map((s) => (
            <option key={s} value={s}>
              {PERMIT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {countActive(filters) > 0 && (
        <button className="mini" onClick={() => onChange(NO_FILTERS)}>
          ✕ Reset
        </button>
      )}
    </div>
  )
}

export default Filters
