/**
 * mergeState.ts — a 3-way merge for the one-blob WorkbenchState.
 *
 * THE PROBLEM IT SOLVES: the whole app state is one row, saved as one blob,
 * last-writer-wins. When two operators edit at the same moment, the realtime
 * sync used to REPLACE one device's in-progress edit with the other's whole
 * blob — silently losing it (Audit 3 finding).
 *
 * THE FIX: keep the last state we synced from as a common ancestor (`base`),
 * and when a remote write arrives while we have unsaved local edits, MERGE the
 * two against that base instead of overwriting. Edits to DIFFERENT houses (the
 * overwhelmingly common case) both survive losslessly; a true same-entity
 * conflict converges on the already-committed remote value (so all devices
 * agree) rather than silently dropping work on the floor.
 *
 * Pure + deterministic so it's unit-tested (see mergeState.test.ts) — the way
 * to make a sync change safe without two live browsers.
 */
import type { WorkbenchState } from '../types'

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 3-way pick for one value: keep whichever side changed vs the base. If BOTH
 * changed (to different values), the already-committed REMOTE wins so devices
 * converge. (base/local/remote may be undefined for optional fields.)
 */
function pick3<T>(base: T, local: T, remote: T): T {
  if (eq(local, remote)) return local
  if (eq(local, base)) return remote // only remote moved
  if (eq(remote, base)) return local // only local moved
  return remote // genuine conflict → committed side wins
}

/**
 * Merge two keyed maps against a base, key by key (projects by id, templates by
 * id, …). Biased to PRESERVE: a key one side added/edited is kept; a key is only
 * dropped if a side deleted it AND the other side left it untouched vs base.
 */
function mergeRecord<V>(
  base: Record<string, V> = {},
  local: Record<string, V> = {},
  remote: Record<string, V> = {},
): Record<string, V> {
  const out: Record<string, V> = {}
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const inL = k in local
    const inR = k in remote
    const inB = k in base
    if (inL && inR) out[k] = pick3(base[k], local[k], remote[k])
    else if (inL) {
      // remote lacks it: only treat as a real delete if local never touched it
      if (!(inB && eq(local[k], base[k]))) out[k] = local[k]
    } else if (inR) {
      if (!(inB && eq(remote[k], base[k]))) out[k] = remote[k]
    }
  }
  return out
}

/** Arrays of objects keyed by an id field → merge by id (preserve order-ish). */
function mergeById<T>(base: T[] = [], local: T[] = [], remote: T[] = [], idKey: keyof T): T[] {
  const toMap = (arr: T[]) => Object.fromEntries(arr.map((x) => [String(x[idKey]), x])) as Record<string, T>
  return Object.values(mergeRecord(toMap(base), toMap(local), toMap(remote)))
}

/** assignees is a plain string list → union (bias to preserve every name). */
function mergeStringSet(local: string[] = [], remote: string[] = []): string[] {
  return [...new Set([...local, ...remote])]
}

/**
 * Merge `remote` (a just-arrived committed blob) into `local` (our state with
 * unsaved edits) against `base` (the last state we synced from). Returns a new
 * state preserving both sides' non-conflicting changes.
 */
export function mergeWorkbench(base: WorkbenchState, local: WorkbenchState, remote: WorkbenchState): WorkbenchState {
  const rec = <V>(sel: (s: WorkbenchState) => Record<string, V> | undefined) =>
    mergeRecord(sel(base), sel(local), sel(remote))
  // ⚠ COMPLETENESS RULE: every WorkbenchState field must appear in this return.
  // A field left off is silently DROPPED whenever two operators save at the
  // same moment — exactly how customOrderCategories / utilities / scanMeta /
  // vendorCatalogsSeeded were lost until July 2026 (they were added to types.ts
  // after this merge was written, and nothing forced the two to stay in sync).
  // The safety net now lives in mergeState.test.ts: its fixture is typed
  // Required<WorkbenchState>, so adding a field to types.ts won't even compile
  // there until the fixture — and the completeness test — cover it.
  return {
    roster: mergeById(base.roster, local.roster, remote.roster, 'id'),
    // projects is keyed by numeric id; JS object keys are strings either way.
    projects: mergeRecord(
      base.projects as never,
      local.projects as never,
      remote.projects as never,
    ) as WorkbenchState['projects'],
    tasks: mergeById(base.tasks, local.tasks, remote.tasks, 'id'),
    // One-time markers are monotonic: once ANY device has done the one-time
    // work, stay true forever so it's never redone (deleted rows stay deleted,
    // backfills don't re-run).
    extrasSeeded: !!(local.extrasSeeded || remote.extrasSeeded),
    inspectionsMigrated: !!(local.inspectionsMigrated || remote.inspectionsMigrated),
    vendorCatalogsSeeded: !!(local.vendorCatalogsSeeded || remote.vendorCatalogsSeeded),
    templates: rec((s) => s.templates),
    selectionsCatalog: pick3(base.selectionsCatalog, local.selectionsCatalog, remote.selectionsCatalog),
    modelTakeoffs: rec((s) => s.modelTakeoffs),
    modelOrderLists: rec((s) => s.modelOrderLists),
    models: rec((s) => s.models),
    stepOverrides: rec((s) => s.stepOverrides),
    // Custom material-category names → union, same bias-to-preserve as
    // assignees (losing one silently hides that category from the Materials
    // "＋ Add an order" picker on every project).
    customOrderCategories: mergeStringSet(local.customOrderCategories, remote.customOrderCategories),
    assignees: mergeStringSet(local.assignees, remote.assignees),
    vendors: mergeById(base.vendors ?? [], local.vendors ?? [], remote.vendors ?? [], 'id'),
    // Owner-added utility companies — same owner-editable-directory pattern
    // (and the same by-id merge) as vendors above.
    utilities: mergeById(base.utilities ?? [], local.utilities ?? [], remote.utilities ?? [], 'id'),
    // Scanner heartbeat: one small object stamped by the Mac's scan job.
    // pick3 keeps whichever side moved; if BOTH moved, the committed remote
    // wins — which is usually the fresher completed-scan stamp, and dropping
    // the local side's pending "Scan now" request in that case is correct
    // (a completed scan is exactly what clears the request everywhere).
    scanMeta: pick3(base.scanMeta, local.scanMeta, remote.scanMeta),
    // Live county permit dates recorded by the nightly scanner, keyed by
    // permit # → per-key 3-way like every other map. Only the scanner writes
    // these, so conflicts are rare; remote-wins on one is the fresher scan.
    portalDates: rec((s) => s.portalDates),
  }
}
