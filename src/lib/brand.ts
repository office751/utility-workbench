/**
 * brand.ts — the app's name shifts with the sky: Daystar by day, Lodestar by
 * night. (It's not just cute — the sun literally IS the "day star," and the
 * lodestar is the guiding star you steer by at night. Same idea, two faces.)
 *
 * Pure logic, no React (see hooks/useBrand.ts for the live-updating hook).
 * Day = 6:00am–5:59pm local; night otherwise. One knob, easy to retune.
 */
export interface Brand {
  /** 'Daystar' or 'Lodestar' */
  name: string
  /** ☀️ by day, ⭐ by night */
  icon: string
  isDay: boolean
}

/** Hour (local) when day begins / ends — tweak here to taste. */
const DAY_START = 6 // 6:00am
const DAY_END = 18 // 6:00pm

/** The brand for a given moment (defaults to now). */
export function brandFor(d: Date = new Date()): Brand {
  const h = d.getHours()
  const isDay = h >= DAY_START && h < DAY_END
  return isDay
    ? { name: 'Daystar', icon: '☀️', isDay: true }
    : { name: 'Lodestar', icon: '⭐', isDay: false }
}

/** The little hover note that explains the trick. */
export const BRAND_TOOLTIP = 'Daystar by day, Lodestar by night ✨'
