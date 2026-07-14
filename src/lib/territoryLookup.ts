/**
 * territoryLookup.ts — "which electric company serves this lot?" answered by
 * Marion County's own GIS instead of phone calls and guesswork.
 *
 * Born July 14 2026, the day SECO told Adam that 14845 SW 77th Ave (Marion
 * Oaks Unit 11 — a subdivision that is MOSTLY SECO) wasn't theirs: the
 * SECO/Duke territorial seam runs right along Marion Oaks' western edge, and
 * that lot sits ~1 mile on the Duke side. Instead of re-doing that research
 * per property, this module asks the county's published "Electric Service
 * Areas" layer directly:
 *
 *   1. Locate the lot — by PARCEL NUMBER first (the county ParcelCentroids
 *      layer knows every parcel, even vacant lots and "TBD" addresses),
 *      falling back to the county address locator.
 *   2. Point-query the Electric Service Areas polygon layer at that spot.
 *   3. Ask the same layer what OTHER providers exist within a mile — if the
 *      territorial seam is that close, the UI shows a "double-check" caution
 *      (boundaries on the county map are good but not survey-grade).
 *
 * Rules live in docs/BRAINS.md ("territoryLookup.ts") and are enforced by
 * territoryLookup.test.ts. The pure pieces (URL builders, response parsers,
 * name→code mapping) are all individually testable; only lookupTerritory()
 * at the bottom actually touches the network.
 *
 * Both hosts send CORS headers that allow the app's origin (verified July
 * 2026: gis.marionfl.org echoes the origin; services1.arcgis.com sends *),
 * so this runs straight from the browser — no proxy, no key, public data.
 */

import type { Utility } from '../types'

/* ==================== ENDPOINTS ==================== */

/** Marion County's parcel-centroid layer — one point per parcel, keyed by the
 *  same `8011-1368-27` format the app stores in Project.parcel. */
const PARCEL_LAYER =
  'https://gis.marionfl.org/public/rest/services/General/ParcelCentroids/MapServer/0/query'

/** Marion County's official address locator (knows county-assigned addresses
 *  even for vacant lots the big geocoders miss). */
const GEOCODER =
  'https://gis.marionfl.org/public/rest/services/MarionCountyAddressLocator/GeocodeServer/findAddressCandidates'

/** Marion County's "Electric Service Areas" polygons (Duke / SECO / Clay /
 *  Ocala Electric / Central Florida Electric) — county-maintained, the same
 *  layer their own GIS portal serves. */
const TERRITORY_LAYER =
  'https://services1.arcgis.com/oMGpBoZpy1Db2sAl/arcgis/rest/services/Electric_Service_Areas/FeatureServer/0/query'

/** Human fallback when the automated lookup can't answer — the county's own
 *  interactive map of the same layer. */
export const TERRITORY_MAP_URL =
  'https://data-marioncountyfl.opendata.arcgis.com/datasets/electric-service-areas/explore'

/** Geocode candidates scoring below this are treated as "not found" — a wrong
 *  rooftop would silently verify the wrong utility ("can't tell" beats
 *  guessing, per the global brains rule). */
export const MIN_GEOCODE_SCORE = 80

/** Seam radius: another provider's polygon within a MILE of the lot means the
 *  answer deserves a caution flag (1609 m — the county layer is in meters
 *  when we ask with esriSRUnit_Meter). */
export const SEAM_METERS = 1609

/* ==================== RESULT SHAPE ==================== */

export interface TerritoryHit {
  ok: true
  /** Provider name exactly as the county layer spells it, e.g. "Duke Energy". */
  provider: string
  /** The app's utility code when the provider is one we have automation for
   *  (SECO / DUKE / CLAY) — null for the others (Ocala Electric, Central
   *  Florida Electric Co-op), which are contact-only in this app. */
  code: Utility | null
  /** OTHER providers whose territory starts within a mile — non-empty means
   *  "right answer, but you're near the seam; a quick sanity check is wise". */
  neighbors: string[]
  /** Where we looked (WGS-84), so the UI can offer a map link. */
  point: { lon: number; lat: number }
  /** How the lot was located — 'parcel' is exact, 'address' is the fallback. */
  via: 'parcel' | 'address'
  /** What the county matched (situs / candidate address) — shown so a typo'd
   *  parcel or address can't silently verify the wrong lot. */
  matched: string
}

export interface TerritoryMiss {
  ok: false
  /** Human-readable, already phrased for the banner. */
  reason: string
}

export type TerritoryResult = TerritoryHit | TerritoryMiss

/* ==================== PURE PIECES (tested) ==================== */

/** Single-quote a value for an ArcGIS `where` clause. ArcGIS SQL escapes a
 *  quote by doubling it — this keeps a stray apostrophe in an address from
 *  breaking the query (or worse, changing it). */
export function sqlQuote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

/** The parcel-centroid query for one parcel number (county dash format). */
export function parcelQueryUrl(parcel: string): string {
  const q = new URLSearchParams({
    where: `PARCEL=${sqlQuote(parcel.trim())}`,
    outFields: 'PARCEL,SITUS_1,NAME',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  })
  return `${PARCEL_LAYER}?${q}`
}

/** The county-locator query for a street address. Deliberately street-only:
 *  the locator covers just Marion County, and our "city" values (mailing
 *  city, e.g. Dunnellon) often differ from the county situs city (Ocala) —
 *  sending the city would only lower the match score. */
export function geocodeUrl(address: string): string {
  const q = new URLSearchParams({
    SingleLine: address.trim(),
    outSR: '4326',
    maxLocations: '1',
    f: 'json',
  })
  return `${GEOCODER}?${q}`
}

