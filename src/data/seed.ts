/**
 * seed.ts — builds the STARTING progress state, migrated from the original
 * HTML workbench. This runs exactly once: the first time the app opens in a
 * browser with no saved data. After that, localStorage is the source of
 * truth and this file is never consulted again.
 *
 * Three sources of "already done" information, same as the old tool:
 *   1. The list status (Applied / Scheduled / MeterSet / ...) implies which
 *      electric steps are complete.
 *   2. Water: "WI" in the old list meant the well was already drilled, and a
 *      few city-water projects had progress recorded from MCU emails.
 *   3. Septic: DEP permit progress recorded from email correspondence.
 */
import type { ProjectState, WorkbenchState } from '../types'
import { PROJECTS, WELL_INSTALLED } from './projects'

/** A blank slate for one project — no steps done, no notes. */
export function emptyProjectState(): ProjectState {
  return {
    steps: { electric: {}, water: {}, septic: {} },
    notes: { electric: '', water: '', septic: '' },
  }
}

/* ------------------------------------------------------------------ */
/* 1. ELECTRIC — list status → which steps are already complete        */
/* ------------------------------------------------------------------ */
const ELECTRIC_STATUS_STEPS: Record<string, string[]> = {
  Applied: ['verify', 'submit'],
  InProgress: ['verify', 'submit'],
  Scheduled: ['verify', 'submit', 'deposit', 'engineer', 'rough', 'fieldsched'],
  MeterSet: ['verify', 'submit', 'deposit', 'engineer', 'rough', 'fieldsched', 'fielddone', 'meter'],
  PowerOn: ['verify', 'submit', 'deposit', 'engineer', 'rough', 'fieldsched', 'fielddone', 'meter', 'power'],
  // NotApplied → nothing done
}

/* ------------------------------------------------------------------ */
/* 2. WATER — progress + notes from MCU email correspondence           */
/* ------------------------------------------------------------------ */
const WATER_SEED: Record<number, { done: string[]; note: string }> = {
  19: {
    done: ['cavail', 'capply', 'ctap', 'cconn'],
    note: 'CONNECTED — MCU acct 060163, meter set 10/15/2025 (Claribel Martinez, MCU).',
  },
  31: {
    done: ['cavail', 'capply'],
    note: 'Application in. MCU (Dawn Cook) 4/13/26: come in with paperwork & pay capacity + meter charges to schedule meter set.',
  },
  32: {
    done: ['cavail', 'capply'],
    note: 'Invoice issued 2/17/26 (in the permit Files/Attachments). Pay it to release the permit hold and set the meter (Carrie Hyde, MCU).',
  },
  17: {
    done: ['cavail'],
    note: 'WME-134 owner/initiating lot (parcel 8005-0809-13, permit 2025070381). Public water REQUIRED — no well. Open MCU water account (Service Agreement in owner name); build the line extension to the next lot line; DEP clearance needed before meter; do NOT pour driveway first. Contact Carrie Hyde 352-307-6168.',
  },
  18: {
    done: ['cavail'],
    note: 'WME-134 owner/initiating lot (parcel 8005-0809-13, permit 2025082311). Public water REQUIRED — no well. Open MCU water account; build line extension; DEP clearance before meter. Contact Carrie Hyde 352-307-6168.',
  },
  49: {
    done: ['cavail'],
    note: 'WME-145-O assigned (8895 SW 135th Pl, parcel 8012-1441-08, permit BLDR-26-03-10135). MCU invoice not created until the water-main extension is applied for + project# assigned + permit site plan cleared (Carrie Hyde, MCU).',
  },
}

/* ------------------------------------------------------------------ */
/* 3. SEPTIC — DEP permit progress from email correspondence           */
/* ------------------------------------------------------------------ */
const SEPTIC_SEED: Record<number, { done: string[]; note: string }> = {
  35: {
    done: ['seval', 'sapplied', 'sissued'],
    note: 'DEP septic permit issued; submitted to County for BLDR-26-02-06340 (7540 SW 121st Ter). County rejected once for wrong street address — confirm corrected version accepted.',
  },
  48: {
    done: ['seval', 'sapplied', 'sissued'],
    note: 'DEP septic permit issued; submitted to County for BLDR-26-03-10140 (12817 SW 91st Lane). County required applicant = property owner (Mr. Ocala Buys Houses LLC) — confirm corrected version accepted.',
  },
  49: {
    done: ['seval', 'sapplied', 'sissued', 'scounty'],
    note: 'DEP septic permit issued & submitted to County for BLDR-26-03-10135 (8895 SW 135th Pl), 4/14/26.',
  },
  50: {
    done: ['seval', 'sapplied', 'sissued', 'scounty'],
    note: 'DEP septic permit issued & submitted to County for BLDR-26-04-10839 (21661 SW Marine Blvd), 4/10/26.',
  },
}

/** Build the full initial WorkbenchState for a fresh browser. */
export function buildInitialState(): WorkbenchState {
  const projects: Record<number, ProjectState> = {}

  for (const p of PROJECTS) {
    const ps = emptyProjectState()

    // 1. electric steps implied by the old list status
    for (const stepId of ELECTRIC_STATUS_STEPS[p.listStatus] ?? []) {
      ps.steps.electric[stepId] = { done: true, date: '(from list)' }
    }

    // 2. water: well already drilled ("WI" in the old list)
    if (WELL_INSTALLED.includes(p.id)) {
      ps.steps.water['wdrilled'] = { done: true, date: '(from list)' }
    }
    const w = WATER_SEED[p.id]
    if (w) {
      for (const stepId of w.done) {
        ps.steps.water[stepId] = { done: true, date: '(from email)' }
      }
      ps.notes.water = w.note
    }

    // 3. septic progress from emails
    const s = SEPTIC_SEED[p.id]
    if (s) {
      for (const stepId of s.done) {
        ps.steps.septic[stepId] = { done: true, date: '(from email)' }
      }
      ps.notes.septic = s.note
    }

    projects[p.id] = ps
  }

  // The roster starts as a copy of the built-in list; from here on the
  // saved state owns it (so the Add-project form can grow it).
  return { roster: PROJECTS, projects }
}
