/**
 * investorPublish.ts — keeps the investor's "Current Progress" card fresh.
 *
 * Investors can NEVER read the workbench blob (RLS), so anything they see
 * must be an explicit projection. This module builds that projection: for
 * each project with an investor grant, condense the four streams into one
 * human line each (reusing the SAME nextAction logic the owner UI runs —
 * one prioritization, never two) and upsert it into
 * project_status_snapshot, the only status table investors can read.
 *
 * Called from App.tsx on a debounce after state changes. Fails soft
 * everywhere: before the portal migrations exist, grantedProjectIds()
 * returns an empty set and this is a no-op.
 */
import type { Project, ProjectState } from '../types'
import {
  nextElectricAction,
  nextPermitAction,
  nextSepticAction,
  nextWaterAction,
} from './nextAction'
import { grantedProjectIds, publishSnapshot } from './investor'

/** Push fresh status snapshots for every granted project. */
export async function publishInvestorSnapshots(
  roster: Project[],
  getProjectState: (id: number) => ProjectState,
): Promise<void> {
  const granted = await grantedProjectIds()
  if (granted.size === 0) return // no investors yet (or schema not run)

  for (const p of roster) {
    if (!granted.has(p.id)) continue
    const ps = getProjectState(p.id)
    await publishSnapshot({
      project_id: p.id,
      address: p.address,
      permitting: nextPermitAction(ps).label,
      electric: nextElectricAction(p, ps).label,
      water: nextWaterAction(p, ps).label,
      septic: nextSepticAction(ps).label,
    })
  }
}