/** Which provider's polygon contains this point? */
export function territoryUrl(lon: number, lat: number): string {
  const q = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME',
    returnGeometry: 'false',
    f: 'json',
  })
  return `${TERRITORY_LAYER}?${q}`
}

/** Same layer, widened to a 1-mile ring — reveals a nearby territorial seam. */
export function seamUrl(lon: number, lat: number): string {
  const q = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(SEAM_METERS),
    units: 'esriSRUnit_Meter',
    outFields: 'NAME',
    returnGeometry: 'false',
    f: 'json',
  })
  return `${TERRITORY_LAYER}?${q}`
}

/** Pull {lon, lat, situs} out of a ParcelCentroids response — null when the
 *  parcel isn't in the county layer (bad number, brand-new split). */
export function parseParcelCentroid(
  json: unknown,
): { lon: number; lat: number; matched: string } | null {
  const j = json as {
    features?: { attributes?: { SITUS_1?: string }; geometry?: { x?: number; y?: number } }[]
  }
  const f = j?.features?.[0]
  if (!f?.geometry || typeof f.geometry.x !== 'number' || typeof f.geometry.y !== 'number')
    return null
  return { lon: f.geometry.x, lat: f.geometry.y, matched: f.attributes?.SITUS_1 || '(no situs)' }
}

/** Pull the best geocode candidate — null when nothing scores ≥ MIN_GEOCODE_SCORE. */
export function parseGeocode(
  json: unknown,
): { lon: number; lat: number; matched: string } | null {
  const j = json as {
    candidates?: { address?: string; score?: number; location?: { x?: number; y?: number } }[]
  }
  const best = j?.candidates?.[0]
  if (
    !best?.location ||
    typeof best.location.x !== 'number' ||
    typeof best.location.y !== 'number' ||
    (best.score ?? 0) < MIN_GEOCODE_SCORE
  )
    return null
  return { lon: best.location.x, lat: best.location.y, matched: best.address || '(matched)' }
}

/** Provider NAMEs from a territory query, deduped, layer order preserved. */
export function parseProviders(json: unknown): string[] {
  const j = json as { features?: { attributes?: { NAME?: string } }[] }
  const names = (j?.features ?? [])
    .map((f) => f.attributes?.NAME?.trim() ?? '')
    .filter((n) => n.length > 0)
  return [...new Set(names)]
}

/**
 * County layer name → the app's utility code. Only the three BUILT-IN codes
 * come back as codes (they drive real automation — load forms, portal apply);
 * any other provider returns null so the UI reports the name without
 * pretending we have a workflow for it (fail open: never guess a code).
 */
export function providerCode(name: string): Utility | null {
  if (/duke/i.test(name)) return 'DUKE'
  if (/seco|sumter electric/i.test(name)) return 'SECO'
  if (/clay electric/i.test(name)) return 'CLAY'
  return null
}

/** Lots with no assigned street number can't be geocoded — same test the
 *  rest of the app uses (nextAction.isTBD), local copy to stay import-light. */
export function isLocatableAddress(address: string): boolean {
  return Boolean(address.trim()) && !/^tbd/i.test(address.trim())
}

/* ==================== THE LOOKUP (network) ==================== */

/** fetch → json with a friendly error instead of a stack trace. */
async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`county GIS answered HTTP ${res.status}`)
  return res.json()
}

/**
 * The whole pipeline: locate the lot (parcel first, address fallback), then
 * ask the county whose territory it's in, plus who else is within a mile.
 *
 * Never throws — every failure path returns {ok:false, reason} phrased for
 * direct display, because this runs from a button handler and "it broke"
 * banners help nobody.
 */
export async function lookupTerritory(p: {
  parcel: string
  address: string
}): Promise<TerritoryResult> {
  try {
    // ---- 1. locate: parcel number beats address (exact + works for TBD lots)
    let where: { lon: number; lat: number; matched: string } | null = null
    let via: 'parcel' | 'address' = 'parcel'
    if (p.parcel.trim()) {
      where = parseParcelCentroid(await getJson(parcelQueryUrl(p.parcel)))
    }
    if (!where && isLocatableAddress(p.address)) {
      via = 'address'
      where = parseGeocode(await getJson(geocodeUrl(p.address)))
    }
    if (!where) {
      return {
        ok: false,
        reason:
          "County GIS couldn't locate this lot by parcel or address — check the parcel number in Settings, or look it up on the county map.",
      }
    }

    // ---- 2. whose polygon is the lot in?
    const providers = parseProviders(await getJson(territoryUrl(where.lon, where.lat)))
    if (providers.length === 0) {
      return {
        ok: false,
        reason:
          'The lot is outside every polygon on the county electric-territory layer — verify by phone.',
      }
    }
    // Overlapping polygons at the point = the county data itself is ambiguous
    // here. Report the tie honestly rather than picking a winner.
    if (providers.length > 1) {
      return {
        ok: false,
        reason: `County layer shows OVERLAPPING territories here (${providers.join(
          ' + ',
        )}) — verify by phone.`,
      }
    }

    // ---- 3. seam check: anyone else within a mile?
    // Best-effort: a failure here must not sink an already-solid answer.
    let neighbors: string[] = []
    try {
      neighbors = parseProviders(await getJson(seamUrl(where.lon, where.lat))).filter(
        (n) => n !== providers[0],
      )
    } catch {
      /* seam check is advisory only */
    }

    return {
      ok: true,
      provider: providers[0],
      code: providerCode(providers[0]),
      neighbors,
      point: { lon: where.lon, lat: where.lat },
      via,
      matched: where.matched,
    }
  } catch (e) {
    return {
      ok: false,
      reason: `Lookup failed (${(e as Error).message}) — county GIS may be down; try again or use the county map.`,
    }
  }
}
