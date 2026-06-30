/**
 * InspectionsView.tsx — the 🔍 Inspections tab: every inspection/review
 * result the nightly permit scanner pulled off the county portal, across all
 * projects, newest first.
 *
 * This is REFERENCE info you come look at — deliberately not the task list
 * (inspection results were flooding it, June 2026). Failed results are red,
 * partial/corrections amber; click a row to jump to that project's Permit
 * tab. Holds and warnings are still tasks — those need action.
 */
import type { InspectionItem, Project, ProjectState } from '../types'

interface Props {
  roster: Project[]
  getProjectState: (id: number) => ProjectState
  /** Open a project (lands on its Permit tab). */
  onOpen: (projectId: number) => void
}

/** red = failed outright · amber = passed-with-strings / partial */
export function inspectionSeverity(status: string): 'fail' | 'partial' {
  return /disapprov|fail|reject|denied/i.test(status) ? 'fail' : 'partial'
}

/** "6/3/2026" → sortable number (0 when missing/unparseable). */
function dateNum(i: InspectionItem): number {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(i.date ?? '')
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]).getTime()
  return i.noticedAt ? new Date(i.noticedAt).getTime() : 0
}

function InspectionsView({ roster, getProjectState, onOpen }: Props) {
  // Flatten: one row per result, joined with its project, newest first.
  const rows = roster
    .flatMap((p) =>
      // Skip dismissed:true rows so an item dismissed on a project's Permit tab
      // doesn't linger on this cross-project feed either (mirrors the Permit tab).
      (getProjectState(p.id).inspections ?? [])
        .filter((insp) => !insp.dismissed)
        .map((insp) => ({ p, insp })),
    )
    .sort((a, b) => dateNum(b.insp) - dateNum(a.insp))

  return (
    <section className="detail">
      <h2 className="detail-title">🔍 Inspections</h2>
      <p className="meta">
        Inspection &amp; review results from the county portal (updated by the nightly scan) — newest
        first. Click one to open the project.
      </p>

      {rows.length === 0 ? (
        <p className="summary">No flagged inspection results right now — nothing failed or partial. 🎉</p>
      ) : (
        <div className="insp-list">
          {rows.map(({ p, insp }) => (
            <button key={insp.sourceKey} className="insp-row" onClick={() => onOpen(p.id)}>
              <span className={'insp-status ' + inspectionSeverity(insp.status)}>{insp.status}</span>
              <span className="insp-main">
                <span className="insp-addr">{p.address}</span>
                <span className="insp-desc">{insp.desc}</span>
              </span>
              <span className="insp-date muted">{insp.date || ''}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default InspectionsView
