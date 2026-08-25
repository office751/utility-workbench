/**
 * add-dead-lots.mjs — one-shot (Aug 25 2026): import the "Dead Lots" tab of
 * the Construction Jobs Permitting spreadsheet into the live roster, each as
 * a Dead-status house with its kill reason in the fitting stream note.
 *
 * Source: Construction Archive → Directory/Operations/Construction Jobs
 * Permitting.xlsx, "Dead Lots" sheet (5 rows; the sheet's own columns are
 * misaligned, so facts below are normalized by hand + enriched from county
 * GIS: situs addresses, current owners, subdivision names from parcel
 * prefixes matched against the roster's own entries).
 *
 * Safe by design, same pattern as add-roster-projects.mjs:
 *   1. reads the LIVE blob fresh,
 *   2. backs it up to scanner/backups/ BEFORE touching anything,
 *   3. APPEND-ONLY by parcel (safe to re-run); the one lot already in the
 *      roster (20910 SW Oriole Dr, already Dead) gets FILL-ONLY enrichment —
 *      its blank model filled + the kill reason appended to its water note,
 *      never overwriting anything Adam typed,
 *   4. writes back and verifies.
 *
 * Run it:   cd scanner && node add-dead-lots.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const URL_ = get('SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_KEY')
if (!URL_ || !KEY) { console.error('Missing SUPABASE_* in scanner/.env'); process.exit(1) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

/** Minimal valid per-house state (mirrors data/seed.ts emptyProjectState —
 *  selections omitted on purpose: migrate() fills defaults on next load). */
const emptyPS = () => ({
  orders: [],
  steps: { electric: {}, water: {}, septic: {}, permit: {}, materials: {} },
  notes: { electric: '', water: '', septic: '', permit: '', materials: '' },
})

// The four NEW dead lots (the fifth, 20910 SW Oriole Dr / 1801-025-027, is
// already in the roster as Dead — see ENRICH below).
const ADDITIONS = [
  {
    facts: { address: 'TBD SW 78th Ct Rd', city: 'Ocala', zip: '34473', model: '', parcel: '8011-1373-07', subdivision: 'Marion Oaks Unit 11', electricCo: '', permit: '', workOrder: '', serviceType: '', listStatus: 'Dead', engineer: '', waterSource: 'Well' },
    notes: { electric: '💀 Dead: no nearby power poles — line extension would be needed (dead-lots sheet; electric answer was still pending). Survey done; site plan was still needed.' },
  },
  {
    facts: { address: 'TBD SW 132nd Pl', city: 'Ocala', zip: '34473', model: '', parcel: '8010-0923-02', subdivision: 'Marion Oaks Unit 10', electricCo: '', permit: '', workOrder: '', serviceType: '', listStatus: 'Dead', engineer: '', waterSource: '' },
    notes: { permit: '💀 Dead: deal fell through — RECOVER THE $3,000 DEPOSIT (dead-lots sheet). County now shows owner CHEN SUE FUN, so the lot was never ours. Utility easement was typed.' },
  },
  {
    facts: { address: 'TBD Oak Circle', city: 'Ocala', zip: '34472', model: 'E2-LH', parcel: '9013-0152-43', subdivision: 'Silver Springs Shores Unit 13', electricCo: 'DUKE', permit: '', workOrder: '', serviceType: '', listStatus: 'Dead', engineer: '', waterSource: 'Well' },
    notes: { permit: "💀 Dead: neighbor's fence is built into the lot — William says not worth the hassle (dead-lots sheet). Utility easement RECORDED; survey done. County owner: Mr Ocala Buys Houses LLC." },
  },
  {
    facts: { address: '7569 SW 136th Ter', city: 'Dunnellon', zip: '34431', model: 'E2-LH', parcel: '3492-080-109', subdivision: 'Rolling Hills Unit 2', electricCo: 'SECO', permit: '', workOrder: '', serviceType: '', listStatus: 'Dead', engineer: '', waterSource: '' },
    notes: { permit: "💀 Dead: deal cancelled 12/29 (dead-lots sheet; county owner now Mortgage Solutions & Investment Properties LLC). Sheet siting notes, if ever revived: house 35' to the left, 30' back off the road, ~75' to the right; septic in front. Soil test was still needed." },
  },
]

// FILL-ONLY enrichment for the dead lot Adam already added (never overwrite).
const ENRICH = {
  parcel: '1801-025-027', // 20910 SW Oriole Dr — already listStatus Dead
  model: 'Model F-RH', // sheet's House Model; only fills if his entry is blank
  waterNote: '💀 Dead: needs a ~$27,000 water main extension (dead-lots sheet). Permit 2025070332; SECO never applied; survey ordered, site plan done, soil test done 6/27.',
  permitNo: '2025070332', // only fills if blank
}

// 1) fresh read
const rows = await (await fetch(`${URL_}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })).json()
const blob = rows?.[0]?.data
if (!blob?.roster) { console.error('Could not read the workbench blob.'); process.exit(1) }

// 2) backup before mutating
mkdirSync(new URL('backups', import.meta.url), { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(new URL(`backups/workbench-dead-lots-${stamp}.json`, import.meta.url), JSON.stringify(blob))

// 3a) append-only by PARCEL (address is TBD-ish on most of these)
blob.projects ??= {}
let id = Math.max(...blob.roster.map((p) => p.id)) + 1
const report = []
for (const { facts, notes } of ADDITIONS) {
  if (blob.roster.some((p) => (p.parcel || '').trim() === facts.parcel)) {
    report.push(`skip (parcel already in roster): ${facts.parcel} ${facts.address}`)
    continue
  }
  blob.roster.push({ id, ...facts })
  const ps = emptyPS()
  ps.notes = { ...ps.notes, ...notes }
  blob.projects[id] = ps
  report.push(`added #${id}  ${facts.address}  (${facts.parcel})  [Dead]`)
  id++
}

// 3b) fill-only enrichment of the existing Oriole entry
const oriole = blob.roster.find((p) => (p.parcel || '').trim() === ENRICH.parcel)
if (oriole) {
  if (!oriole.model) { oriole.model = ENRICH.model; report.push(`enriched #${oriole.id}: model → ${ENRICH.model}`) }
  if (!oriole.permit) { oriole.permit = ENRICH.permitNo; report.push(`enriched #${oriole.id}: permit → ${ENRICH.permitNo}`) }
  const ps = (blob.projects[oriole.id] ??= emptyPS())
  ps.notes ??= { electric: '', water: '', septic: '', permit: '', materials: '' }
  if (!(ps.notes.water || '').includes('water main extension')) {
    ps.notes.water = ps.notes.water ? `${ps.notes.water}\n${ENRICH.waterNote}` : ENRICH.waterNote
    report.push(`enriched #${oriole.id}: water note (the $27k kill reason)`)
  }
}

// 4) write back + verify
const res = await fetch(`${URL_}/rest/v1/workbench?id=eq.main`, {
  method: 'PATCH',
  headers: { ...H, 'content-type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ data: blob }),
})
if (!res.ok) { console.error(`WRITE FAILED: HTTP ${res.status} ${await res.text()}`); process.exit(1) }
const check = await (await fetch(`${URL_}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })).json()
const dead = check[0].data.roster.filter((p) => p.listStatus === 'Dead')
console.log(report.join('\n'))
console.log(`\nVerified: roster now ${check[0].data.roster.length} houses, ${dead.length} Dead:`)
for (const d of dead) console.log(`  #${d.id}  ${d.address}  (${d.parcel})`)
