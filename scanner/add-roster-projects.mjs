/**
 * add-roster-projects.mjs — one-shot: add the three Construction-Archive-only
 * projects to the live app roster (10050 SE 130th St, 10538 SE 50th Ave,
 * 20769 SW Oriole Dr), so every past/present/future project is on the list.
 *
 * Safe by design, same pattern as scan.mjs:
 *   1. reads the LIVE blob fresh,
 *   2. backs it up to scanner/backups/ BEFORE touching anything,
 *   3. APPEND-ONLY — skips any address already in the roster (safe to re-run),
 *   4. writes back and verifies.
 *
 * Run it:   cd scanner && node add-roster-projects.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const URL_ = get('SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_KEY')
if (!URL_ || !KEY) { console.error('Missing SUPABASE_* in scanner/.env'); process.exit(1) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// The three projects. Facts came from the archive folders + neighbors on the
// same street; blanks are unknowns to fill in the app later. The two [SOLD]
// archive homes are listStatus CO; 10050 SE 130th St's build state is unknown
// (deed + NOC on file) so it enters as NotApplied — correct it in the app.
const ADDITIONS = [
  { address: '10050 SE 130th St', city: '', zip: '', model: '', parcel: '4552-004-007', subdivision: '', electricCo: '', permit: '', workOrder: '', serviceType: '', listStatus: 'NotApplied', engineer: '', waterSource: '' },
  { address: '10538 SE 50th Ave', city: 'Belleview', zip: '34420', model: '', parcel: '3706-001-026', subdivision: 'Coral Ridge', electricCo: '', permit: '', workOrder: '', serviceType: '', listStatus: 'CO', engineer: '', waterSource: '' },
  { address: '20769 SW Oriole Dr', city: 'Dunnellon', zip: '34431', model: '', parcel: '1801-026-044', subdivision: 'Rainbow Lakes Estates, Sec A', electricCo: 'SECO', permit: '', workOrder: '', serviceType: '', listStatus: 'CO', engineer: '', waterSource: 'Well' },
]

// 1) fresh read
const rows = await (await fetch(`${URL_}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })).json()
const blob = rows?.[0]?.data
if (!blob?.roster) { console.error('Could not read the workbench blob.'); process.exit(1) }

// 2) backup before mutating
mkdirSync(new URL('backups', import.meta.url), { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(new URL(`backups/workbench-add-roster-${stamp}.json`, import.meta.url), JSON.stringify(blob))

// 3) append-only
let id = Math.max(...blob.roster.map((p) => p.id)) + 1
const added = []
for (const a of ADDITIONS) {
  if (blob.roster.some((p) => p.address.toLowerCase() === a.address.toLowerCase())) {
    console.log(`skip (already in roster): ${a.address}`)
    continue
  }
  blob.roster.push({ id, ...a })
  added.push(`${id}  ${a.address}  [${a.listStatus}]`)
  id++
}
if (!added.length) { console.log('Nothing to add — roster already has all three.'); process.exit(0) }

// 4) write back
const res = await fetch(`${URL_}/rest/v1/workbench?id=eq.main`, {
  method: 'PATCH',
  headers: { ...H, 'content-type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ data: blob, updated_at: new Date().toISOString() }),
})
if (!res.ok) { console.error('WRITE FAILED:', res.status, await res.text()); process.exit(1) }

// 5) verify
const check = await (await fetch(`${URL_}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })).json()
console.log('✓ Added:')
for (const a of added) console.log(`   ${a}`)
console.log(`✓ Roster now has ${check[0].data.roster.length} projects.`)
console.log(`   Backup: scanner/backups/workbench-add-roster-${stamp}.json`)
