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
import { useEffect, useState } from 'react'
import type { Project, ProjectDoc, ProjectState, StepState, Stream, WorkbenchState } from '../types'
import { buildInitialState, emptyProjectState, inferPermitSteps } from '../data/seed'
import { PROJECTS } from '../data/projects'

/** The key our data is filed under in the browser's localStorage. */
const STORAGE_KEY = 'isc_workbench_v1'

/** The streams every saved project must have step/note buckets for. */
const STREAMS: Stream[] = ['electric', 'water', 'septic', 'permit']

/**
 * Make sure one saved ProjectState has a bucket for every stream. Older saves
 * (made before the Permitting tab existed) have electric/water/septic but no
 * `permit` — without this, reading ps.steps.permit would crash. This is the
 * heart of a migration: gently upgrade old data to today's shape.
 */
function normalize(ps: ProjectState): ProjectState {
  const steps = { ...ps.steps } as ProjectState['steps']
  const notes = { ...ps.notes } as ProjectState['notes']
  for (const s of STREAMS) {
    if (!steps[s]) steps[s] = {}
    if (notes[s] == null) notes[s] = ''
  }
  return { ...ps, steps, notes }
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
    // One-time backfill: if a project's permit checklist was never touched
    // (e.g. this save predates the Permitting tab), infer its status from the
    // permit number — same guess a fresh install would make.
    if (Object.keys(norm.steps.permit).length === 0) {
      norm.steps.permit = inferPermitSteps(permitById.get(Number(id)) ?? '')
    }
    projects[Number(id)] = norm
  }
  return { roster, projects }
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

  // After every change, write the whole state back to localStorage.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state]) // "[state]" = re-run only when `state` changes

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
            // Stamp the date the first time it's checked off.
            date: done ? (existing.date ?? new Date().toLocaleDateString()) : existing.date,
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
      return { roster: prev.roster.filter((p) => p.id !== id), projects }
    })
  }

  /** Add one or more documents (by name) to a project's permit doc list. */
  function addDocuments(id: number, names: string[]) {
    const ps = getProjectState(id)
    const today = new Date().toLocaleDateString()
    const additions: ProjectDoc[] = names.map((name) => ({ name, addedAt: today }))
    updateProject(id, { permitDocs: [...(ps.permitDocs ?? []), ...additions] })
  }

  /** Remove the document at the given index from a project's doc list. */
  function removeDocument(id: number, index: number) {
    const ps = getProjectState(id)
    updateProject(id, { permitDocs: (ps.permitDocs ?? []).filter((_, i) => i !== index) })
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
    addDocuments,
    removeDocument,
    replaceState,
  }
}
