/**
 * useProjects.ts — THE one place storage lives.
 *
 * A "hook" is a reusable piece of React logic. Components call
 * `useProjects()` and get back the saved state + functions to change it.
 * Every change automatically writes to localStorage, so progress survives
 * closing the browser.
 *
 * Why does this matter? Because NO other file mentions localStorage. If we
 * ever move to a real shared database (the "Full" spec), we rewrite THIS
 * file to call an API instead — and the rest of the app doesn't change.
 *
 * Two React ideas at work here:
 *   useState  — "remember this value between renders, and re-draw the
 *                screen whenever it changes"
 *   useEffect — "after the screen updates, run this side-effect"
 *                (here: save to localStorage)
 */
import { useEffect, useRef, useState } from 'react'
import type {
  OrderItem,
  Project,
  ProjectState,
  SelectionChoice,
  SelectionsCatalog,
  StepState,
  Stream,
  Task,
  TemplateOverride,
  Utility,
  WorkbenchState,
} from '../types'
import { buildInitialState, emptyProjectState, inferPermitSteps, seedStateFor } from '../data/seed'
import { defaultCatalog, defaultSelections } from '../data/selections'
import { VENDORS, type Vendor } from '../data/vendors'
import { UTILITIES, type UtilityCompany } from '../data/utilities'
import { ESTABLISHED_MODELS, TAKEOFF_TYPES } from '../data/takeoffs'
import { ORDER_CATEGORIES, SITE_SERVICES, standardOrdersFor } from '../data/orders'
import { modelKey } from '../data/models'
import { PROJECTS } from '../data/projects'
import { supabase } from '../lib/supabase'
import { deleteProjectFile, uploadModelFile, uploadProjectFile } from '../lib/files'
import { mergeWorkbench } from '../lib/mergeState'
import { applyFactsPatch, hasManualPermitEdits } from '../lib/projectFacts'
import { CAUGHT_UP_DATE } from '../lib/catchup'
import { applyPortalDates } from '../data/permitDates'

/** The key our data is filed under in the browser's localStorage. */
const STORAGE_KEY = 'isc_workbench_v1'

/** The streams every saved project must have step/note buckets for. */
const STREAMS: Stream[] = ['electric', 'water', 'septic', 'permit', 'materials']

/**
 * Make sure one saved ProjectState has a bucket for every stream. Older saves
 * (made before the Permitting tab existed) have electric/water/septic but no
 * `permit` — without this, reading ps.steps.permit would crash. This is the
 * heart of a migration: gently upgrade old data to today's shape.
 */
/**
 * Best-effort upgrade for older saves: give already-completed steps a machine
 * timestamp (`doneAt`) so the stale-status math has something to measure. We
 * derive it from the friendly `date` string the step already has — BUT only
 * when that string is a real date. Seeded / county-inferred steps use sentinel
 * markers like "(county)" or "(from list)" that don't parse to a date; those
 * keep `doneAt` undefined, because we genuinely don't know when they happened.
 */
function backfillDoneAt(bucket: Record<string, StepState>): Record<string, StepState> {
  const out: Record<string, StepState> = {}
  for (const [stepId, st] of Object.entries(bucket)) {
    if (st.done && !st.doneAt && st.date) {
      const ms = Date.parse(st.date) // "6/3/2026" → a number; "(county)" → NaN
      out[stepId] = Number.isNaN(ms) ? st : { ...st, doneAt: new Date(ms).toISOString() }
    } else {
      out[stepId] = st // already has doneAt, not done, or no date to derive from
    }
  }
  return out
}

function normalize(ps: ProjectState): ProjectState {
  const steps = { ...ps.steps } as ProjectState['steps']
  const notes = { ...ps.notes } as ProjectState['notes']
  for (const s of STREAMS) {
    // Ensure every stream has a bucket, AND backfill doneAt on old completed steps.
    steps[s] = backfillDoneAt(steps[s] ?? {})
    if (notes[s] == null) notes[s] = ''
  }
  // 'meternotify' is a NEWER electric step that sits BEFORE 'meter' in the
  // lifecycle. Saves that already reached the meter set (meter/power done)
  // predate it, so without this backfill they'd re-open as a pending "notify
  // the utility — ready for meter" action (and a false stale flag). Mark it
  // done for any house already PAST the meter stage — additive + idempotent
  // (only fills when missing). Houses still BETWEEN field-work and meter
  // correctly get it as a genuine pending step. '(inferred)' = not a real date,
  // so backfillDoneAt won't stamp a doneAt and staleness won't time it.
  const elec = steps.electric
  if ((elec['meter']?.done || elec['power']?.done) && !elec['meternotify']?.done) {
    steps.electric = { ...elec, meternotify: { done: true, date: '(inferred)' } }
  }
  // Older saves predate material orders — ensure it's an array.
  const orders = Array.isArray(ps.orders) ? ps.orders : []
  // Files: a project-level list now. Older saves kept names under `permitDocs`
  // — fold those in once (they're legacy name-only entries with no real file).
  const docs = Array.isArray(ps.docs)
    ? ps.docs
    : Array.isArray(ps.permitDocs)
      ? ps.permitDocs
      : []
  // Homeowner selections arrived after most houses were saved — default it, and
  // make sure both sub-buckets exist so the tab can read them without guards.
  const selections = ps.selections
    ? { ...ps.selections, interior: ps.selections.interior ?? {}, exterior: ps.selections.exterior ?? {} }
    : defaultSelections()
  return { ...ps, steps, notes, orders, docs, selections }
}

/**
 * MIGRATION: upgrade older saved data to the current shape.
 *  - Saves from before the Add-project feature have no `roster` — patch one in.
 *  - Saves from before the Permitting tab lack the `permit` stream — normalize
 *    every project so all four streams exist.
 * (Every app that stores data needs a story for "what about data saved by an
 * older version?" — this is ours.)
 */
