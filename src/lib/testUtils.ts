/**
 * testUtils.ts — tiny fixture builders shared by the *.test.ts suites.
 * TEST-ONLY: nothing in the app imports this (it never reaches the bundle).
 *
 * makeProject gives you a deterministic roster entry that stays OUT of every
 * data-file lookup on purpose:
 *   - model 'ZZZ'   → modelKey('ZZZ') = '' → no takeoff items fire
 *   - permit 'X-NONE' → not in PERMIT_DATES/PERMIT_PORTALS → no county data
 *   - subdivision 'Nowhere' → not in the VERIFY_RE ambiguous-territory list
 * Override any field per test to opt INTO a behavior (e.g. model: 'A' to test
 * takeoffs, subdivision: 'Silver Springs Shores' to test territory verify).
 */
import type { Project, Task } from '../types'

export function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 1,
    address: '123 Test St',
    city: 'Ocala',
    zip: '34400',
    model: 'ZZZ',
    parcel: '0000',
    subdivision: 'Nowhere',
    electricCo: 'SECO',
    permit: 'X-NONE',
    workOrder: '',
    serviceType: '',
    listStatus: '',
    engineer: '',
    waterSource: '',
    ...over,
  }
}

/** A bare task; override what the test cares about. */
export function makeTask(text: string, over: Partial<Task> = {}): Task {
  return { id: text, text, category: 'office', createdAt: '2026-07-01T08:00:00', ...over }
}
