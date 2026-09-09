// Sep 2026: create + seed the "Runbook Template" board — the editable source of
// the per-house checklist the Monday Runbook view builds. One item per step:
//   Stage (status) · Order (number) · Step Key (text, stable id — DON'T edit)
//   Applies to (dropdown: which lots get the step) · Tip (text shown under the step)
// Seeded from Lodestar's data/lifecycles.ts so both apps start identical.
// Idempotent: re-running adds only missing step keys.
import { readFileSync, writeFileSync } from 'node:fs'
import { mondayQuery } from './monday.mjs'

const S = process.argv[2]
const created = JSON.parse(readFileSync(`${S}/monday-created.json`, 'utf8'))
const src = readFileSync(new URL('../src/data/lifecycles.ts', import.meta.url), 'utf8')
const arr = (name) => {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\]`))
  const out = []
  for (const x of (m?.[1] || '').matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'((?:[^'\\]|\\.)*)'(?:,\s*wmOnly:\s*true)?\s*\}/g)) out.push({ id: x[1], label: x[2].replace(/\\'/g, "'"), wm: x[0].includes('wmOnly') })
  return out
}
const APPLIES = { ALL: 'All lots', WELL: 'Well', CITY: 'City water', CITYWM: 'City water + main extension', SEPTIC: 'Septic', INRB: 'Septic — INRB only', SEWER: 'Sewer' }
const rows = []
let order = 0
const push = (stage, s, applies, tip = '') => rows.push({ stage, order: ++order, key: s.id, label: s.label, applies, tip })
for (const s of arr('PERMIT_STEPS')) push('Permit', s, [APPLIES.ALL], s.id === 'corrections' ? 'Optional — only if the county asks for corrections.' : '')
for (const s of arr('ELECTRIC_STEPS')) push('Electric', s, [APPLIES.ALL])
for (const s of arr('WATER_STEPS_WELL')) push('Water', s, [APPLIES.WELL])
for (const s of arr('WATER_STEPS_CITY')) push('Water', s, s.wm ? [APPLIES.CITYWM] : [APPLIES.CITY, APPLIES.CITYWM])
for (const s of arr('SEPTIC_STEPS')) push('Septic', s, s.id === 'snrb' ? [APPLIES.INRB] : [APPLIES.SEPTIC, APPLIES.INRB])
for (const s of arr('SEWER_STEPS')) push('Septic', s, [APPLIES.SEWER])
for (const s of arr('CLOSING_STEPS')) push('Closing', s, [APPLIES.ALL], s.id === 'wstop' ? 'City-water lots only in practice — a well has no account to disconnect.' : '')
console.log('template rows from lifecycles.ts:', rows.length)

// --- board ---
let boardId = created.boards['Runbook Template']
if (!boardId) {
  const d = await mondayQuery(`mutation { create_board(board_name:"Runbook Template", board_kind: public, workspace_id:${created.workspace}, description:"The checklist every house gets. Edit step names, order and 'Applies to' here; the Runbook tab on each property reads this board. Step Key is the stable id — leave it alone.") { id } }`)
  boardId = d.create_board.id; created.boards['Runbook Template'] = boardId; console.log('created board', boardId)
}
const cols = async () => (await mondayQuery(`{ boards(ids:[${boardId}]) { columns { id title type } groups { id title } items_page(limit:20) { items { id name } } } }`)).boards[0]
let b = await cols()
for (const it of b.items_page.items) if (it.name === 'Task 1') { await mondayQuery(`mutation { delete_item(item_id:${it.id}) { id } }`); console.log('removed Task 1') }
for (const c of b.columns) if (['Person', 'Status', 'Date'].includes(c.title) && ['people', 'status', 'date'].includes(c.type)) await mondayQuery(`mutation { delete_column(board_id:${boardId}, column_id:"${c.id}") { id } }`)
async function ensure(title, type, defaults) {
  b = await cols(); const have = b.columns.find((c) => c.title === title); if (have) return have.id
  const d = await mondayQuery(`mutation ($b: ID!, $t: String!, $ty: ColumnType!, $df: JSON) { create_column(board_id:$b, title:$t, column_type:$ty, defaults:$df) { id } }`, { b: String(boardId), t: title, ty: type, df: defaults ? JSON.stringify(defaults) : null })
  console.log('  + column', title, d.create_column.id); return d.create_column.id
}
const C = {
  stage: await ensure('Stage', 'status', { labels: { 0: 'Permit', 1: 'Electric', 2: 'Water', 3: 'Septic', 4: 'Closing' } }),
  order: await ensure('Order', 'numbers'),
  applies: await ensure('Applies to', 'dropdown', { settings: { labels: Object.values(APPLIES).map((name, i) => ({ id: i + 1, name })) } }),
  tip: await ensure('Tip', 'long_text'),
  key: await ensure('Step Key', 'text'),
}
// groups: one per stage so the board reads top-to-bottom like the runbook
b = await cols()
const groupIds = {}
for (const stage of ['Permit', 'Electric', 'Water', 'Septic', 'Closing']) {
  let g = b.groups.find((g) => g.title === stage)
  if (!g) { const d = await mondayQuery(`mutation { create_group(board_id:${boardId}, group_name:"${stage}") { id } }`); g = { id: d.create_group.id }; console.log('  + group', stage) }
  groupIds[stage] = g.id
}
const stale = b.groups.find((g) => g.title === 'Group Title'); if (stale) await mondayQuery(`mutation { delete_group(board_id:${boardId}, group_id:"${stale.id}") { id } }`)
// seed
const have = new Set((await mondayQuery(`{ boards(ids:[${boardId}]) { items_page(limit:200) { items { column_values(ids:["${C.key}"]) { text } } } } }`)).boards[0].items_page.items.map((i) => i.column_values[0].text))
let added = 0
for (const r of rows) {
  if (have.has(r.key)) continue
  const vals = { [C.stage]: { label: r.stage }, [C.order]: String(r.order), [C.key]: r.key, [C.applies]: { labels: r.applies } }
  if (r.tip) vals[C.tip] = { text: r.tip }
  await mondayQuery(`mutation ($b: ID!, $g: String!, $n: String!, $v: JSON!) { create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$v, create_labels_if_missing:true) { id } }`, { b: String(boardId), g: groupIds[r.stage], n: r.label, v: JSON.stringify(vals) })
  added++
}
created.ids['Runbook Template'] = C
writeFileSync(`${S}/monday-created.json`, JSON.stringify(created, null, 1))
console.log({ boardId, columns: C, added })