export function migrate(parsed: Partial<WorkbenchState>): WorkbenchState {
  // Live county permit dates (scanner-recorded) feed the pure date getters via
  // a module global — sync it BEFORE the inferPermitSteps loop below, so a
  // permit the county newly reports as issued completes its checklist on this
  // very load (App.tsx re-applies every render for realtime updates).
  applyPortalDates(parsed.portalDates)
  const savedRoster = Array.isArray(parsed.roster) ? parsed.roster : PROJECTS
  // FACT CORRECTIONS: the saved roster wins over PROJECTS, so typos found in
  // the original import have to be patched here too (idempotent).
  // 13 Almond Pass: county records say parcel 9023-0489-16 — ours had an
  // extra zero, which made the legal-description lookup miss.
  const roster = savedRoster.map((p) =>
    p.parcel === '9023-0489-016' ? { ...p, parcel: '9023-0489-16' } : p,
  )
  // permit number per project id, so we can backfill permit status below
  const permitById = new Map(roster.map((p) => [p.id, p.permit]))

  const projects: Record<number, ProjectState> = {}
  for (const [id, ps] of Object.entries(parsed.projects ?? {})) {
    const norm = normalize(ps as ProjectState)
    // Permit checklist follows the county portal (via inferPermitSteps), so
    // re-derive it on load — UNLESS you've manually toggled a step (a manual
    // step has a REAL date, not our '(inferred)'/'(county)' marker — the
    // shared test lives in lib/projectFacts.ts, also used when the permit #
    // is edited in ⚙️ Project settings). Keeps your edits while staying in
    // sync with the portal data we captured.
    if (!hasManualPermitEdits(norm.steps.permit))
      norm.steps.permit = inferPermitSteps(permitById.get(Number(id)) ?? '')
    projects[Number(id)] = norm
  }
  // Tasks arrived after the first releases — older saves won't have them.
  // First run of the takeoff tracker: established models start fully gathered;
  // new models (Republic, Concord, anything future) start EMPTY = needs chasing.
  let modelTakeoffs = parsed.modelTakeoffs
  if (!modelTakeoffs) {
    modelTakeoffs = {}
    for (const mk of ESTABLISHED_MODELS) {
      modelTakeoffs[mk] = Object.fromEntries(
        TAKEOFF_TYPES.map((t) => [t.id, { done: true, date: '(established)' }]),
      )
    }
  }

  // Vendors: seed from code defaults on first run, then the blob owns them.
  // ONE-TIME backfill: copy each saved vendor's `catalog` (its company order
  // menu) from the code defaults by id, when missing — so Florida Express,
  // added before the catalog field existed, gets its deliver/swap/remove menu.
  // Flag-guarded so a deliberately-emptied catalog isn't re-added every load.
  let vendors = Array.isArray(parsed.vendors) ? parsed.vendors : VENDORS
  let vendorCatalogsSeeded = parsed.vendorCatalogsSeeded === true
  if (!vendorCatalogsSeeded) {
    const defaultById = new Map(VENDORS.map((v) => [v.id, v]))
    vendors = vendors.map((v) => {
      const def = defaultById.get(v.id)
      return !v.catalog && def?.catalog ? { ...v, catalog: def.catalog } : v
    })
    vendorCatalogsSeeded = true
  }

  const result: WorkbenchState = {
    roster: [...roster],
    projects,
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    extrasSeeded: parsed.extrasSeeded === true,
    inspectionsMigrated: parsed.inspectionsMigrated === true,
    vendorCatalogsSeeded,
    templates: parsed.templates ?? {},
    // Seed the Selections catalog from code defaults on first run; after that
    // the saved blob owns it (editable in Settings → Selections setup).
    selectionsCatalog: parsed.selectionsCatalog ?? defaultCatalog(),
    modelTakeoffs,
    modelOrderLists: parsed.modelOrderLists ?? {},
    // Model library: seed once with what we know (E2 is master-filed); after
    // that the saved object is the source of truth, edits included.
    models: parsed.models ?? { E2: { masterFiled: true } },
    // Owner-edited checklist step lists (empty = use the code defaults).
    stepOverrides: parsed.stepOverrides ?? {},
    // Team list (Settings → Team), feeds the Tasks "Assign to" dropdown. MUST be
    // carried through migrate or it gets stripped on every cloud load/realtime
    // sync and written back empty — the blob-clobber failure mode. Array-guarded.
    assignees: Array.isArray(parsed.assignees) ? parsed.assignees : [],
    // Vendors directory (seeded/backfilled above; the blob owns it after —
    // edited in Settings → Vendor setup).
    vendors,
    // Extra utility companies (Electric/Water/Sewer) — same seed-then-blob-owns
    // pattern as vendors above. Array-guarded so a malformed/missing field
    // never crashes a load; falls back to the (empty) code default.
    utilities: Array.isArray(parsed.utilities) ? parsed.utilities : UTILITIES,
    // Heartbeat stamped by the nightly permit scanner (scanner/scan.mjs
    // --write). Absent until the scanner's first stamped run. Like assignees:
    // MUST be carried here or every load/sync strips it and the Today
    // "scanner has gone quiet" alert could never fire. Shape-guarded.
    // (either field keeps it — a fresh "Scan now" request can exist before
    // the scanner has ever stamped a completed run)
    scanMeta: parsed.scanMeta?.lastScanAt || parsed.scanMeta?.requestedAt ? parsed.scanMeta : undefined,
    // Owner-added custom material names (Settings → Custom materials, and the
    // Materials tab's "➕ Custom material…" composer). Like assignees/vendors
    // above, this MUST be carried through migrate — otherwise every cloud load
    // and realtime sync strips it and writes the blob back empty, so your custom
    // materials vanish on reload (the blob-clobber failure mode). Array-guarded.
    customOrderCategories: Array.isArray(parsed.customOrderCategories) ? parsed.customOrderCategories : [],
    // Live county permit dates recorded by the nightly scanner. Like scanMeta
    // above: MUST be carried through migrate, or every app load/realtime sync
    // strips the scanner's record and writes the blob back without it (the
    // blob-clobber failure mode) — and expiry-change detection loses its
    // baseline. Shape-guarded; absent until the scanner's first recording run.
    portalDates:
      parsed.portalDates && typeof parsed.portalDates === 'object' && !Array.isArray(parsed.portalDates)
        ? parsed.portalDates
        : undefined,
  }

  // ONE-TIME (June 2026): the scanner used to turn inspection RESULTS into
  // tasks, flooding the task list. Move every such task ("portal:…:rej:…")
  // into its project's `inspections` list — reference info, not to-dos. The
  // scanner itself writes to `inspections` now; this cleans up what's left.
  if (!result.inspectionsMigrated) {
    const stays: Task[] = []
    for (const t of result.tasks) {
      const m = /^portal:[^:]+:rej:(.*)$/.exec(t.sourceKey ?? '')
      if (!m || t.projectId == null) {
        stays.push(t)
        continue
      }
      const ps = result.projects[t.projectId] ?? (result.projects[t.projectId] = emptyProjectState())
      const insp = (ps.inspections ??= [])
      if (!insp.some((i) => i.sourceKey === t.sourceKey)) {
        // Task text was "<address>: <desc> — <status>" — the part after the
        // LAST " — " is the status; desc comes from the sourceKey (raw).
        const cut = t.text.lastIndexOf(' — ')
        insp.push({
          sourceKey: t.sourceKey!,
          desc: m[1],
          status: cut >= 0 ? t.text.slice(cut + 3) : '(see portal)',
          noticedAt: t.createdAt,
        })
      }
    }
    result.tasks = stays
    result.inspectionsMigrated = true
  }

  // One-time: fold in the C.O./Hold homes if this save predates them.
  return result.extrasSeeded ? result : mergeExtraProjects(result)
}

