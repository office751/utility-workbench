/**
 * electric-scout.mjs — "which electric company serves this lot?" for Monday
 * rows, answered by Marion County's GIS instead of phone calls.
 *
 * This is the Monday-side twin of the app's ⚡ Verify button
 * (src/lib/territoryLookup.ts) and deliberately uses the same three county
 * layers and the same 1-mile seam-caution rule, so the two never disagree:
 *
 *   1. Locate the lot by PARCEL NUMBER (ParcelCentroids knows vacant "TBD"
 *      lots the big geocoders miss), falling back to the address locator.
 *   2. Point-query the Electric Service Areas polygons at that spot.
 *   3. Re-ask within a mile — if another provider is that close the lot sits
 *      near a territorial seam and the answer is flagged to double-check.
 *      (That seam is exactly how SECO once bounced 14845 SW 77th Ave.)
 *
 *   node electric-scout.mjs                       # dry run, Pre-Permitting group
 *   node electric-scout.mjs --apply
 *   node electric-scout.mjs --group "Permitting"
 *   node electric-scout.mjs --parcel 1801-006-013 # just one, no board write
 *   node electric-scout.mjs --all                 # include rows that already have a company
 *
 * FILL-ONLY: a row that already names an electric company is left alone
 * unless you pass --all. Seam-flagged answers are reported but NOT written
 * without --apply-cautious, because near a seam the map is not survey-grade.
 */
import { mondayQuery, CJL_BOARD_ID } from './monday.mjs'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f) => (has(f) ? args[args.indexOf(f) + 1] : undefined)
const APPLY = has('--apply') || has('--apply-cautious')
const WRITE_CAUTIOUS = has('--apply-cautious')
const ALL = has('--all')
const GROUP = opt('--group') ?? 'Pre-Permitting'
const ONE = opt('--parcel')

const M_ELECTRIC_COL = 'color_mm6t88t4'   // Monday "Electric Co." (status)

/* ==================== county GIS (mirrors territoryLookup.ts) ============ */
const PARCEL_LAYER = 'https://gis.marionfl.org/public/rest/services/General/ParcelCentroids/MapServer/0/query'
const GEOCODER = 'https://gis.marionfl.org/public/rest/services/MarionCountyAddressLocator/GeocodeServer/findAddressCandidates'
const ELECTRIC_LAYER = 'https://services1.arcgis.com/oMGpBoZpy1Db2sAl/arcgis/rest/services/Electric_Service_Areas/FeatureServer/0/query'
/** 1 mile in metres — closer than this to another provider and we caution. */
const SEAM_METERS = 1609
const MIN_GEOCODE_SCORE = 80

const sqlQuote = (v) => `'${String(v).replace(/'/g, "''")}'`
/** One retry with a short backoff: sweeping 30+ lots hits these public
 *  endpoints hard enough that the odd call comes back empty or throttled,
 *  and an empty seam response must never be mistaken for "no seam nearby". */
const getJson = async (url, tries = 2) => {
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

/** Radii we probe to turn "a seam is somewhere within a mile" into a distance
 *  worth acting on — 300 ft from Duke is a phone call, 1 mile is noise. */
const SEAM_RUNGS = [100, 250, 500, 800, 1200, SEAM_METERS]
const metresToFeet = (m) => Math.round(m * 3.28084)

const parcelQueryUrl = (parcel) => `${PARCEL_LAYER}?` + new URLSearchParams({
  where: `PARCEL=${sqlQuote(parcel.trim())}`, outFields: 'PARCEL,SITUS_1,NAME',
  returnGeometry: 'true', outSR: '4326', f: 'json' })

const geocodeUrl = (address) => `${GEOCODER}?` + new URLSearchParams({
  SingleLine: address.trim(), outFields: '*', maxLocations: '1', outSR: '4326', f: 'json' })

const territoryQuery = (lon, lat, distance) => {
  const q = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', where: '1=1', outFields: 'NAME',
    returnGeometry: 'false', f: 'json' })
  if (distance) { q.set('distance', String(distance)); q.set('units', 'esriSRUnit_Meter') }
  return `${ELECTRIC_LAYER}?${q}`
}

const parseProviders = (j) =>
  [...new Set((j?.features ?? []).map((f) => (f.attributes?.NAME ?? '').trim()).filter(Boolean))]

/** County layer name → the roster code the board's status column uses. Never
 *  guess: an unrecognised provider comes back as its own name. */
const providerCode = (name) =>
  /duke/i.test(name) ? 'DUKE'
  : /seco|sumter electric/i.test(name) ? 'SECO'
  : /clay electric/i.test(name) ? 'CLAY'
  : /ocala electric/i.test(name) ? 'OEU'
  : null

const isLocatable = (a) => Boolean(String(a ?? '').trim()) && !/^tbd/i.test(String(a).trim())

