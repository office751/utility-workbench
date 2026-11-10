// sub-invoice-sync.mjs — keeps the subs' invoice page (/factura) house list in step with Monday.
//
// Run:  node scanner/sub-invoice-sync.mjs          (add --dry to only print what it would do)
//
// What it does:
//   1. Reads every house on the Construction Job List that is in Permitting, Active or
//      Completed (lots with no street number yet, and Dead Lots, are skipped).
//   2. Writes them to the Supabase table sub_invoice_houses as source='monday'
//      (address like "888 NE 95TH ST, OCALA" + the true county parcel).
//   3. Hides (active=false) any Monday-sourced house that is no longer on the board.
//   4. Removes hand-added ('manual') rows that are the same house as a Monday row,
//      so nobody sees a house twice. Manual rows with no Monday match are left alone.
//
// Reads only from Monday. Writes only to that one Supabase table.
import { loadEnv, mondayQuery, CJL_BOARD_ID } from './monday.mjs'

const DRY = process.argv.includes('--dry')
const KEEP_GROUPS = ['Permitting', 'Active - Under Construction', 'Completed Jobs']
const env = loadEnv()
const SB = env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/sub_invoice_houses'
const headers = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }
const sb = async (path, init = {}) => {
  const res = await fetch(SB + path, { ...init, headers: { ...headers, ...(init.headers || {}) } })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}
// "same house" key: street number + parcel (two houses can share a parcel, so both are needed)
const houseKey = (address, parcel) => (address.match(/^\d+/) || [''])[0] + '|' + parcel

// 1. Monday
const data = await mondayQuery(`query ($b: [ID!]) { boards(ids: $b) { items_page(limit: 500) { items {
  name group { title } column_values(ids: ["text_mm6ts07h", "color_mm6tst06"]) { id text } } } } }`, { b: [CJL_BOARD_ID] })
const houses = []
for (const it of data.boards[0].items_page.items) {
  const name = it.name.replace(/\s+/g, ' ').trim().toUpperCase()
  if (!KEEP_GROUPS.includes(it.group.title) || !/^\d+ /.test(name)) continue
  const col = (id) => (it.column_values.find((c) => c.id === id)?.text || '').trim()
  const city = col('color_mm6tst06').toUpperCase()
  houses.push({ address: name + (city ? ', ' + city : ''), parcel: col('text_mm6ts07h').toUpperCase(), active: true, source: 'monday' })
}
if (houses.length < 20) throw new Error(`Only ${houses.length} houses came back from Monday — refusing to sync (looks wrong).`)

// 2–4. Supabase
const existing = await sb('?select=address,parcel,source,active')
const mondayAddrs = new Set(houses.map((h) => h.address))
const mondayKeys = new Set(houses.map((h) => houseKey(h.address, h.parcel)))
const gone = existing.filter((r) => r.source === 'monday' && r.active && !mondayAddrs.has(r.address))
const dupes = existing.filter((r) => r.source !== 'monday' && !mondayAddrs.has(r.address) && mondayKeys.has(houseKey(r.address, r.parcel)))
const added = houses.filter((h) => !existing.some((r) => r.address === h.address))

console.log(`Monday houses: ${houses.length} | new: ${added.length} | hidden (left the board): ${gone.length} | duplicate manual rows removed: ${dupes.length}`)
for (const h of added) console.log('  + ' + h.address + ' (' + h.parcel + ')')
for (const r of gone) console.log('  - ' + r.address)
if (DRY) { for (const r of dupes) console.log('  dup ' + r.address); console.log('(dry run — nothing written)'); process.exit(0) }

await sb('?on_conflict=address', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(houses) })
const inList = (rows) => '(' + rows.map((r) => '"' + r.address.replace(/"/g, '') + '"').join(',') + ')'
if (gone.length) await sb('?address=in.' + encodeURIComponent(inList(gone)), { method: 'PATCH', body: JSON.stringify({ active: false }) })
if (dupes.length) await sb('?address=in.' + encodeURIComponent(inList(dupes)), { method: 'DELETE' })
console.log('House list synced.')
