/**
 * new-house.mjs — the "new house wizard".
 *
 * One command turns a street address into a fully set-up project:
 *
 *   1. Looks the lot up in Marion County's own GIS:
 *        - finds the PARCEL number + owner of record + acreage + zoning
 *          (attribute query on the county Parcels layer by situs address —
 *          NOT a point query, because geocoded points can land a few feet
 *          over the property line and match the neighbor's parcel),
 *        - gets the county's parcel-centroid point,
 *        - asks the Electric Service Areas layer which power company serves
 *          that point (same layer the app's "Check county GIS" button uses),
 *          plus a 1-mile seam check so a nearby Duke/SECO boundary gets a
 *          caution instead of silent confidence.
 *   2. Appends the project to the LIVE app roster (Supabase blob) —
 *        same safety pattern as scan-josh.mjs / add-roster-projects.mjs:
 *        fresh read → backup to scanner/backups/ → append-only → verify.
 *        Skips (never edits) an address or parcel already on the roster.
 *   3. Creates the Construction Archive folder "Address (Parcel)" in BOTH
 *        mirrors (Documents + OneDrive), skipping any that already exist.
 *
 * PREVIEW IS THE DEFAULT — running without --write only prints what would
 * happen. Nothing is written until you re-run with --write.
 *
 * Usage (from scanner/):
 *   node new-house.mjs "14845 SW 77th Ave"                      # preview
 *   node new-house.mjs "14845 SW 77th Ave" --model "Model A" --write
 *   node new-house.mjs "TBD SW Pensacola Dr" --parcel 1811-011-001 --write
 *
 * Flags:
 *   --model <name>    house model for the roster ("Model A", "E2-RH", …)
 *   --parcel <num>    skip the address→parcel lookup (for TBD addresses)
 *   --no-folders      don't create archive folders (roster only)
 *   --write           actually do it (otherwise preview)
 *
 * Or the friendly ways: `npm run new:house -- "<address>"` here in scanner/,
 * or double-click "New House.command" on the Desktop.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/* ==================== arguments ==================== */

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const NO_FOLDERS = args.includes('--no-folders')
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].trim() : ''
}
const MODEL = flag('--model')
const PARCEL_ARG = flag('--parcel')
// The address is whatever's left after the flags — usually the first arg.
const ADDRESS = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--model' && args[i - 1] !== '--parcel').join(' ').trim()

if (!ADDRESS) {
  console.error('Usage: node new-house.mjs "<street address>" [--model "Model A"] [--parcel 1234-567-890] [--no-folders] [--write]')
  process.exit(1)
}

/* ==================== config ==================== */

const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const SB_URL = get('SUPABASE_URL')
const SB_KEY = get('SUPABASE_SERVICE_KEY')
if (!SB_URL || !SB_KEY) { console.error('Missing SUPABASE_* in scanner/.env'); process.exit(1) }
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

// The two mirrored Construction Archive locations (memory: they must match).
const ARCHIVE_ROOTS = [
  '/Users/Construction/Documents/Construction Archive/Construction/Directory/Operations/Projects',
  '/Users/Construction/Library/CloudStorage/OneDrive-ironshieldconstruction.com/Construction Archive/Construction/Directory/Operations/Projects',
]

// Marion County GIS — same endpoints as src/lib/territoryLookup.ts in the app.
const PARCELS_LAYER = 'https://gis.marionfl.org/public/rest/services/General/Parcels/MapServer/0/query'
const CENTROID_LAYER = 'https://gis.marionfl.org/public/rest/services/General/ParcelCentroids/MapServer/0/query'
const GEOCODER = 'https://gis.marionfl.org/public/rest/services/MarionCountyAddressLocator/GeocodeServer/findAddressCandidates'
const ELECTRIC_LAYER = 'https://services1.arcgis.com/oMGpBoZpy1Db2sAl/arcgis/rest/services/Electric_Service_Areas/FeatureServer/0/query'
const SEAM_METERS = 1609 // another provider within a mile = caution

