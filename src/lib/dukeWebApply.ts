/**
 * dukeWebApply.ts — the fill payload for Duke's web Builder Portal
 * (builderportal.duke-energy.app), where new-service applications are a
 * multi-page web form instead of an email.
 *
 * One canonical JSON object carries everything the form asks, computed from
 * the same sources as the Duke email packet (loadForm.ts): project facts,
 * the model's electrical spec (data/models.ts), the parcel legal description
 * (lot/block), and company contacts. The ⚡ button on a DUKE project's
 * Electric tab copies this JSON to the clipboard and opens the portal —
 * whatever fills the form (Claude driving the browser, or a fill bookmarklet)
 * reads the payload from the clipboard instead of re-deriving anything.
 *
 * Pure logic — no React, no DOM.
 */
import type { Project, ProjectState } from '../types'
import { COMPANY } from '../data/contacts'
import { legalFor } from '../data/legal'
import { specFor } from '../data/models'
import { directionsFromMainRoad } from './directions'
import { serviceTypeOf } from './nextAction'

export const DUKE_PORTAL_URL = 'https://builderportal.duke-energy.app'

/** Everything the Builder Portal's residential new-service form asks. */
export function dukeWebPayload(p: Project, ps: ProjectState) {
  const m = specFor(p.model)
  const legal = legalFor(p.parcel)
  const lot = legal.match(/Lots? ([0-9 &]+)/)?.[1]?.split('&')[0].trim() ?? ''
  const block = legal.match(/Blk (\d+)/)?.[1] ?? ''

  return {
    // The filler checks this marker before touching anything.
    kind: 'duke-builder-portal-fill',
    project: p.address,

    // ---- Project / site ----
    address: p.address,
    city: p.city,
    state: 'FL',
    zip: p.zip,
    county: 'Marion',
    parcel: p.parcel,
    subdivision: p.subdivision,
    lot,
    block,
    legalDescription: legal,
    permitNumber: p.permit,
    workOrder: p.workOrder,

    // ---- Structure ----
    structureType: 'Single Family',
    zoning: 'Residential',
    sqft: m.sqft || '',
    model: p.model,

    // ---- Load (mirrors the email packet's numbers) ----
    acUnits: 1,
    acTons: m.tons || '',
    acGas: false,
    heatStripUnits: 1,
    heatStripKw: 8,
    heatStripAmps: 50,
    waterHeaterUnits: 1,
    waterHeaterGallons: 50,
    waterHeaterGas: false,
    poolHeater: false,
    tankless: false,
    evCharger: false,
    mainAmps: 200,
    serviceEntrance: (serviceTypeOf(p, ps) || 'OH') === 'UG' ? 'Underground' : 'Overhead',

    // ---- People ----
    billingCompany: COMPANY.legalName,
    billingMailing: COMPANY.mailing,
    siteContactName: COMPANY.siteContact,
    siteContactPhone: COMPANY.phone,
    siteContactEmail: COMPANY.email,
    electrician: COMPANY.electrician,

    // ---- Portal questions with no per-project data (review at submit) ----
    ohLinesAdjacent: 'Unsure', // "OH lines attached to a Duke pole adjacent?"
  }
}

/**
 * The full payload, with real turn-by-turn DIRECTIONS from the nearest main
 * road (computed from OpenStreetMap — see directions.ts) plus the cross
 * street the route turns onto. Falls back to the lot/parcel description
 * when the map services come up empty — the form still gets filled, the
 * directions box just needs a human sentence.
 */
export async function dukeWebPayloadWithDirections(p: Project, ps: ProjectState) {
  const base = dukeWebPayload(p, ps)
  const fallback = `${base.legalDescription} — parcel ${p.parcel}${p.permit ? ` — permit ${p.permit}` : ''}`
  const route = await directionsFromMainRoad(p.address, p.city, p.zip)
  // route.text can be null (routing missed) even when route.firstStreet is set
  // (geocode worked) — so we keep the cross street and only fall back the
  // directions TEXT. That's what stops the portal stalling on a blank required
  // "Nearest Cross Street" field.
  const directions = route?.text
    ? `${route.text} (${base.legalDescription}, parcel ${p.parcel})`.slice(0, 300)
    : fallback
  const directionsSource = route?.text
    ? `computed from OSM via ${route.mainRoad}`
    : route?.firstStreet
      ? 'cross street from OSM; directions = lot/parcel (no route found)'
      : 'FALLBACK — lot/parcel only; write directions + cross street by hand'
  return {
    ...base,
    directions,
    crossStreet: route?.firstStreet ?? '',
    directionsSource,
  }
}

/** The clipboard form of the payload (pretty JSON — also human-readable as a
 *  cheat sheet if pasted anywhere). Use the async variant when you can wait
 *  the ~2s for real directions. */
export function dukeWebPayloadText(p: Project, ps: ProjectState): string {
  return JSON.stringify(dukeWebPayload(p, ps), null, 2)
}

export async function dukeWebPayloadTextWithDirections(p: Project, ps: ProjectState): Promise<string> {
  return JSON.stringify(await dukeWebPayloadWithDirections(p, ps), null, 2)
}
