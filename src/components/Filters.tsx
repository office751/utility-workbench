/**
 * Filters.tsx — the cross-project filter panel behind the ▾ button.
 *
 * Project-first navigation: stream isn't picked here anymore, so the old
 * per-stream dropdowns are gone. What's left are filters that apply to a whole
 * house: hide finished (C.O.) homes, show only ones that need action, hide
 * completed ones.
 */
export interface FilterState {
  hideCO: boolean // hide finished (Certificate of Occupancy) homes — ON by default
  needsActionOnly: boolean
  hideDone: boolean // hide homes where every stream is done
}

/** Default: finished (C.O.) homes hidden so active work isn't cluttered. */
export const NO_FILTERS: FilterState = { hideCO: true, needsActionOnly: false, hideDone: false }

/** How many *extra* filters are active (shown on the ▾ button). hideCO is the
 *  default, so toggling it OFF counts as an active choice too. */
export function countActive(f: FilterState): number {
  let n = 0
  if (f.needsActionOnly) n++
  if (f.hideDone) n++
  if (!f.hideCO) n++ // showing C.O. is a deliberate non-default choice
  return n
}

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
      {countActive(filters) > 0 && (
        <button className="mini" onClick={() => onChange(NO_FILTERS)}>
          ✕ Reset
        </button>
      )}
    </div>
  )
}

export default Filters
