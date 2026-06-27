import { describe, it, expect } from 'vitest'
import { migrate } from './useProjects'
import { PROJECTS } from '../data/projects'
import { emptyProjectState } from '../data/seed'
import type { WorkbenchState } from '../types'

/**
 * THE keystone test. migrate() rebuilds the whole state field-by-field on every
 * cloud load/sync — and a field left off that list is silently dropped (exactly
 * how the `assignees` team list got wiped). This populates every field with a
 * sentinel and asserts it survives the round-trip.
 *
 * extrasSeeded + inspectionsMigrated are set true so the one-time data
 * migrations are skipped and we're testing pure pass-through.
 */
const full: Partial<WorkbenchState> = {
  roster: [PROJECTS[0]],
  projects: { [PROJECTS[0].id]: emptyProjectState() },
  tasks: [{ id: 1, text: 'sentinel task', createdAt: '2026-06-27T00:00:00Z' } as never],
  extrasSeeded: true,
  inspectionsMigrated: true,
  templates: { 'vendor:x': { subject: 'SENTINEL', body: 'B' } },
  selectionsCatalog: { sections: [{ id: 'interior', label: 'Interior', categories: [] }] } as never,
  modelTakeoffs: { TESTMODEL: { t1: { done: true } } },
  modelOrderLists: { A: { Block: 'sentinel-list' } },
  models: { ZZ: { masterFiled: true } },
  stepOverrides: { electric: [{ id: 's1', label: 'Sentinel step' }] },
  assignees: ['Carey'],
  vendors: [{ id: 'v-test', name: 'TestVendor', email: '', icon: '📦', supplies: '', categories: [] }],
}

const out = migrate(full)

describe('migrate() round-trip', () => {
  it('keeps the team list (the assignees data-loss regression)', () => {
    expect(out.assignees).toEqual(['Carey'])
  })

  it('keeps the owner-editable vendors', () => {
    expect(out.vendors?.some((v) => v.name === 'TestVendor')).toBe(true)
  })

  it('keeps templates, catalog, model data, step overrides, and tasks', () => {
    expect(out.templates?.['vendor:x']?.subject).toBe('SENTINEL')
    expect(out.selectionsCatalog).toBeDefined()
    expect(out.modelTakeoffs?.TESTMODEL).toBeDefined()
    expect(out.modelOrderLists?.A?.Block).toBe('sentinel-list')
    expect(out.models?.ZZ).toBeDefined()
    expect(out.stepOverrides?.electric).toHaveLength(1)
    expect(out.tasks.some((t) => t.text === 'sentinel task')).toBe(true)
  })

  // The guard: if someone adds a field to WorkbenchState, they must add it here
  // AND to migrate()'s result object — or this fails. That's the whole point.
  it('output carries EVERY WorkbenchState field', () => {
    const EXPECTED_KEYS = [
      'roster',
      'projects',
      'tasks',
      'extrasSeeded',
      'inspectionsMigrated',
      'templates',
      'selectionsCatalog',
      'modelTakeoffs',
      'modelOrderLists',
      'models',
      'stepOverrides',
      'assignees',
      'vendors',
    ]
    for (const k of EXPECTED_KEYS) expect(out).toHaveProperty(k)
  })
})
