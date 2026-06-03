/**
 * Filters.tsx — the filter panel that hides behind the ▾ Filters button.
 *
 * Per the spec, the available filters change per tab:
 *   Electric → utility + engineer dropdowns
 *   Water    → water source dropdown
 *   Septic   → septic/sewer dropdown
 * All tabs share "Needs my action" and "Hide completed".
 *
 * One FilterState type holds every possible filter; the component only
 * SHOWS the ones relevant to the current tab, and ProjectList only APPLIES
 * the relevant ones. Irrelevant fields just sit unused — simpler than three
 * separate filter types.
 */
import type { SepticSource, Stream, Utility, WaterSource } from '../types'

export interface FilterState {
  utility: Utility | '' // electric tab; '' = all
  engineer: string // electric tab; '' = all
  waterSource: WaterSource | '' // water tab
  septicSource: SepticSource | '' // septic tab
  needsActionOnly: boolean
  hideDone: boolean
}

/** The "nothing filtered" starting point. */
export const NO_FILTERS: FilterState = {
  utility: '',
  engineer: '',
  waterSource: '',
  septicSource: '',
  needsActionOnly: false,
  hideDone: false,
}

/** How many filters are active ON THIS TAB? (shown on the ▾ button) */
export function countActive(f: FilterState, stream: Stream): number {
  let n = 0
  if (stream === 'electric' && f.utility) n++
  if (stream === 'electric' && f.engineer) n++
  if (stream === 'water' && f.waterSource) n++
  if (stream === 'septic' && f.septicSource) n++
  if (f.needsActionOnly) n++
  if (f.hideDone) n++
  return n
}

interface Props {
  stream: Stream
  filters: FilterState
  onChange: (next: FilterState) => void
  engineers: string[] // distinct engineer names (electric tab only)
}

function Filters({ stream, filters, onChange, engineers }: Props) {
  // Tiny helper: merge one changed field into the current filters.
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })

  return (
    <div className="filters">
      {stream === 'electric' && (
        <>
          <select
            value={filters.utility}
            onChange={(e) => set({ utility: e.target.value as Utility })}
          >
            <option value="">All utilities</option>
            <option value="SECO">SECO</option>
            <option value="DUKE">Duke</option>
            <option value="CLAY">Clay</option>
          </select>

          <select value={filters.engineer} onChange={(e) => set({ engineer: e.target.value })}>
            <option value="">All engineers</option>
            {engineers.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </>
      )}

      {stream === 'water' && (
        <select
          value={filters.waterSource}
          onChange={(e) => set({ waterSource: e.target.value as WaterSource })}
        >
          <option value="">All sources</option>
          <option value="Well">Well</option>
          <option value="City">City</option>
          <option value="CityWM">City + main ext.</option>
        </select>
      )}

      {stream === 'septic' && (
        <select
          value={filters.septicSource}
          onChange={(e) => set({ septicSource: e.target.value as SepticSource })}
        >
          <option value="">Septic & sewer</option>
          <option value="Septic">Septic only</option>
          <option value="Sewer">Sewer only</option>
        </select>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={filters.needsActionOnly}
          onChange={(e) => set({ needsActionOnly: e.target.checked })}
        />
        Needs my action
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={filters.hideDone}
          onChange={(e) => set({ hideDone: e.target.checked })}
        />
        Hide completed
      </label>

      {countActive(filters, stream) > 0 && (
        <button className="mini" onClick={() => onChange(NO_FILTERS)}>
          ✕ Clear
        </button>
      )}
    </div>
  )
}

export default Filters
