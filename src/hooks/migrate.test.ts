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
  scanMeta: { lastScanAt: '2026-07-02T09:31:00Z', permitsRead: 56 },
  customOrderCategories: ['Gutters'],
  vendorCatalogsSeeded: true, // skip the one-time backfill for the passthrough test
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

  it('keeps the scanner heartbeat stamp (drives the Today stale-scan alert)', () => {
    expect(out.scanMeta?.lastScanAt).toBe('2026-07-02T09:31:00Z')
  })

  it('keeps owner-added custom materials (the customOrderCategories data-loss regression)', () => {
    expect(out.customOrderCategories).toEqual(['Gutters'])
  })

  it('backfills a missing vendor catalog once (Florida Express order menu)', () => {
    const out2 = migrate({
      // A saved vendor from before the catalog field existed, and no seed flag.
      vendors: [{ id: 'florida-express', name: 'Florida Express', email: '', icon: '🗑️', supplies: '', categories: ['Dumpster'] }],
    })
    const fe = out2.vendors?.find((v) => v.id === 'florida-express')
    expect((fe?.catalog?.length ?? 0) > 0).toBe(true) // deliver/swap/remove menu restored
    expect(out2.vendorCatalogsSeeded).toBe(true)
  })

  it("keeps a manual UNCHECK on an issued permit — the '(unchecked)' clobber regression", () => {
    // July 2026 (Adam: "I can't edit projects once they're issued"): a numeric
    // permit # infers as issued, so the checklist arrives all-done. Unchecking
    // a box used to leave no manual trace (dates were cleared), and this very
    // re-derive flipped it back on the next load. toggleStep now stamps
    // '(unchecked)', which hasManualPermitEdits reads as a human decision.
    const inferred = { done: true, date: '(inferred)' }
    const edited = emptyProjectState()
    edited.steps.permit = {
      submitted: inferred,
      review: inferred,
      approved: inferred,
      issued: { done: false, date: '(unchecked)' }, // Adam unticked it
    }
    const machine = emptyProjectState()
    machine.steps.permit = { submitted: inferred, review: inferred }
    const out2 = migrate({
      roster: [
        { ...PROJECTS[0], id: 901, permit: '2099123456' }, // all digits → infers issued
        { ...PROJECTS[0], id: 902, permit: '2099123457' },
      ],
      projects: { 901: edited, 902: machine },
    })
    // The hand-unticked box STAYS unticked…
    expect(out2.projects[901].steps.permit.issued?.done).toBe(false)
    // …while a purely machine-derived checklist still follows the inference.
    expect(out2.projects[902].steps.permit.issued?.done).toBe(true)
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
      'utilities',
      'drawTemplates',
      'scanMeta',
      'customOrderCategories',
      'vendorCatalogsSeeded',
    ]
    for (const k of EXPECTED_KEYS) expect(out).toHaveProperty(k)
  })
})
