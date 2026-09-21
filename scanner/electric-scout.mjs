/**
 * electric-scout.mjs — "which electric company serves this lot?" for Monday
 * rows, answered by Marion County's GIS instead of phone calls.
 *
 * This is the Monday-side twin of the app's ⚡ Verify button
 * (src/lib/territoryLookup.ts) and deliberately uses the same three county
 * layers and the same 1-mile seam-caution rule, so the two never disagree:
 *
 *   1. Locate the lot by PARCEL NUMBER (ParcelCentroids knows vacant "TBD"
 *      lots the big geocoders miss), falling back to the address locator.
 *   2. Point-query the Electric Service Areas polygons at that spot.
 *   3. Re-ask within a mile — if another provider is that close the lot sits
 *      near a territorial seam and the answer is flagged to double-check.
 *      (That seam is exactly how SECO once bounced 14845 SW 77th Ave.)
 *
 *   node electric-scout.mjs                       # dry run, Pre-Permitting group
 *   node electric-scout.mjs --apply
 *   node electric-scout.mjs --group "Permitting"
 *   node electric-scout.mjs --parcel 1801-006-013 # just one, no board write
 *   node electric-scout.mjs --all                 # include rows that already have a company
 *
 * FILL-ONLY: a row that already names an electric company is left alone
 * unless you pass --all. Seam-flagged answers are reported but NOT written
 * without --apply-cautious, because near a seam the map is not survey-grade.
 */
import { mondayQuery, CJL_BOARD_ID } from './monday.mjs'
import { scoutElectric, metresToFeet, SEAM_CLOSE_METERS } from '../api/_gis.js'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f) => (has(f) ? args[args.indexOf(f) + 1] : undefined)
const APPLY = has('--apply') || has('--apply-cautious')
const WRITE_CAUTIOUS = has('--apply-cautious')
const ALL = has('--all')
const GROUP = opt('--group') ?? 'Pre-Permitting'
const ONE = opt('--parcel')

const M_ELECTRIC_COL = 'color_mm6t88t4'   // Monday "Electric Co." (status)

/* The GIS lookup itself lives in api/_gis.js so this sweep and the Monday
   webhook (api/electric-scout.js) can never drift apart. */

/* ==================== one-off lookup ==================== */
if (ONE) {
  const r = await scoutElectric({ parcel: ONE })
  console.log(JSON.stringify(r, null, 1))
  process.exit(r.ok ? 0 : 1)
}

/* ==================== board sweep ==================== */
const groups = (await mondayQuery(`query { boards(ids: ${CJL_BOARD_ID}) { groups { id title } } }`)).boards[0].groups
const group = groups.find((g) => g.title.toLowerCase() === GROUP.toLowerCase())
if (!group) { console.error(`No group "${GROUP}". Groups: ${groups.map((g) => g.title).join(', ')}`); process.exit(1) }
const items = (await mondayQuery(
  `query { boards(ids: ${CJL_BOARD_ID}) { groups(ids: ["${group.id}"]) { items_page(limit: 500) { items { id name column_values { text column { title } } } } } } }`
)).boards[0].groups[0].items_page.items
const cell = (it, t) => (it.column_values.find((c) => c.column.title === t)?.text || '').trim()

const todo = items.filter((it) => ALL || !cell(it, 'Electric Co.'))
console.log(`${GROUP}: ${items.length} rows · ${todo.length} without an electric company${ALL ? ' (--all: including filled)' : ''}\n`)

const writes = [], cautious = [], failed = []
for (const it of todo) {
  const parcel = cell(it, 'Parcel ID')
  const r = await scoutElectric({ parcel, address: it.name })
  if (!r.ok) { failed.push({ it, parcel, why: r.why }); console.log(`  ?  ${parcel.padEnd(14)} ${it.name.padEnd(26)} — ${r.why}`); continue }
  const label = r.code ?? r.provider
  const close = r.close   // seam within SEAM_CLOSE_METERS, or the check was short
  const flag = r.seamUnknown ? '  ⚠ seam check inconclusive'
    : r.seam ? `  ${close ? '⚠' : '·'} ${r.seam.join('/')} ~${metresToFeet(r.seamAt)} ft away` : ''
  console.log(`  ${close || r.seamUnknown ? '~' : '✓'}  ${parcel.padEnd(14)} ${it.name.padEnd(26)} ${label}${flag}`)
  ;(close || r.seamUnknown ? cautious : writes).push({ it, parcel, label, r })
}

console.log(`\n${writes.length} confident · ${cautious.length} need a look (seam within ~820 ft, or inconclusive) · ${failed.length} not located`)
if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply (add --apply-cautious to write the seam-flagged ones too).'); process.exit(0) }

const toWrite = WRITE_CAUTIOUS ? [...writes, ...cautious] : writes
let n = 0
for (const w of toWrite) {
  await mondayQuery(
    `mutation ($v: String!) { change_simple_column_value(board_id: ${CJL_BOARD_ID}, item_id: ${w.it.id}, column_id: "${M_ELECTRIC_COL}", value: $v, create_labels_if_missing: true) { id } }`,
    { v: w.label })
  n++
}
console.log(`\n✓ wrote ${n} electric company/companies to Monday${!WRITE_CAUTIOUS && cautious.length ? ` (${cautious.length} seam-flagged left for you)` : ''}`)
