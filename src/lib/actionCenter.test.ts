import { describe, it, expect } from 'vitest'
import { buildActionCenter } from './actionCenter'
import { PROJECTS } from '../data/projects'
import { emptyProjectState } from '../data/seed'

// Regression guard for the OUR_COURT fix: a Sewer lot's next action
// ('sweravail'/'swerapply'/'swertap') must count as OUR move so it reaches the
// Today command center. Before the fix, OUR_COURT.septic had no sewer keys and
// these silently never surfaced.
describe('buildActionCenter — sewer work reaches Today', () => {
  it("surfaces a Sewer lot's next move as a 'septic' stream move", () => {
    const active = PROJECTS.find((p) => p.listStatus !== 'CO' && p.listStatus !== 'Hold')
    expect(active).toBeDefined()
    const ps = emptyProjectState()
    ps.septicSource = 'Sewer' // → nextSepticAction = 'sweravail' (our court)
    const ac = buildActionCenter([active!], () => ps)
    const septicMoves = ac.moves.filter((m) => m.stream === 'septic')
    expect(septicMoves.length).toBeGreaterThan(0)
  })
})
