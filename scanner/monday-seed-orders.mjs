// Step 1 (Sep 2026): seed the Orders board from Lodestar's open orders (anything
// not yet Installed). Links each order to its property (by parcel) and to the
// vendor that covers its category. Idempotent by "Lodestar Id".
import { readFileSync } from 'node:fs'
import { mondayQuery } from './monday.mjs'
const S = process.argv[2]
const created = JSON.parse(readFileSync(`${S}/monday-created.json`, 'utf8'))
const blob = JSON.parse(readFileSync(`${S}/blob-slice.json`, 'utf8'))
const mItems = JSON.parse(readFileSync(`${S}/monday-items.json`, 'utf8'))
const O = created.ids.Orders, ob = created.boards.Orders
const STATUS = { toOrder: 'To order', ordered: 'Ordered', delivered: 'Delivered', installed: 'Installed' }
// Lodestar lead times (src/lib/leadTimes.ts) — fall back to 7 like the app.
const src = readFileSync(new URL('../src/lib/leadTimes.ts', import.meta.url), 'utf8')
const LEAD = {}; for (const m of src.matchAll(/'([^']+)':\s*(\d+)/g)) LEAD[m[1]] = Number(m[2])
const byParcel = Object.fromEntries(mItems.map(i => [i.parcel.trim(), i]))
// Vendors on the board, by Lodestar id -> monday item id; category -> vendor via blob.vendors
const vItems = (await mondayQuery(`{ boards(ids:[${created.boards.Vendors}]) { items_page(limit:100) { items { id column_values(ids:["${created.ids.Vendors['Lodestar Id']}"]) { text } } } } }`)).boards[0].items_page.items
const vendorMonday = Object.fromEntries(vItems.map(i => [i.column_values[0].text, i.id]))
const vendorForCategory = (cat) => { const v = blob.vendors.find(v => (v.categories || []).some(c => cat.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(cat.toLowerCase()))); return v ? vendorMonday[v.id] : null }
const existing = new Set((await mondayQuery(`{ boards(ids:[${ob}]) { items_page(limit:500) { items { column_values(ids:["${O['Lodestar Id']}"]) { text } } } } }`)).boards[0].items_page.items.map(i => i.column_values[0].text))
const toDate = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10) }
let added = 0, skipped = 0, unmatched = []
for (const p of blob.roster) {
  const ps = blob.projects[p.id]; if (!ps) continue
  const target = byParcel[p.parcel.trim()]
  for (const o of ps.orders) {
    if (o.status === 'installed') continue
    if (existing.has(o.id)) { skipped++; continue }
    if (!target) { unmatched.push(`${p.address} / ${o.category}`); continue }
    const vals = { [O.Status]: { label: STATUS[o.status] || 'To order' }, [O['Lodestar Id']]: o.id, [O.Property]: { item_ids: [Number(target.id)] }, [O['Lead Time (days)']]: String(LEAD[o.category] ?? 7) }
    const od = toDate(o.orderedOn), nd = toDate(o.neededBy)
    if (od) vals[O['Ordered On']] = { date: od }
    if (nd) vals[O['Needed By']] = { date: nd }
    const note = [o.note, o.vendor ? `vendor: ${o.vendor}` : ''].filter(Boolean).join(' · '); if (note) vals[O.Note] = note
    const vid = vendorForCategory(o.category); if (vid) vals[O.Vendor] = { item_ids: [Number(vid)] }
    await mondayQuery(`mutation ($b: ID!, $g: String!, $n: String!, $v: JSON!) { create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$v) { id } }`, { b: String(ob), g: created.groups.Orders, n: `${o.category} — ${p.address}`, v: JSON.stringify(vals) })
    added++
  }
}
console.log({ added, skipped, unmatched: unmatched.length }); if (unmatched.length) console.log('unmatched:', unmatched.join(' | '))
