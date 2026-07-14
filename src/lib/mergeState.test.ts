import { describe, it, expect } from 'vitest'
import { mergeWorkbench } from './mergeState'
import { emptyProjectState } from '../data/seed'
import type { WorkbenchState } from '../types'

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/**
 * A fixture with EVERY WorkbenchState field present — typed Required<...> ON
 * PURPOSE. When someone adds a new field to WorkbenchState, this function
 * stops compiling until the fixture includes it, which walks you straight
 * into the completeness test below (mergeWorkbench must return every field,
 * or two operators saving at the same moment silently lose it — the July 2026
 * bug, where 4 fields added after the merge was written were being dropped).
 */
function baseState(): Required<WorkbenchState> {
  return {
    roster: [],
    projects: { 1: emptyProjectState(), 2: emptyProjectState() },
    tasks: [],
    extrasSeeded: true,
    inspectionsMigrated: true,
    vendorCatalogsSeeded: true,
    templates: {},
    selectionsCatalog: { sections: [] } as never,
    modelTakeoffs: {},
    modelOrderLists: {},
    customOrderCategories: ['Dumpster'],
    models: {},
    stepOverrides: {},
    assignees: ['Adam'],
    vendors: [{ id: 'v1', name: 'V1', email: '', icon: '📦', supplies: '' } as never],
    utilities: [{ id: 'u1', kind: 'electric', name: 'SECO' } as never],
    scanMeta: { lastScanAt: '2026-07-01T05:31:00.000Z', permitsRead: 44 },
    portalDates: {
      '2025082884': { status: 'Issued', issued: '2025-10-21', expires: '2026-11-02', checkedAt: '2026-07-14T10:52:00.000Z' },
    },
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

  // ——— July 2026 regression guards: fields the merge used to silently drop ———

  it('COMPLETENESS: merge returns every WorkbenchState field (no silent drops)', () => {
    const base = baseState() // Required<WorkbenchState> → has ALL fields
    const merged = mergeWorkbench(base, clone(base), clone(base))
    // If this fails, a field was added to WorkbenchState but not to
    // mergeWorkbench's return object — meaning any concurrent save LOSES it.
    expect(Object.keys(merged).sort()).toEqual(Object.keys(base).sort())
  })

  it('unions customOrderCategories added on each side', () => {
    const base = baseState()
    const local = clone(base)
    local.customOrderCategories = ['Dumpster', 'Sand']
    const remote = clone(base)
    remote.customOrderCategories = ['Dumpster', 'Porta-potty']
    expect(new Set(mergeWorkbench(base, local, remote).customOrderCategories)).toEqual(
      new Set(['Dumpster', 'Sand', 'Porta-potty']),
    )
  })

  it('keeps utility companies added on each side (merge by id, like vendors)', () => {
    const base = baseState()
    const local = clone(base)
    local.utilities!.push({ id: 'u2', kind: 'water', name: 'MCU' } as never)
    const remote = clone(base)
    remote.utilities!.push({ id: 'u3', kind: 'electric', name: 'Duke' } as never)
    expect(
      mergeWorkbench(base, local, remote)
        .utilities!.map((u) => u.id)
        .sort(),
    ).toEqual(['u1', 'u2', 'u3'])
  })

  it('a fresh scanner heartbeat survives merging with unsaved local edits', () => {
    // The real-world shape of the bug: the Mac's 5:30 scan stamps scanMeta in
    // the cloud while an operator has an unsaved note — BOTH must survive.
    const base = baseState()
    const local = clone(base)
    local.projects[1].notes.electric = 'unsaved local edit'
    const remote = clone(base)
    remote.scanMeta = { lastScanAt: '2026-07-07T05:31:00.000Z', permitsRead: 45 }
    const merged = mergeWorkbench(base, local, remote)
    expect(merged.scanMeta?.lastScanAt).toBe('2026-07-07T05:31:00.000Z')
    expect(merged.projects[1].notes.electric).toBe('unsaved local edit')
  })

  it('vendorCatalogsSeeded stays true (monotonic, like the other one-time flags)', () => {
    const base = baseState()
    const local = clone(base)
    local.vendorCatalogsSeeded = false
    expect(mergeWorkbench(base, local, clone(base)).vendorCatalogsSeeded).toBe(true)
  })
})
