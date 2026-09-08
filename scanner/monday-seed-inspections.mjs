// Step 1 (Sep 2026): rename the connect columns the UI just created, then seed
// the Inspections board from Lodestar's scanner results. Idempotent by Source Key.
import { readFileSync, writeFileSync } from 'node:fs'
import { mondayQuery, CJL_BOARD_ID } from './monday.mjs'
const S = process.argv[2]
const created = JSON.parse(readFileSync(`${S}/monday-created.json`, 'utf8'))
const blob = JSON.parse(readFileSync(`${S}/blob-slice.json`, 'utf8'))
const mItems = JSON.parse(readFileSync(`${S}/monday-items.json`, 'utf8'))
const ib = created.boards.Inspections, I = created.ids.Inspections
const rel = async (board) => (await mondayQuery(`{ boards(ids:[${board}]) { columns { id title type settings_str } } }`)).boards[0].columns.filter(c => c.type === 'board_relation')
for (const c of await rel(ib)) if (String(JSON.parse(c.settings_str).boardIds?.[0]) === String(CJL_BOARD_ID) && c.title !== 'Property') { await mondayQuery(`mutation { change_column_title(board_id:${ib}, column_id:"${c.id}", title:"Property") { id } }`); I.Property = c.id; console.log('Inspections column renamed -> Property', c.id) }
for (const c of await rel(CJL_BOARD_ID)) if (String(JSON.parse(c.settings_str).boardIds?.[0]) === String(ib) && c.title !== 'Inspections') { await mondayQuery(`mutation { change_column_title(board_id:${CJL_BOARD_ID}, column_id:"${c.id}", title:"Inspections") { id } }`); created.ids.CJL.Inspections = c.id; console.log('CJL column renamed -> Inspections', c.id) }
if (!I.Property) I.Property = (await rel(ib)).find(c => c.title === 'Property')?.id
writeFileSync(`${S}/monday-created.json`, JSON.stringify(created, null, 1))
const byParcel = Object.fromEntries(mItems.map(i => [i.parcel.trim(), i]))
const existing = new Set((await mondayQuery(`{ boards(ids:[${ib}]) { items_page(limit:500) { items { column_values(ids:["${I['Source Key']}"]) { text } } } } }`)).boards[0].items_page.items.map(i => i.column_values[0].text))
const result = (s) => { const t = (s || '').toLowerCase(); if (/disapprov|fail|reject|denied/.test(t)) return 'Failed'; if (/partial|correction|incomplete/.test(t)) return 'Partial'; if (/pass|approv/.test(t)) return 'Passed'; return 'Other' }
const toDate = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10) }
let added = 0, skipped = 0, unmatched = 0
for (const p of blob.roster) {
  const ps = blob.projects[p.id]; if (!ps) continue
  const target = byParcel[p.parcel.trim()]
  for (const x of ps.inspections) {
    if (existing.has(x.sourceKey)) { skipped++; continue }
    if (!target) { unmatched++; continue }
    const vals = { [I.Result]: { label: result(x.status) }, [I['Source Key']]: x.sourceKey, [I.Property]: { item_ids: [Number(target.id)] } }
    const d = toDate(x.date); if (d) vals[I.Date] = { date: d }
    if (x.dismissed) vals[I.Dismissed] = { checked: 'true' }
    const name = `${(x.desc || 'Inspection').slice(0, 80)}${x.status ? ' — ' + x.status : ''} — ${p.address}`
    await mondayQuery(`mutation ($b: ID!, $g: String!, $n: String!, $v: JSON!) { create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$v) { id } }`, { b: String(ib), g: created.groups.Inspections, n: name.slice(0, 255), v: JSON.stringify(vals) })
    added++
  }
}
console.log({ added, skipped, unmatched })
