// Step 1 (Sep 2026): shape the Orders / Inspections / Vendors boards and add
// connect-boards columns. Deletes the default Person/Status/Date columns that
// every new Monday board starts with. Safe to re-run: skips columns that exist.
import { readFileSync, writeFileSync } from 'node:fs'
import { mondayQuery, CJL_BOARD_ID } from './monday.mjs'
const S = process.argv[2]
const created = JSON.parse(readFileSync(`${S}/monday-created.json`, 'utf8'))
const B = created.boards
const q = (s, v) => mondayQuery(s, v)
async function columnsOf(boardId) { return (await q(`{ boards(ids:[${boardId}]) { columns { id title type } } }`)).boards[0].columns }
async function ensure(boardId, title, type, defaults) {
  const have = (await columnsOf(boardId)).find(c => c.title === title)
  if (have) return have.id
  // The API cannot create connect-boards columns (Sep 2026) — those are added by hand in the UI.
  if (type === 'board_relation') { console.log('  ! add by hand in the UI: Connect boards column', JSON.stringify(title), '->', defaults.boardIds); return null }
  const d = await q(`mutation ($b: ID!, $t: String!, $ty: ColumnType!, $df: JSON) { create_column(board_id:$b, title:$t, column_type:$ty, defaults:$df) { id } }`, { b: String(boardId), t: title, ty: type, df: defaults ? JSON.stringify(defaults) : null })
  console.log('  +', title, d.create_column.id); return d.create_column.id
}
async function dropDefaults(boardId) {
  for (const c of await columnsOf(boardId)) if (['Person','Status','Date'].includes(c.title) && ['people','status','date'].includes(c.type)) { await q(`mutation { delete_column(board_id:${boardId}, column_id:"${c.id}") { id } }`); console.log('  - removed default', c.title) }
}
const ids = { Orders: {}, Inspections: {}, Vendors: {}, CJL: {} }
console.log('Vendors'); await dropDefaults(B.Vendors)
for (const [t, ty, df] of [['Contact','text'],['Email','email'],['CC','text'],['Phone','phone'],['Website','link'],['Supplies','text'],['Order Categories','text'],['Finish Trade','checkbox'],['Lodestar Id','text']]) ids.Vendors[t] = await ensure(B.Vendors, t, ty, df)
console.log('Orders'); await dropDefaults(B.Orders)
ids.Orders.Property = await ensure(B.Orders, 'Property', 'board_relation', { boardIds: [CJL_BOARD_ID] })
ids.Orders.Status = await ensure(B.Orders, 'Status', 'status', { labels: { 0: 'To order', 1: 'Ordered', 2: 'Delivered', 3: 'Installed' } })
for (const [t, ty] of [['Ordered On','date'],['Needed By','date'],['Lead Time (days)','numbers'],['Note','text'],['Lodestar Id','text']]) ids.Orders[t] = await ensure(B.Orders, t, ty)
ids.Orders.Vendor = await ensure(B.Orders, 'Vendor', 'board_relation', { boardIds: [B.Vendors] })
console.log('Inspections'); await dropDefaults(B.Inspections)
ids.Inspections.Property = await ensure(B.Inspections, 'Property', 'board_relation', { boardIds: [CJL_BOARD_ID] })
ids.Inspections.Result = await ensure(B.Inspections, 'Result', 'status', { labels: { 0: 'Failed', 1: 'Partial', 2: 'Passed', 3: 'Other' } })
for (const [t, ty] of [['Date','date'],['Source Key','text'],['Dismissed','checkbox']]) ids.Inspections[t] = await ensure(B.Inspections, t, ty)
console.log('Construction Job List')
ids.CJL.Orders = await ensure(CJL_BOARD_ID, 'Orders', 'board_relation', { boardIds: [B.Orders] })
ids.CJL.Inspections = await ensure(CJL_BOARD_ID, 'Inspections', 'board_relation', { boardIds: [B.Inspections] })
created.ids = ids; writeFileSync(`${S}/monday-created.json`, JSON.stringify(created, null, 1))
console.log('done')
