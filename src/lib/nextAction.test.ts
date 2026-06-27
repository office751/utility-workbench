import { describe, it, expect } from 'vitest'
import { nextSepticAction } from './nextAction'
import { emptyProjectState } from '../data/seed'

// nextAction decides "what's the next move" per stream — it feeds the Today
// command center. The Sewer path was the one recently fixed, so guard it.
describe('nextSepticAction', () => {
  it('a default (Septic) lot starts at the site/soil evaluation', () => {
    const ps = emptyProjectState()
    expect(nextSepticAction(ps).key).toBe('seval')
  })

  it('a SEWER lot resolves to the sewer steps (availability first)', () => {
    const ps = emptyProjectState()
    ps.septicSource = 'Sewer'
    expect(nextSepticAction(ps).key).toBe('sweravail')
  })

  it('reports done once every step of the resolved list is checked', () => {
    const ps = emptyProjectState()
    ps.septicSource = 'Sewer'
    ps.steps.septic = {
      sweravail: { done: true },
      swerapply: { done: true },
      swertap: { done: true },
      swerconn: { done: true },
    }
    expect(nextSepticAction(ps).key).toBe('done')
  })
})
