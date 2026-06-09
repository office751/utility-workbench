/**
 * models.ts — per-house-model specs for the electric load-form generator.
 *
 * `sqft` = heated / under-air LIVING area (NOT incl. garage / porch / lanai).
 * `tons` = A/C size.
 *
 * Provenance:
 *  - A, B, C, F, G, E2 — verified from floor plans during the original build.
 *  - D, Independence, Republic, Concord, Fire-House — read from the sealed plan
 *    sets (June 2026). D + Fire-House A/C tonnage is STATED on the plans'
 *    mechanical sheet (authoritative); Independence/Republic/Concord had no HVAC
 *    sheet, so tonnage was sized off the verified sqft→ton tiers
 *    (~≤1050 sqft → 2T, ~1300-1350 → 2.5T, ~1770 → 3T; ~1 ton per 550 sqft).
 *  - GRAY ZONES (a Manual-J would override): Republic (1472, sized 2.5 — could
 *    be 3) and Concord (1238, interpolated up to 2.5). D's 1282 sqft would tier
 *    to 2.5 but the sealed plan says 2T, so 2T stands.
 *
 * Edit freely — runtime overrides (via the load-form modal) layer on top.
 */
export interface ModelSpec {
  sqft: number | '' // heated/under-air living area; '' = unknown
  tons: number | '' // A/C tonnage; '' = unknown
  beds?: number
}

export const MODELS_DEFAULT: Record<string, ModelSpec> = {
  A: { sqft: 1039, tons: 2 },
  B: { sqft: 963, tons: 2 },
  C: { sqft: 1311, tons: 2.5 },
  D: { sqft: 1282, tons: 2, beds: 2 }, // 2 TON stated on Mechanical sheet M1
  E2: { sqft: 1772, tons: 3 },
  F: { sqft: 1334, tons: 2.5 },
  G: { sqft: 1013, tons: 2 },
  Independence: { sqft: 1737, tons: 3, beds: 3 }, // ≈ E2 size
  Republic: { sqft: 1472, tons: 2.5, beds: 3 }, // borderline 2.5↔3 — confirm
  Concord: { sqft: 1238, tons: 2.5, beds: 2 }, // interpolated — confirm
  'Fire-House': { sqft: 1560, tons: 2.5, beds: 3 }, // 2.5 TON stated on Mechanical sheet M1
}

/**
 * Standard electrical load shared across all models (from the original
 * Electric Applications Workbench packet). Used to pre-fill the load form.
 */
export const STANDARD_LOAD = {
  acUnits: 1,
  heatStrip: '8KW / 50A',
  waterHeater: '50 GAL electric',
  mainPanel: '200A',
  voltage: '120/240V 1ph',
  gas: false,
}