/** Stable identity for matching a project across the seed and saved data. */
function projectKey(p: Project): string {
  return `${p.address.trim().toLowerCase()}|${p.parcel.trim()}`
}

/**
 * ONE-TIME merge: fold the C.O./Hold homes from the seed (PROJECTS) into a
 * saved roster that predates them. It ONLY ever touches homes whose status is
 * 'CO'/'Hold' (so a project you deleted earlier is never resurrected), skips
 * any already present (by address+parcel), and assigns fresh ids past the
 * current max so it can't collide with projects you've added. Each new home
 * gets its progress seeded (C.O. = done) via seedStateFor. Sets extrasSeeded
 * so it never runs again — meaning deletions of these homes stick.
 */
function mergeExtraProjects(state: WorkbenchState): WorkbenchState {
  const roster = [...state.roster]
  const projects = { ...state.projects }
  const have = new Set(roster.map(projectKey))
  let nextId = Math.max(0, ...roster.map((p) => p.id)) + 1
  for (const seed of PROJECTS) {
    if (seed.listStatus !== 'CO' && seed.listStatus !== 'Hold') continue
    if (have.has(projectKey(seed))) continue
    const p: Project = { ...seed, id: nextId++ }
    roster.push(p)
    projects[p.id] = seedStateFor(p)
    have.add(projectKey(p))
  }
  return { ...state, roster, projects, extrasSeeded: true }
}

/** Read saved state, or build the seeded starting state on first ever run. */
function load(): WorkbenchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return migrate(JSON.parse(raw))
  } catch {
    // Corrupted/unreadable saved data — fall through and start fresh.
  }
  return buildInitialState()
}

