// Sep 2026: start the Runbook on every active house (Pre-Permitting + Active -
// Under Construction groups) — creates the template's subitems per house using
// the same Applies-to rules as the Runbook view. Idempotent: a house that
// already has keyed subitems only gets the steps it's missing.
import { mondayQuery } from './monday.mjs'
const CJL = 18429393869, TEMPLATE = 18430320313, SUB_BOARD = 18429428473
const GROUPS = ['group_mm70nwy1', 'topics', 'group_mm70ah30'] // Pre-Permitting, Permitting, Active - Under Construction
const COL = { water: 'color_mm6t99zg', septic: 'color_mm6txs82', inrb: 'color_mm6t6n' }
const TCOL = { stage: 'color_mm71eac2', order: 'numeric_mm71jmpr', applies: 'dropdown_mm71c4gw', key: 'text_mm71pvdw' }
const SUB = { stage: 'color_mm70zk6q', key: 'text_mm70crak', order: 'numeric_mm70fn0g' }
const dry = !process.argv.includes('--write')

const t = (await mondayQuery(`{ boards(ids:[${TEMPLATE}]) { items_page(limit:200) { items { name column_values { id text } } } } }`)).boards[0].items_page.items
  .map((i) => { const cv = Object.fromEntries(i.column_values.map((c) => [c.id, c.text ?? ''])); return { label: i.name, key: cv[TCOL.key].trim(), stage: cv[TCOL.stage].trim(), order: Number(cv[TCOL.order]) || 0, applies: cv[TCOL.applies].split(',').map((x) => x.trim()).filter(Boolean) } })
  .filter((r) => r.key).sort((a, b) => a.order - b.order)
console.log('template steps:', t.length)

function profile(water, septic, inrb) {
  const set = new Set(['All lots'])
  if (/wm|main ext/i.test(water)) { set.add('City water'); set.add('City water + main extension') } else if (/city|fgua/i.test(water)) set.add('City water'); else if (/well/i.test(water)) set.add('Well')
  if (/sewer/i.test(septic)) set.add('Sewer'); else { set.add('Septic'); if (inrb && !/atu|n\/?a/i.test(inrb)) set.add('Septic — INRB only') }
  return set
}
let houses = []
for (const g of GROUPS) {
  let cursor = null
  do {
    const q = cursor ? `{ next_items_page(limit:100, cursor:"${cursor}") { cursor items { id name column_values(ids:["${COL.water}","${COL.septic}","${COL.inrb}"]) { id text } subitems { column_values(ids:["${SUB.key}"]) { text } } } } }`
                     : `{ boards(ids:[${CJL}]) { groups(ids:["${g}"]) { items_page(limit:100) { cursor items { id name column_values(ids:["${COL.water}","${COL.septic}","${COL.inrb}"]) { id text } subitems { column_values(ids:["${SUB.key}"]) { text } } } } } } }`
    const d = await mondayQuery(q); const p = cursor ? d.next_items_page : d.boards[0].groups[0].items_page
    houses.push(...p.items); cursor = p.cursor
  } while (cursor)
}
console.log('active houses:', houses.length)
let planned = 0, created = 0, skippedHouses = 0
const work = []
for (const h of houses) {
  const cv = Object.fromEntries(h.column_values.map((c) => [c.id, c.text ?? '']))
  const prof = profile(cv[COL.water], cv[COL.septic], cv[COL.inrb])
  const have = new Set((h.subitems || []).map((s) => s.column_values[0].text).filter(Boolean))
  const need = t.filter((r) => (!r.applies.length || r.applies.some((a) => prof.has(a))) && !have.has(r.key))
  if (!need.length) { skippedHouses++; continue }
  planned += need.length
  work.push({ h, need })
  console.log(`${h.name}: +${need.length} steps (${[...prof].filter((x) => x !== 'All lots').join(', ') || 'no water/septic set'})`)
}
console.log({ housesNeedingSteps: work.length, skippedHouses, planned, mode: dry ? 'DRY RUN (add --write)' : 'WRITE' })
if (dry) process.exit(0)
// 4 houses at a time; each house's steps stay sequential so Order is respected
const runHouse = async ({ h, need }) => {
  for (const r of need) {
    const vals = { [SUB.key]: r.key, [SUB.order]: String(r.order) }; if (r.stage) vals[SUB.stage] = { label: r.stage }
    await mondayQuery(`mutation ($p: ID!, $n: String!, $v: JSON!) { create_subitem(parent_item_id:$p, item_name:$n, column_values:$v) { id } }`, { p: String(h.id), n: r.label, v: JSON.stringify(vals) })
    created++
  }
  console.log('done', h.name, need.length)
}
for (let i = 0; i < work.length; i += 4) await Promise.all(work.slice(i, i + 4).map(runHouse))
console.log('created subitems:', created)