/* ==================== small helpers ==================== */

const sqlQuote = (v) => `'${v.replace(/'/g, "''")}'`

async function gis(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GIS request failed (${res.status}): ${url.slice(0, 120)}…`)
  const json = await res.json()
  if (json.error) throw new Error(`GIS error: ${json.error.message || JSON.stringify(json.error)}`)
  return json
}

// County layer name → the app's utility code (mirror of providerCode in
// territoryLookup.ts — only codes we have real workflows for; others stay '').
function providerCode(name) {
  if (/duke/i.test(name)) return 'DUKE'
  if (/seco|sumter electric/i.test(name)) return 'SECO'
  if (/clay electric/i.test(name)) return 'CLAY'
  return ''
}

// Folder names sync to Windows via OneDrive — strip characters Windows forbids.
const folderSafe = (s) => s.replace(/[\\/:*?"<>|]/g, '-').trim()

/* ==================== 1) GIS lookups ==================== */

console.log(`\n🏠 New house wizard — ${ADDRESS}${MODEL ? `  (${MODEL})` : ''}`)
console.log(WRITE ? '   MODE: WRITE (this will really do it)\n' : '   MODE: preview — nothing will be written (add --write to do it)\n')

let parcel = PARCEL_ARG
let owner = '', acres = null, zoning = '', situs = ''

if (!parcel) {
  // Attribute query by situs — exact, never grabs the neighbor's lot.
  const q = new URLSearchParams({
    where: `UPPER(SITUS_1) = ${sqlQuote(ADDRESS.toUpperCase())}`,
    outFields: 'PARCEL,NAME,ACRES,ZONE1,SITUS_1',
    returnGeometry: 'false',
    f: 'json',
  })
  const hits = (await gis(`${PARCELS_LAYER}?${q}`)).features ?? []
  if (hits.length === 1) {
    const a = hits[0].attributes
    parcel = a.PARCEL; owner = a.NAME ?? ''; acres = a.ACRES; zoning = a.ZONE1 ?? ''; situs = a.SITUS_1 ?? ''
  } else if (hits.length > 1) {
    console.error(`✗ ${hits.length} parcels share that situs address — re-run with --parcel <number>:`)
    for (const h of hits) console.error(`    ${h.attributes.PARCEL}  owner ${h.attributes.NAME}`)
    process.exit(1)
  } else {
    // Fallback: geocode the address, then point-query the parcel polygon.
    // A geocoded point can sit a few feet over the line, so we say so.
    console.log('   (no exact situs match — falling back to geocoder + point query)')
    const g = new URLSearchParams({ SingleLine: ADDRESS, outSR: '4326', maxLocations: '1', f: 'json' })
    const cand = (await gis(`${GEOCODER}?${g}`)).candidates?.[0]
    if (!cand || (cand.score ?? 0) < 80) {
      console.error('✗ The county locator can\'t find that address. For a TBD/unaddressed lot, re-run with --parcel <number>.')
      process.exit(1)
    }
    const pq = new URLSearchParams({
      geometry: `${cand.location.x},${cand.location.y}`, geometryType: 'esriGeometryPoint', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'PARCEL,NAME,ACRES,ZONE1,SITUS_1', returnGeometry: 'false', f: 'json',
    })
    const f = (await gis(`${PARCELS_LAYER}?${pq}`)).features?.[0]
    if (!f) { console.error('✗ Geocoded fine but no parcel polygon there — re-run with --parcel <number>.'); process.exit(1) }
    const a = f.attributes
    parcel = a.PARCEL; owner = a.NAME ?? ''; acres = a.ACRES; zoning = a.ZONE1 ?? ''; situs = a.SITUS_1 ?? ''
    console.log(`   ⚠ Parcel found by MAP POINT, not by address — double-check ${parcel} really is ${ADDRESS} (the point can land on a neighbor).`)
  }
} else {
  // --parcel given: still pull owner/acres/zoning so the report is complete.
  const q = new URLSearchParams({
    where: `PARCEL = ${sqlQuote(parcel)}`,
    outFields: 'PARCEL,NAME,ACRES,ZONE1,SITUS_1', returnGeometry: 'false', f: 'json',
  })
  const f = (await gis(`${PARCELS_LAYER}?${q}`)).features?.[0]
  if (f) { owner = f.attributes.NAME ?? ''; acres = f.attributes.ACRES; zoning = f.attributes.ZONE1 ?? ''; situs = f.attributes.SITUS_1 ?? '' }
  else console.log(`   ⚠ Parcel ${parcel} not found in the county Parcels layer — continuing with what we have.`)
}

// County-computed centroid (guaranteed inside the parcel, unlike a naive
// ring average) → which electric territory contains it + who's within a mile.
let electric = '', electricName = '', seamNote = '', cityFromCounty = '', zipFromCounty = ''
if (parcel) {
  const cq = new URLSearchParams({
    where: `PARCEL = ${sqlQuote(parcel)}`, outFields: 'PARCEL,SITUS_1', returnGeometry: 'true', outSR: '4326', f: 'json',
  })
  const cf = (await gis(`${CENTROID_LAYER}?${cq}`)).features?.[0]
  if (cf?.geometry) {
    const { x: lon, y: lat } = cf.geometry
    const eq = (dist) => {
      const p = new URLSearchParams({
        geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects', where: '1=1', outFields: 'NAME', returnGeometry: 'false', f: 'json',
      })
      if (dist) { p.set('distance', String(dist)); p.set('units', 'esriSRUnit_Meter') }
      return `${ELECTRIC_LAYER}?${p}`
    }
    const names = ((await gis(eq())).features ?? []).map((f) => f.attributes?.NAME?.trim()).filter(Boolean)
    electricName = names[0] ?? ''
    electric = providerCode(electricName)
    const near = [...new Set(((await gis(eq(SEAM_METERS))).features ?? []).map((f) => f.attributes?.NAME?.trim()).filter(Boolean))]
      .filter((n) => n !== electricName)
    if (near.length) seamNote = `territory seam within 1 mile (${near.join(', ')} nearby) — worth a sanity check`
  } else {
    console.log('   ⚠ No centroid for that parcel — electric lookup skipped.')
  }
}

// City + ZIP for the roster row, from the county locator's formatted match.
// The format varies ("ADDR, OCALA, FL, 34473" or "ADDR, OCALA, 34473"), so:
// city = the part right after the street, ZIP = any 5 digits near the end.
try {
  const g = new URLSearchParams({ SingleLine: situs || ADDRESS, outSR: '4326', maxLocations: '1', f: 'json' })
  const cand = (await gis(`${GEOCODER}?${g}`)).candidates?.[0]
  if (cand && (cand.score ?? 0) >= 80) {
    const parts = cand.address.split(',').map((s) => s.trim())
    if (parts.length >= 2 && /^[A-Z' ]+$/.test(parts[1])) {
      cityFromCounty = parts[1].charAt(0) + parts[1].slice(1).toLowerCase()
    }
    zipFromCounty = (cand.address.match(/\b(\d{5})\s*$/) || ['', ''])[1]
  }
} catch { /* cosmetic only */ }

/* ==================== 2) the plan ==================== */

const rosterRow = {
  address: ADDRESS,
  city: cityFromCounty,
  zip: zipFromCounty,
  model: MODEL,
  parcel: parcel || '',
  subdivision: '', // county layer doesn't carry it — fill in the app if wanted
  electricCo: electric,
  permit: '',
  workOrder: '',
  serviceType: '',
  listStatus: 'NotApplied',
  engineer: '',
  waterSource: '',
}

const folderName = folderSafe(parcel ? `${ADDRESS} (${parcel})` : ADDRESS)

console.log('── County GIS ─────────────────────────────────────────')
console.log(`   Parcel:    ${parcel || '(not found)'}`)
console.log(`   Situs:     ${situs || '(none)'}`)
console.log(`   Owner:     ${owner || '(unknown)'}${owner && !/iron shield|mro cala/i.test(owner) ? '   ⚠ not an Iron Shield entity — not closed yet?' : ''}`)
console.log(`   Acres:     ${acres ?? '?'}    Zoning: ${zoning || '?'}`)
console.log(`   Electric:  ${electricName || '(unknown)'}${electric ? ` → ${electric}` : electricName ? ' (no app workflow — contact-only)' : ''}`)
if (seamNote) console.log(`   ⚠ ${seamNote}`)
console.log('── Will create ────────────────────────────────────────')
console.log(`   Roster:    ${ADDRESS}${cityFromCounty ? `, ${cityFromCounty}` : ''} ${zipFromCounty}  model:${MODEL || '—'}  electric:${electric || '—'}  status:NotApplied`)
if (!NO_FOLDERS) for (const root of ARCHIVE_ROOTS) console.log(`   Folder:    ${join(root, folderName)}`)

/* ==================== 3) do it (only with --write) ==================== */

// Fresh read + the same "is this a real blob" guard the other scripts use.
const rows = await (await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })).json()
const blob = rows?.[0]?.data
if (!blob || !Array.isArray(blob.roster) || blob.roster.length === 0) {
  console.error('✗ Could not read a healthy workbench blob — aborting.'); process.exit(1)
}

// Duplicate guards — by address AND by parcel (never edit, never duplicate).
const dupAddr = blob.roster.find((p) => p.address.trim().toLowerCase() === ADDRESS.toLowerCase())
const dupParcel = parcel && blob.roster.find((p) => (p.parcel || '').trim() === parcel)
if (dupAddr) console.log(`\n✗ Already on the roster as #${dupAddr.id} (${dupAddr.address}) — nothing to do.`)
if (!dupAddr && dupParcel) console.log(`\n✗ Parcel ${parcel} is already on the roster as #${dupParcel.id} (${dupParcel.address}) — nothing to do.`)
if (dupAddr || dupParcel) process.exit(0)

if (!WRITE) {
  console.log('\nPreview only. Re-run with --write to create it.')
  process.exit(0)
}

// Backup BEFORE mutating — non-negotiable house rule.
mkdirSync(new URL('backups', import.meta.url), { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(new URL(`backups/workbench-new-house-${stamp}.json`, import.meta.url), JSON.stringify(blob))

const newId = Math.max(...blob.roster.map((p) => p.id)) + 1
blob.roster.push({ id: newId, ...rosterRow })

const res = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main`, {
  method: 'PATCH',
  headers: { ...H, 'content-type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ data: blob, updated_at: new Date().toISOString() }),
})
if (!res.ok) { console.error('✗ WRITE FAILED:', res.status, await res.text()); process.exit(1) }

// Verify the write really landed before claiming success.
const check = await (await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })).json()
const landed = check?.[0]?.data?.roster?.some((p) => p.id === newId)
if (!landed) { console.error('✗ Write did not verify — check the app before re-running.'); process.exit(1) }

console.log(`\n✓ Added to the roster as project #${newId}.`)
console.log(`   Backup: scanner/backups/workbench-new-house-${stamp}.json`)

// Archive folders, both mirrors — skip anything that already exists.
if (!NO_FOLDERS) {
  for (const root of ARCHIVE_ROOTS) {
    if (!existsSync(root)) { console.log(`   ⚠ Archive root missing, skipped: ${root}`); continue }
    const dir = join(root, folderName)
    if (existsSync(dir)) { console.log(`   ✓ Folder already exists: ${dir}`) }
    else { mkdirSync(dir); console.log(`   ✓ Folder created: ${dir}`) }
  }
}

console.log(`
Next steps for ${ADDRESS} (all in the app's 📖 Guide too):
   • Order the boundary survey (D.W. Hirst) and soil test (Rapid) — 🚚 Vendors has one-click emails.
   • Permit handoff to Jennifer — Permit tab 📨 button.
   • Electric application when ready — ⚡ ${electric || 'check the Electric tab banner'}.
`)