export function useProjects() {
  // Initialize state ONCE from localStorage (passing a function to useState
  // means "only run this on the very first render").
  const [state, setState] = useState<WorkbenchState>(load)

  // --- Cloud sync (Supabase) ---------------------------------------------
  // `state` still initializes instantly from localStorage (load()), so the UI
  // never waits on the network. These two effects layer the cloud on top.
  const cloudReady = useRef(false) // have we reconciled with the cloud yet?
  const skipNextSave = useRef(false) // don't echo a fresh cloud-load back up
  // For the 3-way concurrent-edit merge: `baseRef` is the last state we synced
  // FROM (the common ancestor); `dirtyRef` is true while we hold an unsaved
  // local edit. When a remote write lands while dirty, we merge instead of
  // clobbering our edit (see the realtime handler + lib/mergeState.ts).
  const baseRef = useRef<WorkbenchState | null>(null)
  const dirtyRef = useRef(false)
  // A unique id for THIS browser tab. We stamp every cloud write with it so
  // that when Supabase Realtime echoes our own write back, we recognize and
  // ignore it. (We used to compare JSON strings — but Postgres `jsonb`
  // REORDERS object keys on store, so the echo never string-matched what we
  // sent. The app then mistook its own save for a remote edit and REPLACED
  // state mid-typing: that was the caret-jump / lag / "didn't save" bug.)
  const clientId = useRef<string>('')
  if (!clientId.current) clientId.current = crypto.randomUUID()
  // Always-current copy of state, for the flush-on-close handler (its effect
  // runs once on mount, so it can't close over the latest `state` directly).
  const stateRef = useRef(state)
  stateRef.current = state

  // Save status, surfaced in the header so you can SEE that a save worked
  // (and force one with the Save button). 'saved' = cloud has your latest;
  // 'dirty' = a change is waiting for the debounced write; 'saving' = writing
  // now; 'error' = the last write failed (click to retry). No backend → stays
  // 'saved' (localStorage is synchronous and never fails for our purposes).
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** Write the latest state to the cloud now, updating the status indicator. */
  async function doSave() {
    if (!supabase || !cloudReady.current) return
    setSaveState('saving')
    const { error } = await supabase
      .from('workbench')
      .upsert({ id: 'main', data: { ...stateRef.current, __origin: clientId.current }, updated_at: new Date().toISOString() })
    if (error) {
      setSaveState('error')
      console.warn('[workbench] cloud save failed', error)
    } else {
      setSaveState('saved')
      // What we just saved is now the common ancestor for future 3-way merges.
      baseRef.current = JSON.parse(JSON.stringify(stateRef.current))
      dirtyRef.current = false
    }
  }

  /** The header Save button: flush any pending debounced write immediately. */
  function saveNow() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    void doSave()
  }

  // 1) On first mount, reconcile with the cloud. If the cloud has data, it
  //    WINS (it's the shared source of truth across your devices). If it's
  //    empty, seed it from this browser. No cloud (no keys / offline) → we
  //    just keep running on localStorage.
  useEffect(() => {
    if (!supabase) {
      cloudReady.current = true
      return
    }
    const sb = supabase
    let cancelled = false
    let attempt = 0

    async function reconcile() {
      try {
        const { data, error } = await sb.from('workbench').select('data').eq('id', 'main').maybeSingle()
        if (cancelled) return
        if (error) throw error
        if (data?.data) {
          // The cloud has real data → it WINS (shared source of truth). Only
          // after this successful read do we allow this browser to write back.
          const cloudData = data.data as Partial<WorkbenchState>
          // Normally a cloud load shouldn't echo back as a write. EXCEPTION:
          // when migrate() is about to CHANGE the data (merging the C.O./Hold
          // homes, or moving inspection-result tasks into `inspections`), we
          // WANT that written back — so only skip when NO migration applies.
          if (cloudData.extrasSeeded && cloudData.inspectionsMigrated) skipNextSave.current = true
          cloudReady.current = true // ✅ reconciled — saves may now go up
          const migrated = migrate(cloudData)
          baseRef.current = migrated // the common ancestor for 3-way merges
          setState(migrated)
        } else {
          // The row is GENUINELY absent (an authenticated read returned no row),
          // i.e. first-ever run for the org → seed it from this browser. This is
          // the ONLY place we write defaults up, and only on a confirmed-empty read.
          await sb
            .from('workbench')
            .upsert({ id: 'main', data: { ...stateRef.current, __origin: clientId.current }, updated_at: new Date().toISOString() })
          if (!cancelled) {
            cloudReady.current = true
            baseRef.current = JSON.parse(JSON.stringify(stateRef.current)) // ancestor = what we just seeded
          }
        }
      } catch (e) {
        // CRITICAL (data-loss guard): a failed/transient reconcile must NOT
        // enable saving. Otherwise this browser's possibly-seed-default state
        // could overwrite the real cloud blob (this is exactly what reverted
        // edited data to data/projects.ts defaults — June 2026). Keep
        // cloudReady=false (app still runs on localStorage), and RETRY, so we
        // only ever write UP after successfully reading the cloud DOWN.
        console.warn('[workbench] cloud reconcile failed — retrying, NOT saving until loaded', e)
        if (!cancelled && attempt < 6) {
          attempt++
          setTimeout(reconcile, 3000)
        }
      }
    }

    reconcile()
    // Also retry the moment the tab refocuses or regains connectivity, so a
    // device that started offline reconciles (and re-enables saving) ASAP.
    const retryIfNotReady = () => {
      if (!cloudReady.current) reconcile()
    }
    window.addEventListener('focus', retryIfNotReady)
    window.addEventListener('online', retryIfNotReady)
    return () => {
      cancelled = true
      window.removeEventListener('focus', retryIfNotReady)
      window.removeEventListener('online', retryIfNotReady)
    }
  }, []) // once, on mount

  // 2) On every change: always cache to localStorage (instant + offline safety
  //    net), and once we've reconciled, push to the cloud — debounced so a
  //    flurry of edits collapses into a single write.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (!supabase || !cloudReady.current) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      setSaveState('saved') // we just applied the cloud's own data — already saved
      return
    }
    dirtyRef.current = true // an unsaved local edit exists — drives merge-on-remote
    setSaveState('dirty') // a change is waiting to go up
    const timer = setTimeout(() => {
      void doSave()
    }, 600)
    saveTimer.current = timer
    return () => clearTimeout(timer)
    // doSave reads the latest state via stateRef, so it's safe to omit here.
     
  }, [state])

  /** Apply a state that arrived FROM the cloud (realtime event or a manual
   *  re-read). If we hold unsaved local edits, 3-way merge instead of
   *  clobbering them (edits to different houses both survive; a same-entity
   *  clash converges on the committed remote). Otherwise adopt it as-is. */
  function applyRemote(next: WorkbenchState & { __origin?: string }) {
    const remoteState = migrate(next as Partial<WorkbenchState>)
    if (dirtyRef.current && baseRef.current) {
      // We have UNSAVED local edits. Don't clobber them: merge the remote
      // write into ours against the last-synced ancestor. Leave it 'dirty'
      // so the merged union saves up.
      const merged = mergeWorkbench(baseRef.current, stateRef.current, remoteState)
      baseRef.current = remoteState // remote is the new common ancestor
      setState(merged)
    } else {
      // Nothing unsaved locally → just adopt the remote state as-is.
      skipNextSave.current = true // applying remote — don't bounce it back up
      baseRef.current = remoteState
      setState(remoteState)
    }
  }

  // 3) Live-sync: when ANOTHER device writes, apply that change here in real
  //    time (Supabase Realtime). We ignore the echo of our OWN writes by the
  //    `__origin` tag — robust to jsonb key-reordering and to several of our
  //    own saves being in flight at once (a plain string compare was neither).
  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    const channel = sb
      .channel('workbench-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workbench', filter: 'id=eq.main' },
        (payload) => {
          const next = (payload.new as { data?: WorkbenchState & { __origin?: string } } | null)?.data
          if (!next) return
          if (next.__origin === clientId.current) return // our own write echoed back — ignore it
          applyRemote(next)
        },
      )
      .subscribe()
    return () => {
      sb.removeChannel(channel)
    }
  }, [])

  // 3.5) STALE-TAB GUARD (the July 7 2026 data-loss incident). Realtime does
  //    NOT replay messages a tab missed while the machine was asleep or the
  //    connection was down — so a tab left open overnight can sit on HOURS-old
  //    state while believing it's current. When such a tab was touched again,
  //    it used to write that old state over everyone's day of work.
  //    The guard: the moment this tab is USED again (window focus, becomes
  //    visible, or comes back online), re-READ the cloud row and reconcile
  //    through the same applyRemote path as a realtime event — merge if we
  //    hold real unsaved edits, adopt the cloud otherwise. Throttled so
  //    ordinary tab-switching doesn't hammer the network.
  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    let lastCheck = 0
    const resync = async () => {
      if (!cloudReady.current) return // first load is effect (1)'s job
      const now = Date.now()
      if (now - lastCheck < 10_000) return
      lastCheck = now
      try {
        const { data, error } = await sb.from('workbench').select('data').eq('id', 'main').maybeSingle()
        if (error || !data?.data) return // transient failure — never block on this
        const next = data.data as WorkbenchState & { __origin?: string }
        if (next.__origin === clientId.current) return // cloud already holds OUR latest
        applyRemote(next)
      } catch {
        // Offline / fetch aborted — best effort; realtime will catch up.
      }
    }
    const onFocus = () => void resync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void resync()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }

  }, [])

  // 4) Save-on-exit: the cloud save in (2) is debounced 600ms, so a change made
  //    right before you switch tabs or close the window could be lost. Flush
  //    the latest state immediately when the page is hidden or unloading, so
  //    "I clicked away and it didn't save" can't happen.
  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    const flush = () => {
      if (!cloudReady.current) return
      // STALE-TAB GUARD (July 7 2026 incident): only flush when we hold a REAL
      // unsaved edit. A tab with nothing pending has nothing to say — and if
      // it slept through hours of other devices' changes, writing its whole
      // (stale) copy here is exactly how a day of work got erased.
      if (!dirtyRef.current) return
      sb.from('workbench')
        .upsert({ id: 'main', data: { ...stateRef.current, __origin: clientId.current }, updated_at: new Date().toISOString() })
        .then(() => {}) // fire-and-forget; best effort on the way out
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  /** Get one project's progress (never undefined — falls back to blank). */
  function getProjectState(id: number): ProjectState {
    return state.projects[id] ?? emptyProjectState()
  }

  /**
   * The core update helper. React state must be replaced, not edited in
   * place — so we copy the old state, swap in the changed project, and hand
   * React the new object. Every public updater below goes through here.
   */
  function updateProject(id: number, patch: Partial<ProjectState>) {
    setState((prev) => ({
      ...prev, // copy everything as-is...
      projects: {
        ...prev.projects,
        // ...except this one project, which gets the patch merged in
        [id]: { ...(prev.projects[id] ?? emptyProjectState()), ...patch },
      },
    }))
  }

  /** Check or uncheck a checklist step. */
  function toggleStep(id: number, stream: Stream, stepId: string, done: boolean) {
    const ps = getProjectState(id)
    const existing: StepState = ps.steps[stream][stepId] ?? { done: false }
    updateProject(id, {
      steps: {
        ...ps.steps,
        [stream]: {
          ...ps.steps[stream],
          [stepId]: {
            ...existing,
            done,
            // Stamp BOTH date fields with the CURRENT date/time every time a step
            // is checked off, and CLEAR them when it's unchecked.
            //   date   → friendly string shown next to the step in the UI
            //   doneAt → exact machine timestamp the stale-status math reads
            //
            // Why fresh-every-time instead of "keep the first date"? The old code
            // did `existing.date ?? …`, which meant a step never lost its very
            // first date — so an item checked on 6/30, unchecked, then re-checked
            // on 7/2 still showed 6/30. The date should reflect when you ACTUALLY
            // checked it. (This mirrors setModelTakeoff, which already stamps a
            // fresh date on done and drops it on undone. Clearing is safe: both
            // the UI and staleness.ts only read these fields when `done` is true.)
            date: done ? new Date().toLocaleDateString() : undefined,
            doneAt: done ? new Date().toISOString() : undefined,
          },
        },
      },
    })
  }

  /**
   * Batch Apply's "✓ Mark applied": check the electric 'verify' + 'submit'
   * steps in ONE state update. (Two toggleStep calls would clobber each other —
   * each reads the same pre-update state; same lesson as addOrder.)
   */
  function markApplied(id: number) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      const stamp = (ex: StepState | undefined): StepState => ({
        ...ex,
        done: true,
        // "Mark applied" means you applied JUST NOW, so stamp today's date fresh
        // rather than preserving any earlier date (same fix as toggleStep above).
        date: new Date().toLocaleDateString(),
        doneAt: new Date().toISOString(),
      })
      const electric = {
        ...cur.steps.electric,
        verify: stamp(cur.steps.electric.verify),
        submit: stamp(cur.steps.electric.submit),
      }
      return {
        ...prev,
        projects: { ...prev.projects, [id]: { ...cur, steps: { ...cur.steps, electric } } },
      }
    })
  }

  /**
   * 🗺️ The Territory-check button's "Set SECO/DUKE + mark verified": write the
   * looked-up utility AND check the electric 'verify' step in ONE state update
   * (two separate setField + toggleStep calls would clobber each other — same
   * lesson as markApplied above). The step note records WHERE the answer came
   * from ("County GIS · Duke Energy · 7/14/2026") so a verified utility is
   * never a mystery later.
   */
  function applyVerifiedUtility(id: number, code: Utility, providerName: string) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      const electric = {
        ...cur.steps.electric,
        verify: {
          ...cur.steps.electric.verify,
          done: true,
          date: new Date().toLocaleDateString(),
          doneAt: new Date().toISOString(),
          note: `County GIS · ${providerName} · ${new Date().toLocaleDateString()}`,
        },
      }
      return {
        ...prev,
        projects: {
          ...prev.projects,
          [id]: { ...cur, electricCo: code, steps: { ...cur.steps, electric } },
        },
      }
    })
  }

  /**
   * ⏩ "Catch up": mark several EARLIER checklist steps done — or undo exactly
   * that — in ONE state update. This is the writer behind the catch-up row on
   * checklists (Checklist.tsx); WHICH steps qualify is decided by the pure
   * lib/catchup.ts brain, not here.
   *
   * Why it exists: many houses predate the app — the real-world work happened
   * but the boxes were never ticked, so "next action" and staleness overstate
   * the remaining work. Caught-up steps get the '(caught up)' sentinel as
   * their display date and NO doneAt: we know the work is behind us, not WHEN
   * it happened, so the stale-status math must not start timing from today
   * (same honesty rule as the '(county)'/'(inferred)' markers).
   *
   * done=false is the UNDO: uncheck those same steps again, clearing the
   * sentinel but keeping any notes — the same clearing rule as toggleStep.
   *
   * One setState for the whole batch, per the one-setState rule — a loop of
   * toggleStep calls would clobber itself (same lesson as markApplied above).
   */
  function catchUpSteps(id: number, stream: Stream, stepIds: string[], done: boolean) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      const bucket = { ...cur.steps[stream] }
      for (const stepId of stepIds) {
        const existing: StepState = bucket[stepId] ?? { done: false }
        bucket[stepId] = {
          ...existing,
          done,
          date: done ? CAUGHT_UP_DATE : undefined,
          doneAt: undefined, // never a machine timestamp — see the doc comment
        }
      }
      return {
        ...prev,
        projects: {
          ...prev.projects,
          [id]: { ...cur, steps: { ...cur.steps, [stream]: bucket } },
        },
      }
    })
  }

  /**
   * ✓/✗ ONE step of the CLOSING checklist (the sale workflow — its own bucket,
   * ProjectState.closingSteps, not a stream). One special case: the 'xfer'
   * step ("account transferred / shut off") is NOT stored in the bucket — it
   * writes ps.transferred instead, because that's the field the shut-off
   * deadline math (lib/shutoff.ts) has always read. One source of truth.
   */
  function setClosingStep(id: number, stepId: string, done: boolean) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      if (stepId === 'xfer') {
        return { ...prev, projects: { ...prev.projects, [id]: { ...cur, transferred: done } } }
      }
      const existing: StepState = cur.closingSteps?.[stepId] ?? { done: false }
      const closingSteps = {
        ...(cur.closingSteps ?? {}),
        [stepId]: {
          ...existing,
          done,
          // Same stamping rule as toggleStep: fresh date both ways on check,
          // cleared on uncheck (see that function's comment for the why).
          date: done ? new Date().toLocaleDateString() : undefined,
          doneAt: done ? new Date().toISOString() : undefined,
        },
      }
      return { ...prev, projects: { ...prev.projects, [id]: { ...cur, closingSteps } } }
    })
  }

  /** Save the small note attached to ONE checklist step. */
  function setStepNote(id: number, stream: Stream, stepId: string, note: string) {
    const ps = getProjectState(id)
    const existing: StepState = ps.steps[stream][stepId] ?? { done: false }
    updateProject(id, {
      steps: {
        ...ps.steps,
        [stream]: { ...ps.steps[stream], [stepId]: { ...existing, note } },
      },
    })
  }

  /** Save the free-text note for one stream of one project. */
  function setNote(id: number, stream: Stream, text: string) {
    const ps = getProjectState(id)
    updateProject(id, { notes: { ...ps.notes, [stream]: text } })
  }

  /**
   * Set a top-level field like engineer / waterSource / closingDate.
   * (Pick<...> = "only the editable fields of ProjectState", so a typo'd
   * field name is a compile error.)
   */
  function setField<K extends keyof ProjectState>(id: number, field: K, value: ProjectState[K]) {
    updateProject(id, { [field]: value } as Partial<ProjectState>)
  }

  /**
   * Add a new house to the roster. We assign the next free id (highest
   * existing + 1) and return it so App can select the new project.
   */
  function addProject(facts: Omit<Project, 'id' | 'listStatus'>): number {
    const newId = Math.max(0, ...state.roster.map((p) => p.id)) + 1
    setState((prev) => ({
      ...prev,
      roster: [...prev.roster, { ...facts, id: newId, listStatus: 'NotApplied' }],
    }))
    return newId
  }

  /** Edit a project's CORE FACTS (the roster fields: address, model, parcel,
   *  permit, subdivision, city/zip, WO#, status…). These start as a copy of
   *  data/projects.ts but the saved roster is the source of truth, so edits
   *  persist — e.g. a "TBD" address that now has a real house number.
   *
   *  The real work is the pure `applyFactsPatch` (lib/projectFacts.ts): it
   *  trims strings, ignores a patch that changes nothing, and — the subtle
   *  part — re-derives the permit CHECKLIST when the permit # changes (the
   *  permit # keys the county-portal/SharePoint links and the inferred
   *  steps), unless you've hand-toggled steps. ONE setState, per the rule. */
  function updateProjectFacts(id: number, patch: Partial<Project>) {
    setState((prev) => applyFactsPatch(prev, id, patch))
  }

  /** Remove a project AND all its saved progress. */
  function deleteProject(id: number) {
    setState((prev) => {
      const projects = { ...prev.projects }
      delete projects[id]
      return { ...prev, roster: prev.roster.filter((p) => p.id !== id), projects }
    })
  }

  /**
   * Upload one or more REAL files to a project's locker (Supabase Storage),
   * then save their pointers in state. Uploads run one at a time; each pointer
   * is appended as it lands — and we append INSIDE setState(prev => …) so a
   * burst of files can't clobber each other (same lesson as addOrder). Returns
   * how many succeeded plus the names of any that failed, so the UI can report.
   */
  async function addProjectFiles(
    id: number,
    files: File[],
  ): Promise<{ ok: number; failed: string[] }> {
    const failed: string[] = []
    let ok = 0
    for (const file of files) {
      try {
        const doc = await uploadProjectFile(id, file)
        setState((prev) => {
          const cur = prev.projects[id] ?? emptyProjectState()
          return {
            ...prev,
            projects: { ...prev.projects, [id]: { ...cur, docs: [...(cur.docs ?? []), doc] } },
          }
        })
        ok++
      } catch (e) {
        console.warn('[files] upload failed:', file.name, e)
        failed.push(file.name)
      }
    }
    return { ok, failed }
  }

  /** Remove a file: drop its pointer from state, then delete the bytes. */
  async function removeProjectFile(id: number, index: number) {
    const doc = (state.projects[id]?.docs ?? [])[index]
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      return {
        ...prev,
        projects: {
          ...prev.projects,
          [id]: { ...cur, docs: (cur.docs ?? []).filter((_, i) => i !== index) },
        },
      }
    })
    // Legacy name-only entries have no `path` — nothing to delete in storage.
    if (doc?.path) {
      try {
        await deleteProjectFile(doc.path)
      } catch (e) {
        console.warn('[files] storage delete failed (pointer already removed):', e)
      }
    }
  }

  /**
   * Add a material order to a project (status starts toOrder).
   *
   * NOTE: this appends INSIDE the state updater (reading `prev`), not from a
   * value captured outside. That matters because Quick-Add adds several orders
   * in a row — if we computed the new list from the closure's `state`, each
   * call would read the same stale value and the last one would win, dropping
   * the earlier orders. Reading `prev` makes rapid successive adds stack up.
   */
  function addOrder(id: number, order: Omit<OrderItem, 'id' | 'createdAt'>) {
    const newOrder: OrderItem = {
      ...order,
      id: crypto.randomUUID(),
      createdAt: new Date().toLocaleDateString(),
    }
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      // Auto-remember a brand-new material name so it joins the "＋ Add an
      // order" picker on every project from now on (the free-form category the
      // composer's "➕ Custom material…" option produces). "Already known" =
      // a built-in category, a site service, or one we've remembered before —
      // compared case-insensitively so "Windows"/"windows" don't double up.
      const known = new Set(
        [...ORDER_CATEGORIES, ...SITE_SERVICES, ...(prev.customOrderCategories ?? [])].map((c) =>
          c.toLowerCase(),
        ),
      )
      const name = newOrder.category.trim()
      const customOrderCategories =
        name && !known.has(name.toLowerCase())
          ? [...(prev.customOrderCategories ?? []), name]
          : prev.customOrderCategories
      return {
        ...prev,
        customOrderCategories,
        projects: { ...prev.projects, [id]: { ...cur, orders: [...(cur.orders ?? []), newOrder] } },
      }
    })
  }

  /**
   * Seed a project's Materials list with its model's STANDARD categories
   * (data/orders.ts standardOrdersFor) — the one-click "start the list" button
   * on an empty Materials tab. Every seeded line starts at 'toOrder'.
   *
   * ONE setState for the whole batch (not addOrder in a loop — each loop call
   * would read the same stale closure state and only the last survives; the
   * same lesson as addOrder's note above). Duplicate-guarded: a category the
   * project ALREADY has is skipped, so pressing the button twice — or seeding
   * after Josh's text-scan already added Trusses — never doubles a line.
   */
  function seedStandardOrders(id: number) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      // The project's model comes from the saved roster (source of truth for
      // added houses too), normalized to its key: "Model F-LH" → 'F'.
      const model = prev.roster.find((p) => p.id === id)?.model ?? ''
      const have = new Set((cur.orders ?? []).map((o) => o.category))
      const toAdd = standardOrdersFor(modelKey(model)).filter((c) => !have.has(c))
      if (toAdd.length === 0) return prev // nothing new — don't churn a save
      const seeded: OrderItem[] = toAdd.map((category) => ({
        id: crypto.randomUUID(),
        category,
        status: 'toOrder',
        createdAt: new Date().toLocaleDateString(),
      }))
      return {
        ...prev,
        projects: { ...prev.projects, [id]: { ...cur, orders: [...(cur.orders ?? []), ...seeded] } },
      }
    })
  }

  /** Patch one order (e.g. advance its status, set vendor/note). */
  function updateOrder(id: number, orderId: string, patch: Partial<OrderItem>) {
    const ps = getProjectState(id)
    updateProject(id, {
      orders: (ps.orders ?? []).map((o) => (o.id === orderId ? { ...o, ...patch } : o)),
    })
  }

  /** Remove an order from a project. */
  function removeOrder(id: number, orderId: string) {
    const ps = getProjectState(id)
    updateProject(id, { orders: (ps.orders ?? []).filter((o) => o.id !== orderId) })
  }

  /* --------------------------- SELECTIONS --------------------------- */
  /* The homeowner's design-finish choices for one house (paint, flooring,
     tile, fixtures, exterior colors…), an "additional requests" note, and a
     sign-off lock. Each updater is ONE setState(prev => …) so two edits made in
     the same action can't clobber each other (same lesson as addOrder). */

  /** Record ONE category's choice (an option pick and/or a write-in). Pass an
   *  empty choice ({}) to clear it. `area` is 'interior' or 'exterior'. */
  function setSelection(
    id: number,
    area: 'interior' | 'exterior',
    categoryId: string,
    choice: SelectionChoice,
  ) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      const sel = cur.selections ?? defaultSelections()
      return {
        ...prev,
        projects: {
          ...prev.projects,
          [id]: { ...cur, selections: { ...sel, [area]: { ...sel[area], [categoryId]: choice } } },
        },
      }
    })
  }

  /** Save the free-text "Additional Requests" box. */
  function setAdditionalRequests(id: number, text: string) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      const sel = cur.selections ?? defaultSelections()
      return {
        ...prev,
        projects: {
          ...prev.projects,
          [id]: { ...cur, selections: { ...sel, additionalRequests: text } },
        },
      }
    })
  }

  /** Lock the selections: stamp the client's signature, printed name, and the
   *  exact moment signed. The Selections tab goes read-only until unlocked. */
  function lockSelections(id: number, signature: string, printedName: string) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      const sel = cur.selections ?? defaultSelections()
      return {
        ...prev,
        projects: {
          ...prev.projects,
          [id]: {
            ...cur,
            selections: {
              ...sel,
              lock: { locked: true, signature, printedName, lockedAt: new Date().toISOString() },
            },
          },
        },
      }
    })
  }

  /** Unlock (admin) — reopen selections for editing. Keeps the old signature/
   *  date so re-locking can show the history; just flips `locked` off. */
  function unlockSelections(id: number) {
    setState((prev) => {
      const cur = prev.projects[id] ?? emptyProjectState()
      const sel = cur.selections ?? defaultSelections()
      return {
        ...prev,
        projects: {
          ...prev.projects,
          [id]: { ...cur, selections: { ...sel, lock: { ...sel.lock, locked: false } } },
        },
      }
    })
  }

  /** Mark one takeoff gathered (or not) for a house MODEL — shared across all
   *  projects of that model. */
  /** Upload plan files into a MODEL's library (📐 Models tab). Mirrors
   *  addProjectFiles: bytes to storage first, then the pointer into state. */
  async function addModelFiles(
    modelK: string,
    files: File[],
  ): Promise<{ ok: number; failed: string[] }> {
    const failed: string[] = []
    let ok = 0
    for (const file of files) {
      try {
        const doc = await uploadModelFile(modelK, file)
        setState((prev) => {
          const cur = prev.models?.[modelK] ?? {}
          return {
            ...prev,
            models: { ...prev.models, [modelK]: { ...cur, docs: [...(cur.docs ?? []), doc] } },
          }
        })
        ok++
      } catch (e) {
        console.warn('[models] upload failed:', file.name, e)
        failed.push(file.name)
      }
    }
    return { ok, failed }
  }

  /** Remove a model plan file: pointer first, then the bytes. */
  async function removeModelFile(modelK: string, index: number) {
    const doc = (state.models?.[modelK]?.docs ?? [])[index]
    setState((prev) => {
      const cur = prev.models?.[modelK] ?? {}
      return {
        ...prev,
        models: {
          ...prev.models,
          [modelK]: { ...cur, docs: (cur.docs ?? []).filter((_, i) => i !== index) },
        },
      }
    })
    if (doc?.path) {
      try {
        await deleteProjectFile(doc.path)
      } catch (e) {
        console.warn('[models] storage delete failed (pointer already removed):', e)
      }
    }
  }

  /** Patch a model's editable facts (master-filed, notes) — ONE setState. */
  function setModelInfo(modelK: string, patch: Partial<import('../types').ModelState>) {
    setState((prev) => ({
      ...prev,
      models: { ...prev.models, [modelK]: { ...(prev.models?.[modelK] ?? {}), ...patch } },
    }))
  }

  function setModelTakeoff(modelK: string, takeoffId: string, done: boolean) {
    setState((prev) => {
      const all = { ...(prev.modelTakeoffs ?? {}) }
      const cur = { ...(all[modelK] ?? {}) }
      cur[takeoffId] = done ? { done: true, date: new Date().toLocaleDateString() } : { done: false }
      all[modelK] = cur
      return { ...prev, modelTakeoffs: all }
    })
  }

  /** Save a model's material order list for one category (the takeoff contents). */
  function setModelOrderList(modelK: string, category: string, text: string) {
    setState((prev) => {
      const all = { ...(prev.modelOrderLists ?? {}) }
      const cur = { ...(all[modelK] ?? {}) }
      if (text.trim()) cur[category] = text
      else delete cur[category]
      all[modelK] = cur
      return { ...prev, modelOrderLists: all }
    })
  }

  /**
   * Edit one workflow template's wording (⚙️ Settings → Templates).
   * Pass null to RESET it back to the built-in default.
   */
  function setTemplate(id: string, patch: Partial<TemplateOverride> | null) {
    setState((prev) => {
      const templates = { ...(prev.templates ?? {}) }
      if (patch === null) delete templates[id]
      else templates[id] = { ...templates[id], ...patch }
      return { ...prev, templates }
    })
  }

  /** Replace the editable team list (names you can assign tasks to). */
  function setAssignees(names: string[]) {
    setState((prev) => ({ ...prev, assignees: names }))
  }

  /** The 🏠 Today "Scan now" button: stamp a scan REQUEST into the blob. The
   *  office Mac's watcher (scanner/watch-scan-request.mjs, launchd every
   *  2 min) sees a request newer than the last completed scan and runs
   *  scan.mjs --write; that run's completion stamp (lastScanAt) clears the
   *  pending state on every device via realtime sync. Requests older than
   *  30 min are ignored by BOTH sides (Mac was off — press again). */
  function requestScan() {
    setState((prev) => ({
      ...prev,
      scanMeta: { ...prev.scanMeta, requestedAt: new Date().toISOString() },
    }))
  }

  /** Replace the whole Selections catalog (Settings → Selections setup). The
   *  editor holds a working copy and saves it here in one shot. */
  function setSelectionsCatalog(catalog: SelectionsCatalog) {
    setState((prev) => ({ ...prev, selectionsCatalog: catalog }))
  }

  /** Replace the whole Vendors directory (Settings → Vendor setup). Same
   *  working-copy-then-save-in-one-shot shape as the Selections catalog. */
  function setVendors(vendors: Vendor[]) {
    setState((prev) => ({ ...prev, vendors }))
  }

  /** Replace the whole extra-utilities roster (Settings → Utility companies
   *  setup). Same working-copy-then-save-in-one-shot shape as setVendors. */
  function setUtilities(utilities: UtilityCompany[]) {
    setState((prev) => ({ ...prev, utilities }))
  }

  /**
   * Replace the owner's custom material list (🛠 Settings → Custom materials:
   * add/remove). Built-in categories live in data/orders.ts and are NOT stored
   * here — this holds only the names you've added yourself, which show up in
   * every project's order picker under "Your materials".
   */
  function setCustomOrderCategories(list: string[]) {
    setState((prev) => ({ ...prev, customOrderCategories: list }))
  }

  /**
   * Rename a custom material EVERYWHERE in one shot: the saved list AND every
   * order (across all projects) already placed under the old name — so fixing a
   * typo fixes the orders too. ONE setState because it touches two fields at
   * once; two separate updaters would each read the same stale closure state
   * and clobber each other (the addOrder lesson). No-ops on an empty/unchanged
   * name; de-dupes the list case-insensitively so a rename can't create twins.
   */
  function renameCustomCategory(oldName: string, newName: string) {
    const from = oldName.trim()
    const to = newName.trim()
    if (!from || !to || from === to) return
    setState((prev) => {
      const seen = new Set<string>()
      const list = (prev.customOrderCategories ?? [])
        .map((c) => (c === from ? to : c))
        .filter((c) => {
          const k = c.toLowerCase()
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
      const projects = Object.fromEntries(
        Object.entries(prev.projects).map(([id, ps]) => [
          id,
          ps.orders
            ? { ...ps, orders: ps.orders.map((o) => (o.category === from ? { ...o, category: to } : o)) }
            : ps,
        ]),
      ) as typeof prev.projects
      return { ...prev, customOrderCategories: list, projects }
    })
  }

  /** Dismiss a permit portal notification — kept in history, just marked read. */
  function dismissNotification(id: number, sourceKey: string) {
    const ps = getProjectState(id)
    updateProject(id, {
      notifications: (ps.notifications ?? []).map((n) =>
        n.sourceKey === sourceKey ? { ...n, dismissed: true } : n,
      ),
    })
  }

  /** Dismiss a flagged inspection result — exactly analogous to dismissNotification.
   *  We TOMBSTONE (set dismissed:true) rather than delete, because the nightly
   *  scanner re-reconciles inspections by sourceKey: a hard delete would just be
   *  re-added on the next run, but a dismissed:true row is preserved (the scanner
   *  only refreshes desc/status/date on an existing key). The UI filters out
   *  dismissed:true rows so a dismissed result disappears from both the Permit
   *  tab and the cross-project 🔍 feed. */
  function dismissInspection(id: number, sourceKey: string) {
    const ps = getProjectState(id)
    updateProject(id, {
      inspections: (ps.inspections ?? []).map((i) =>
        i.sourceKey === sourceKey ? { ...i, dismissed: true } : i,
      ),
    })
  }

  /* ----------------------------- TASKS ------------------------------ */
  /* Free-form cross-role tasks (IT / office / supplies / …) live at the TOP
     level of state — they aren't tied to any one project. Each updater reads
     `prev` inside setState so rapid successive adds can't clobber each other
     (same lesson as addOrder above). */

  /** Capture a new task (starts not-done). */
  function addTask(t: Omit<Task, 'id' | 'createdAt' | 'done' | 'doneAt'>) {
    const newTask: Task = { ...t, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setState((prev) => ({ ...prev, tasks: [...(prev.tasks ?? []), newTask] }))
  }

  /** Patch one task — mark done, toggle the ⭐ focus, edit any field. */
  function updateTask(id: string, patch: Partial<Task>) {
    setState((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }

  /** Delete a task for good. */
  function removeTask(id: string) {
    setState((prev) => ({ ...prev, tasks: (prev.tasks ?? []).filter((t) => t.id !== id) }))
  }

  /** Replace EVERYTHING with an imported state (the Import button). */
  function replaceState(next: WorkbenchState) {
    setState(migrate(next)) // migrate: older export files have no roster/permit
  }

  /** Save the GLOBAL step list for one stream-variant key (from the step editor).
   *  Applies to every house; `applyStepOverrides` in App re-syncs the resolver. */
  function setStepList(key: string, steps: { id: string; label: string; wmOnly?: boolean }[]) {
    setState((prev) => ({ ...prev, stepOverrides: { ...(prev.stepOverrides ?? {}), [key]: steps } }))
  }

  /** Drop a custom step list → fall back to the built-in default. */
  function resetStepList(key: string) {
    setState((prev) => {
      const next = { ...(prev.stepOverrides ?? {}) }
      delete next[key]
      return { ...prev, stepOverrides: next }
    })
  }

  // Whatever we return here is what components receive from useProjects().
  return {
    state,
    getProjectState,
    toggleStep,
    markApplied,
    applyVerifiedUtility,
    catchUpSteps,
    setClosingStep,
    setStepNote,
    setNote,
    setField,
    addProject,
    updateProjectFacts,
    deleteProject,
    addProjectFiles,
    removeProjectFile,
    dismissNotification,
    dismissInspection,
    setTemplate,
    setAssignees,
    requestScan,
    setSelectionsCatalog,
    setVendors,
    setUtilities,
    setCustomOrderCategories,
    renameCustomCategory,
    setModelTakeoff,
    setModelOrderList,
    addModelFiles,
    removeModelFile,
    setModelInfo,
    addOrder,
    seedStandardOrders,
    updateOrder,
    removeOrder,
    setSelection,
    setAdditionalRequests,
    lockSelections,
    unlockSelections,
    addTask,
    updateTask,
    removeTask,
    setStepList,
    resetStepList,
    replaceState,
    saveState,
    saveNow,
  }
}
