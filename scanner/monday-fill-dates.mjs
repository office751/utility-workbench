// Step 2 (Sep 2026): fill Permit Issued / Permit Expires / Closing Date on the
// Construction Job List from Lodestar (typed override → county portal date).
// Matches by parcel, falling back to address for shared-parcel twins. Idempotent.
import { readFileSync } from 'node:fs'
import { mondayQuery, CJL_BOARD_ID } from './monday.mjs'
const S = process.argv[2]
const created = JSON.parse(readFileSync(`${S}/monday-created.json`, 'utf8'))
const dates = Object.values(JSON.parse(readFileSync(`${S}/lodestar-dates.json`, 'utf8')))
const mItems = JSON.parse(readFileSync(`${S}/monday-items.json`, 'utf8'))
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const byParcel = {}; for (const i of mItems) (byParcel[i.parcel.trim()] ||= []).push(i)
const target = (p) => { const c = byParcel[p.parcel.trim()] || []; if (c.length === 1) return c[0]; return c.find(i => norm(i.name) === norm(p.address)) || mItems.find(i => norm(i.name) === norm(p.address)) }
const iso = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10) }
const C = created.step2
let n = 0, miss = []
for (const p of dates) {
  const vals = {}
  if (iso(p.issued)) vals[C['Permit Issued']] = { date: iso(p.issued) }
  if (iso(p.expires)) vals[C['Permit Expires']] = { date: iso(p.expires) }
  if (iso(p.closing)) vals[C['Closing Date']] = { date: iso(p.closing) }
  if (!Object.keys(vals).length) continue
  const t = target(p); if (!t) { miss.push(p.address); continue }
  await mondayQuery(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id:$b, item_id:$i, column_values:$v) { id } }`, { b: String(CJL_BOARD_ID), i: t.id, v: JSON.stringify(vals) })
  n++
}
console.log('updated', n, 'unmatched:', miss.join(' | ') || 'none')
