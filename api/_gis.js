/**
 * _gis.js — "which electric company serves this lot?" against Marion County's
 * published GIS. Shared by the Monday webhook (api/electric-scout.js) and the
 * CLI sweep (scanner/electric-scout.mjs) so the two can never drift apart.
 *
 * Underscore-prefixed so Vercel treats it as a module, not a route.
 *
 * Mirrors src/lib/territoryLookup.ts (the app's Verify button): locate the lot
 * by parcel number first — the county's ParcelCentroids layer knows vacant
 * "TBD" lots the big geocoders miss — then point-query the Electric Service
 * Areas polygons, then measure how close the nearest OTHER provider is. That
 * last step exists because the SECO/Duke seam is real: SECO once bounced
 * 14845 SW 77th Ave, a lot in a mostly-SECO subdivision, for sitting a mile
 * on the Duke side.
 */

const PARCEL_LAYER = 'https://gis.marionfl.org/public/rest/services/General/ParcelCentroids/MapServer/0/query'
const GEOCODER = 'https://gis.marionfl.org/public/rest/services/MarionCountyAddressLocator/GeocodeServer/findAddressCandidates'
const ELECTRIC_LAYER = 'https://services1.arcgis.com/oMGpBoZpy1Db2sAl/arcgis/rest/services/Electric_Service_Areas/FeatureServer/0/query'

/** 1 mile in metres — the widest ring we look for a neighbouring provider in. */
export const SEAM_METERS = 1609
/** Rings we walk in through, so a flag carries a distance instead of a shrug. */
export const SEAM_RUNGS = [100, 250, 500, 800, 1200, SEAM_METERS]
/** Closer than this to another provider and a human should confirm. */
export const SEAM_CLOSE_METERS = 250
const MIN_GEOCODE_SCORE = 80

export const metresToFeet = (m) => Math.round(m * 3.28084)
const sqlQuote = (v) => `'${String(v).replace(/'/g, "''")}'`

/** One retry with backoff — these public endpoints do come back short under a
 *  sweep, and a short response must never read as a clean answer. */
async function getJson(url, tries = 2) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`GIS ${res.status}`)
      const j = await res.json()
      if (j?.error) throw new Error(`GIS ${j.error.code}: ${j.error.message}`)
      return j
    } catch (e) {
      if (i >= tries) throw e
      await new Promise((r) => setTimeout(r, 400 * i))
    }
  }
}

const parcelQueryUrl = (parcel) => `${PARCEL_LAYER}?` + new URLSearchParams({
  where: `PARCEL=${sqlQuote(parcel.trim())}`, outFields: 'PARCEL,SITUS_1,NAME',
  returnGeometry: 'true', outSR: '4326', f: 'json' })

const geocodeUrl = (address) => `${GEOCODER}?` + new URLSearchParams({
  SingleLine: address.trim(), outFields: '*', maxLocations: '1', outSR: '4326', f: 'json' })

function territoryQuery(lon, lat, distance) {
  const q = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', where: '1=1', outFields: 'NAME',
    returnGeometry: 'false', f: 'json' })
  if (distance) { q.set('distance', String(distance)); q.set('units', 'esriSRUnit_Meter') }
  return `${ELECTRIC_LAYER}?${q}`
}

const parseProviders = (j) =>
  [...new Set((j?.features ?? []).map((f) => (f.attributes?.NAME ?? '').trim()).filter(Boolean))]

/** County layer name → the code the board's Electric Co. column uses. Never
 *  guess: an unrecognised provider comes back under its own name. */
export const providerCode = (name) =>
  /duke/i.test(name) ? 'DUKE'
  : /seco|sumter electric/i.test(name) ? 'SECO'
  : /clay electric/i.test(name) ? 'CLAY'
  : /ocala electric/i.test(name) ? 'OEU'
  : null

export const isLocatable = (a) => Boolean(String(a ?? '').trim()) && !/^tbd/i.test(String(a).trim())

/**
 * @returns {Promise<
 *   | { ok: false, why: string }
 *   | { ok: true, via: string, provider: string, code: string|null,
 *       overlapping: string[], seam: string[]|null, seamAt?: number,
 *       seamUnknown?: boolean, close: boolean }>}
 */
export async function scoutElectric({ parcel, address }) {
  let pt = null, via = ''
  if (parcel) {
    const f = (await getJson(parcelQueryUrl(parcel)))?.features?.[0]
    if (f?.geometry && typeof f.geometry.x === 'number') {
      pt = { lon: f.geometry.x, lat: f.geometry.y }
      via = `parcel ${parcel}`
    }
  }
  if (!pt && isLocatable(address)) {
    const c = (await getJson(geocodeUrl(address)))?.candidates?.[0]
    if (c && (c.score ?? 0) >= MIN_GEOCODE_SCORE) {
      pt = { lon: c.location.x, lat: c.location.y }
      via = `address "${address}" (score ${Math.round(c.score)})`
    }
  }
  if (!pt) return { ok: false, why: 'could not locate the lot in county GIS' }

  const here = parseProviders(await getJson(territoryQuery(pt.lon, pt.lat)))
  if (here.length === 0) return { ok: false, why: 'no electric territory polygon covers this point' }

  const base = { ok: true, via, provider: here[0], code: providerCode(here[0]), overlapping: here.slice(1) }

  const near = parseProviders(await getJson(territoryQuery(pt.lon, pt.lat, SEAM_METERS)))
  // The mile-wide ring must contain at least what the point itself sits in.
  // If it doesn't, that call came back short — say so, don't report "clear".
  if (!here.every((n) => near.includes(n))) return { ...base, seam: null, seamUnknown: true, close: true }

  const others = near.filter((n) => !here.includes(n))
  if (others.length === 0) return { ...base, seam: null, close: false }

  let seamAt = SEAM_METERS
  for (const r of SEAM_RUNGS) {
    const ring = parseProviders(await getJson(territoryQuery(pt.lon, pt.lat, r)))
    if (ring.some((n) => others.includes(n))) { seamAt = r; break }
  }
  return { ...base, seam: others, seamAt, close: seamAt <= SEAM_CLOSE_METERS }
}
