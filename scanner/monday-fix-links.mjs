// Step 1 follow-up (Sep 2026): create_item silently ignores connect-boards values,
// so set Property / Vendor on Orders and Property on Inspections after the fact.
// Idempotent: skips rows whose link is already set.
import { readFileSync } from 'node:fs'
import { mondayQuery } from './monday.mjs'
const S = process.argv[2]
const created = JSON.parse(readFileSync(`${S}/monday-created.json`, 'utf8'))
const blob = JSON.parse(readFileSync(`${S}/blob-slice.json`, 'utf8'))
const mItems = JSON.parse(readFileSync(`${S}/monday-items.json`, 'utf8'))
// Match a Lodestar project to its Monday item: by parcel, but when two houses
// share a parcel (ADU pairs like 4923/4927 SW 157th St) fall back to the address.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const byParcel = {}; for (const i of mItems) (byParcel[i.parcel.trim()] ||= []).push(i)
const cjlIdForProject = (p) => { const c = byParcel[p.parcel.trim()] || []; if (c.length === 1) return c[0].id; const a = c.find(i => norm(i.name) === norm(p.address)) || mItems.find(i => norm(i.name) === norm(p.address)); return a?.id }
// Lodestar order id -> project ; inspection sourceKey -> project
const orderProj = {}, inspProj = {}
for (const p of blob.roster) { const ps = blob.projects[p.id]; if (!ps) continue; for (const o of ps.orders) orderProj[o.id] = p; for (const x of ps.inspections) inspProj[x.sourceKey] = p }
const vItems = (await mondayQuery(`{ boards(ids:[${created.boards.Vendors}]) { items_page(limit:100) { items { id column_values(ids:["${created.ids.Vendors['Lodestar Id']}"]) { text } } } } }`)).boards[0].items_page.items
const vendorMonday = Object.fromEntries(vItems.map(i => [i.column_values[0].text, i.id]))
const vendorFor = (cat) => { const v = blob.vendors.find(v => (v.categories || []).some(c => cat.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(cat.toLowerCase()))); return v ? vendorMonday[v.id] : null }
async function allItems(board, cols) {
  let cursor = null, out = []
  do { const q = cursor ? `{ next_items_page(limit:100, cursor:"${cursor}") { cursor items { id name column_values(ids:[${cols.map(c => `"${c}"`).join(',')}]) { id text value ... on BoardRelationValue { linked_item_ids } } } } }` : `{ boards(ids:[${board}]) { items_page(limit:100) { cursor items { id name column_values(ids:[${cols.map(c => `"${c}"`).join(',')}]) { id text value ... on BoardRelationValue { linked_item_ids } } } } } }`
    const d = await mondayQuery(q); const p = cursor ? d.next_items_page : d.boards[0].items_page; out.push(...p.items); cursor = p.cursor } while (cursor)
  return out
}
const set = (board, item, vals) => mondayQuery(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id:$b, item_id:$i, column_values:$v) { id } }`, { b: String(board), i: item, v: JSON.stringify(vals) })
const O = created.ids.Orders, I = created.ids.Inspections
let n = 0, miss = 0
for (const it of await allItems(created.boards.Orders, [O['Lodestar Id'], O.Property, O.Vendor])) {
  const cv = Object.fromEntries(it.column_values.map(c => [c.id, c]))
  if (cv[O.Property]?.linked_item_ids?.length && cv[O.Property].linked_item_ids[0] === String(cjlIdForProject(orderProj[cv[O['Lodestar Id']].text] || {parcel:''}))) continue
  const p = orderProj[cv[O['Lodestar Id']].text]; const cjl = p && cjlIdForProject(p); if (!cjl) { miss++; continue }
  const vals = { [O.Property]: { item_ids: [Number(cjl)] } }
  const cat = it.name.split(' — ')[0]; const vid = vendorFor(cat); if (vid) vals[O.Vendor] = { item_ids: [Number(vid)] }
  await set(created.boards.Orders, it.id, vals); n++
  if (n === 1) { const chk = (await mondayQuery(`{ items(ids:[${it.id}]) { column_values(ids:["${O.Property}"]) { ... on BoardRelationValue { linked_items { name } } } } }`)).items[0].column_values[0].linked_items?.[0]?.name; console.log('first order linked to:', chk); if (!chk) throw new Error('link did not stick — stopping') }
}
console.log('orders linked', n, 'unmatched', miss)
n = 0; miss = 0
for (const it of await allItems(created.boards.Inspections, [I['Source Key'], I.Property])) {
  const cv = Object.fromEntries(it.column_values.map(c => [c.id, c]))
  const p = inspProj[cv[I['Source Key']].text]; const cjl = p && cjlIdForProject(p); if (!cjl) { miss++; continue }
  if (cv[I.Property]?.linked_item_ids?.[0] === String(cjl)) continue
  await set(created.boards.Inspections, it.id, { [I.Property]: { item_ids: [Number(cjl)] } }); n++
}
console.log('inspections linked', n, 'unmatched', miss)
