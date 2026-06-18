/**
 * thresholds.ts — how long is "too long" at a stage, in days.
 *
 * Pure configuration, the same spirit as lifecycles.ts. The stale-status math
 * (lib/staleness.ts) asks: "how many days has this project sat waiting on its
 * current step?" If that exceeds the threshold for that step, the Today
 * command center flags it as having gone quiet.
 *
 * The numbers are deliberately generous — utility and permit timelines run in
 * weeks, not days, and a flag that cries wolf gets ignored. Tune freely: change
 * a number here and every project re-evaluates the next time the app loads.
 */
import type { Stream } from '../types'

/** Used for any step that doesn't have a specific override below. */
export const DEFAULT_STALE_DAYS = 14

/**
 * Per-step overrides, keyed by stream then step id. Use a BIGGER number for
 * steps that are slow by nature (waiting on a utility engineer, a county
 * review) so they don't nag — or a smaller one for steps you want to chase
 * aggressively. Anything not listed falls back to DEFAULT_STALE_DAYS.
 */
export const STALE_OVERRIDES: Partial<Record<Stream, Record<string, number>>> = {
  electric: {
    engineer: 30, // utilities can take a month to assign / contact an engineer
    fieldsched: 21, // field scheduling tends to drag
    meternotify: 7, // photos are on US — chase quickly once the home green-tags
    meter: 21, // awaiting the meter set / county inspection
  },
  water: {
    cwmbuilt: 45, // building a water-main extension is a long pole
    wdrilled: 30, // getting a driller out
  },
  septic: {
    sissued: 30, // DEP construction-permit issuance
    sapproved: 21, // final inspection / DEP approval
  },
  permit: {
    review: 30, // county review routinely runs 3–4+ weeks
    approved: 14,
  },
}

/** The "stale after N days" threshold for a given stream + step. */
export function staleThreshold(stream: Stream, stepId: string): number {
  return STALE_OVERRIDES[stream]?.[stepId] ?? DEFAULT_STALE_DAYS
}
