import { describe, it, expect } from 'vitest'
import { mergeWorkbench } from './mergeState'
import { emptyProjectState } from '../data/seed'
import type { WorkbenchState } from '../types'

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

function baseState(): WorkbenchState {
  return {
    roster: [],
    projects: { 1: emptyProjectState(), 2: emptyProjectState() },
    tasks: [],
    extrasSeeded: true,
    inspectionsMigrated: true,
    templates: {},
    selectionsCatalog: { sections: [] } as never,
    modelTakeoffs: {},
    modelOrderLists: {},
    models: {},
    stepOverrides: {},
    assignees: ['Adam'],
    vendors: [{ id: 'v1', name: 'V1', email: '', icon: '📦', supplies: '' } as never],
  }
}

describe('mergeWorkbench — concurrent-edit resolution', () => {
  it('preserves edits to DIFFERENT projects (the core case — no silent loss)', () => {
    const base = baseState()
    const local = clone(base)
    local.projects[1].notes.electric = 'LOCAL edit on #1'
    const remote = clone(base)
    remote.projects[2].notes.water = 'REMOTE edit on #2'
    const merged = mergeWorkbench(base, local, remote)
    expect(merged.projects[1].notes.electric).toBe('LOCAL edit on #1')
    expect(merged.projects[2].notes.water).toBe('REMOTE edit on #2')
  })

  it('same project edited on both sides → committed remote wins (converge)', () => {
    const base = baseState()
    const local = clone(base)
    local.projects[1].notes.electric = 'LOCAL'
    const remote = clone(base)
    remote.projects[1].notes.electric = 'REMOTE'
    expect(mergeWorkbench(base, local, remote).projects[1].notes.electric).toBe('REMOTE')
  })

  it('keeps a local-only edit when remote is unchanged', () => {
    const base = baseState()
    const local = clone(base)
    local.projects[1].notes.permit = 'only local'
    expect(mergeWorkbench(base, local, clone(base)).projects[1].notes.permit).toBe('only local')
  })

  it('unions assignees added on each side', () => {
    const base = baseState()
    const local = clone(base)
    local.assignees = ['Adam', 'Carey']
    const remote = clone(base)
    remote.assignees = ['Adam', 'Josh']
    expect(new Set(mergeWorkbench(base, local, remote).assignees)).toEqual(new Set(['Adam', 'Carey', 'Josh']))
  })

  it('keeps vendors added on each side (merge by id)', () => {
    const base = baseState()
    const local = clone(base)
    local.vendors!.push({ id: 'v2', name: 'V2', email: '', icon: '📦', supplies: '' } as never)
    const remote = clone(base)
    remote.vendors!.push({ id: 'v3', name: 'V3', email: '', icon: '📦', supplies: '' } as never)
    expect(
      mergeWorkbench(base, local, remote)
        .vendors!.map((v) => v.id)
        .sort(),
    ).toEqual(['v1', 'v2', 'v3'])
  })

  it('keeps tasks added on each side', () => {
    const base = baseState()
    const local = clone(base)
    local.tasks = [{ id: 1, text: 'local task' } as never]
    const remote = clone(base)
    remote.tasks = [{ id: 2, text: 'remote task' } as never]
    expect(
      mergeWorkbench(base, local, remote)
        .tasks.map((t) => t.id)
        .sort(),
    ).toEqual([1, 2])
  })

  it('respects a deletion when the other side left it untouched', () => {
    const base = baseState()
    const local = clone(base)
    delete local.projects[2]
    const merged = mergeWorkbench(base, local, clone(base))
    expect(merged.projects[2]).toBeUndefined()
    expect(merged.projects[1]).toBeDefined()
  })

  it('one-time flags stay true (monotonic)', () => {
    const base = baseState()
    const local = clone(base)
    local.extrasSeeded = false
    expect(mergeWorkbench(base, local, clone(base)).extrasSeeded).toBe(true)
  })
})
