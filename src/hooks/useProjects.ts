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
  StepState,
  Stream,
  Task,
  TemplateOverride,
  WorkbenchState,
} from '../types'
import { buildInitialState, emptyProjectState, inferPermitSteps, seedStateFor } from '../data/seed'
import { PROJECTS } from '../data/projects'
import { supabase } from '../lib/supabase'
import { deleteProjectFile, uploadProjectFile } from '../lib/files'

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
  // Older saves predate material orders — ensure it's an array.
  const orders = Array.isArray(ps.orders) ? ps.orders : []
  // Files: a project-level list now. Older saves kept names under `permitDocs`
  // — fold those in once (they're legacy name-only entries with no real file).
  const docs = Array.isArray(ps.docs)
    ? ps.docs
    : Array.isArray(ps.permitDocs)
      ? ps.permitDocs
      : []
  return { ...ps, steps, notes, orders, docs }
}

/**
 * MIGRATION: upgrade older saved data to the current shape.
 *  - Saves from before the Add-project feature have no `roster` — patch one in.
 *  - Saves from before the Permitting tab lack the `permit` stream — normalize
 *    every project so all four streams exist.
 * (Every app that stores data needs a story for "what about data saved by an
 * older version?" — this is ours.)
 */
function migrate(parsed: Partial<WorkbenchState>): WorkbenchState {
  const roster = Array.isArray(parsed.roster) ? parsed.roster : PROJECTS
  // permit number per project id, so we can backfill permit status below
  const permitById = new Map(roster.map((p) => [p.id, p.permit]))

  const projects: Record<number, ProjectState> = {}
  for (const [id, ps] of Object.entries(parsed.projects ?? {})) {
    const norm = normalize(ps as ProjectState)
    // Permit checklist follows the county portal (via inferPermitSteps), so
    // re-derive it on load — UNLESS you've manually toggled a step. We treat a
    // step as manual when its date is a real date, not our '(inferred)' /
    // '(county)' marker. That keeps your edits while staying in sync with the
    // portal data we captured.
    const manual = Object.values(norm.steps.permit).some(
      (s) => s.date && s.date !== '(inferred)' && s.date !== '(county)',
    )
    if (!manual) norm.steps.permit = inferPermitSteps(permitById.get(Number(id)) ?? '')
    projects[Number(id)] = norm
  }
  // Tasks arrived after the first releases — older saves won't have them.
  const result: WorkbenchState = {
    roster: [...roster],
    projects,
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    extrasSeeded: parsed.extrasSeeded === true,
    templates: parsed.templates ?? {},
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
  const lastPushed = useRef<string | null>(null) // JSON we last sent up (to ignore our own realtime echo)

  // 1) On first mount, reconcile with the cloud. If the cloud has data, it
  //    WINS (it's the shared source of truth across your devices). If it's
  //    empty, seed it from this browser. No cloud (no keys / offline) → we
  //    just keep running on localStorage.
  useEffect(() => {
    if (!supabase) {
      cloudReady.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('workbench')
          .select('data')
          .eq('id', 'main')
          .maybeSingle()
        if (cancelled) return
        if (error) throw error
        if (data?.data) {
          const cloudData = data.data as Partial<WorkbenchState>
          lastPushed.current = JSON.stringify(cloudData)
          // Normally a cloud load shouldn't echo back as a write. EXCEPTION:
          // if the cloud copy predates the C.O./Hold homes, migrate() merges
          // them in now and we WANT that written back — so don't skip the save.
          if (cloudData.extrasSeeded) skipNextSave.current = true
          // Mark ready BEFORE setState so, when a merge IS needed, the save
          // effect that setState triggers actually fires (it gates on this).
          cloudReady.current = true
          setState(migrate(cloudData))
        } else {
          // Cloud is empty → seed it with whatever this browser currently has.
          lastPushed.current = JSON.stringify(state)
          await supabase
            .from('workbench')
            .upsert({ id: 'main', data: state, updated_at: new Date().toISOString() })
        }
      } catch (e) {
        console.warn('[workbench] cloud load failed — running on local data', e)
      } finally {
        if (!cancelled) cloudReady.current = true
      }
    })()
    return () => {
      cancelled = true
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
      return
    }
    const sb = supabase // capture the non-null client for the deferred callback
    const payload = JSON.stringify(state)
    const timer = setTimeout(() => {
      lastPushed.current = payload // remember what we sent, so its realtime echo is ignored
      sb
        .from('workbench')
        .upsert({ id: 'main', data: state, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.warn('[workbench] cloud save failed', error)
        })
    }, 600)
    return () => clearTimeout(timer)
  }, [state])

  // 3) Live-sync: when ANOTHER device writes, apply that change here in real time
  //    (Supabase Realtime). We ignore the echo of our own writes via lastPushed.
  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    const channel = sb
      .channel('workbench-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workbench', filter: 'id=eq.main' },
        (payload) => {
          const next = (payload.new as { data?: WorkbenchState } | null)?.data
          if (!next) return
          const incoming = JSON.stringify(next)
          if (incoming === lastPushed.current) return // our own write echoed back — ignore it
          lastPushed.current = incoming
          skipNextSave.current = true // remote change — apply it, don't bounce it back up
          setState(migrate(next as Partial<WorkbenchState>))
        },
      )
      .subscribe()
    return () => {
      sb.removeChannel(channel)
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
            // Stamp BOTH date fields the first time it's checked off, and keep
            // them if it's later unchecked (same behavior as before):
            //   date   → friendly string shown next to the step in the UI
            //   doneAt → exact machine timestamp the stale-status math reads
            date: done ? (existing.date ?? new Date().toLocaleDateString()) : existing.date,
            doneAt: done ? (existing.doneAt ?? new Date().toISOString()) : existing.doneAt,
          },
        },
      },
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
      return {
        ...prev,
        projects: { ...prev.projects, [id]: { ...cur, orders: [...(cur.orders ?? []), newOrder] } },
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

  /** Dismiss a permit portal notification — kept in history, just marked read. */
  function dismissNotification(id: number, sourceKey: string) {
    const ps = getProjectState(id)
    updateProject(id, {
      notifications: (ps.notifications ?? []).map((n) =>
        n.sourceKey === sourceKey ? { ...n, dismissed: true } : n,
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

  // Whatever we return here is what components receive from useProjects().
  return {
    state,
    getProjectState,
    toggleStep,
    setStepNote,
    setNote,
    setField,
    addProject,
    deleteProject,
    addProjectFiles,
    removeProjectFile,
    dismissNotification,
    setTemplate,
    addOrder,
    updateOrder,
    removeOrder,
    addTask,
    updateTask,
    removeTask,
    replaceState,
  }
}
