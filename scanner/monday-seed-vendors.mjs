// Step 1 (Sep 2026): clean the default "Task 1"/"Group Title" on the new boards
// and seed the Vendors board from Lodestar's vendor list. Idempotent by Lodestar Id.
import { readFileSync } from 'node:fs'
import { mondayQuery } from './monday.mjs'
const S = process.argv[2]
const created = JSON.parse(readFileSync(`${S}/monday-created.json`, 'utf8'))
const blob = JSON.parse(readFileSync(`${S}/blob-slice.json`, 'utf8'))
const groupTitle = { Orders: 'Open orders', Inspections: 'Results', Vendors: 'Suppliers' }
for (const [name, id] of Object.entries(created.boards)) {
  const b = (await mondayQuery(`{ boards(ids:[${id}]) { groups { id title } items_page(limit:20) { items { id name } } } }`)).boards[0]
  for (const it of b.items_page.items) if (it.name === 'Task 1') { await mondayQuery(`mutation { delete_item(item_id:${it.id}) { id } }`); console.log(name, '- removed Task 1') }
  const g = b.groups[0]; if (g && g.title === 'Group Title') { await mondayQuery(`mutation { update_group(board_id:${id}, group_id:"${g.id}", group_attribute: title, new_value:"${groupTitle[name]}") { id } }`); console.log(name, '- group renamed', groupTitle[name]) }
  created.groups = created.groups || {}; created.groups[name] = g?.id
}
// Vendors
const V = created.ids.Vendors, vb = created.boards.Vendors
const existing = (await mondayQuery(`{ boards(ids:[${vb}]) { items_page(limit:100) { items { name column_values(ids:["${V['Lodestar Id']}"]) { text } } } } }`)).boards[0].items_page.items.map(i => i.column_values[0].text)
for (const v of blob.vendors) {
  if (existing.includes(v.id)) { console.log('skip (exists)', v.name); continue }
  const vals = { [V.Contact]: v.contact || '', [V.CC]: v.cc || '', [V.Supplies]: v.supplies || '', [V['Order Categories']]: (v.categories || []).join(', '), [V['Lodestar Id']]: v.id, [V['Finish Trade']]: v.finish ? { checked: 'true' } : null }
  if (v.email) vals[V.Email] = { email: v.email, text: v.email }
  if (v.phone) vals[V.Phone] = { phone: v.phone.replace(/[^\d+]/g, ''), countryShortName: 'US' }
  if (v.website) vals[V.Website] = { url: v.website, text: v.website.replace(/^https?:\/\//, '') }
  for (const k of Object.keys(vals)) if (vals[k] === null) delete vals[k]
  await mondayQuery(`mutation ($b: ID!, $g: String!, $n: String!, $v: JSON!) { create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$v) { id } }`, { b: String(vb), g: created.groups.Vendors, n: v.name, v: JSON.stringify(vals) })
  console.log('added vendor', v.name)
}
import { writeFileSync } from 'node:fs'; writeFileSync(`${S}/monday-created.json`, JSON.stringify(created, null, 1))