/** Locate → who serves it → is a seam within a mile? */
async function scout({ parcel, address }) {
  let pt = null, via = ''
  if (parcel) {
    const j = await getJson(parcelQueryUrl(parcel))
    const f = j?.features?.[0]
    if (f?.geometry && typeof f.geometry.x === 'number') {
      pt = { lon: f.geometry.x, lat: f.geometry.y }
      via = `parcel ${parcel}`
    }
  }
  if (!pt && isLocatable(address)) {
    const j = await getJson(geocodeUrl(address))
    const c = j?.candidates?.[0]
    if (c && (c.score ?? 0) >= MIN_GEOCODE_SCORE) {
      pt = { lon: c.location.x, lat: c.location.y }
      via = `address "${address}" (score ${Math.round(c.score)})`
    }
  }
  if (!pt) return { ok: false, why: 'could not locate the lot in county GIS' }

  const here = parseProviders(await getJson(territoryQuery(pt.lon, pt.lat)))
  if (here.length === 0) return { ok: false, why: 'no electric territory polygon covers this point', via }

  const near = parseProviders(await getJson(territoryQuery(pt.lon, pt.lat, SEAM_METERS)))
  // The mile-wide query must return at least everything the point itself sits
  // in. If it doesn't, the call came back short — say so rather than reporting
  // a clean "no seam" we haven't actually established.
  if (!here.every((n) => near.includes(n))) {
    return { ok: true, via, provider: here[0], code: providerCode(here[0]),
             overlapping: here.slice(1), seam: null, seamUnknown: true }
  }
  const others = near.filter((n) => !here.includes(n))
  if (others.length === 0) {
    return { ok: true, via, provider: here[0], code: providerCode(here[0]), overlapping: here.slice(1), seam: null }
  }
  // Walk in from a mile to find roughly how close the nearest other provider is.
  let seamAt = SEAM_METERS
  for (const r of SEAM_RUNGS) {
    const ring = parseProviders(await getJson(territoryQuery(pt.lon, pt.lat, r)))
    if (ring.some((n) => others.includes(n))) { seamAt = r; break }
  }
  return {
    ok: true, via, provider: here[0], code: providerCode(here[0]),
    overlapping: here.slice(1), seam: others, seamAt,
  }
}

/* ==================== one-off lookup ==================== */
if (ONE) {
  const r = await scout({ parcel: ONE })
  console.log(JSON.stringify(r, null, 1))
  process.exit(r.ok ? 0 : 1)
}

/* ==================== board sweep ==================== */
const groups = (await mondayQuery(`query { boards(ids: ${CJL_BOARD_ID}) { groups { id title } } }`)).boards[0].groups
const group = groups.find((g) => g.title.toLowerCase() === GROUP.toLowerCase())
if (!group) { console.error(`No group "${GROUP}". Groups: ${groups.map((g) => g.title).join(', ')}`); process.exit(1) }
const items = (await mondayQuery(
  `query { boards(ids: ${CJL_BOARD_ID}) { groups(ids: ["${group.id}"]) { items_page(limit: 500) { items { id name column_values { text column { title } } } } } } }`
)).boards[0].groups[0].items_page.items
const cell = (it, t) => (it.column_values.find((c) => c.column.title === t)?.text || '').trim()

const todo = items.filter((it) => ALL || !cell(it, 'Electric Co.'))
console.log(`${GROUP}: ${items.length} rows · ${todo.length} without an electric company${ALL ? ' (--all: including filled)' : ''}\n`)

const writes = [], cautious = [], failed = []
for (const it of todo) {
  const parcel = cell(it, 'Parcel ID')
  const r = await scout({ parcel, address: it.name })
  if (!r.ok) { failed.push({ it, parcel, why: r.why }); console.log(`  ?  ${parcel.padEnd(14)} ${it.name.padEnd(26)} — ${r.why}`); continue }
  const label = r.code ?? r.provider
  // Only a seam within ~1/4 mile is worth holding back on; further out the
  // county polygons are plenty good enough to just write the answer.
  const CLOSE = 250
  const close = r.seam && r.seamAt <= CLOSE
  const flag = r.seamUnknown ? '  ⚠ seam check inconclusive'
    : r.seam ? `  ${close ? '⚠' : '·'} ${r.seam.join('/')} ~${metresToFeet(r.seamAt)} ft away` : ''
  console.log(`  ${close || r.seamUnknown ? '~' : '✓'}  ${parcel.padEnd(14)} ${it.name.padEnd(26)} ${label}${flag}`)
  ;(close || r.seamUnknown ? cautious : writes).push({ it, parcel, label, r })
}

console.log(`\n${writes.length} confident · ${cautious.length} need a look (seam within ~820 ft, or inconclusive) · ${failed.length} not located`)
if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply (add --apply-cautious to write the seam-flagged ones too).'); process.exit(0) }

const toWrite = WRITE_CAUTIOUS ? [...writes, ...cautious] : writes
let n = 0
for (const w of toWrite) {
  await mondayQuery(
    `mutation ($v: String!) { change_simple_column_value(board_id: ${CJL_BOARD_ID}, item_id: ${w.it.id}, column_id: "${M_ELECTRIC_COL}", value: $v, create_labels_if_missing: true) { id } }`,
    { v: w.label })
  n++
}
console.log(`\n✓ wrote ${n} electric company/companies to Monday${!WRITE_CAUTIOUS && cautious.length ? ` (${cautious.length} seam-flagged left for you)` : ''}`)
