/**
 * service-side.mjs — record the field-verified electric service side for the
 * Rainbow Lakes pre-permitting lots (Pam's Sep 2026 drive-by).
 *
 *   node service-side.mjs            # dry run
 *   node service-side.mjs --apply
 *
 * Adam's format (Sep 21 2026): the side rides in the EXISTING "Electric Type"
 * cell next to OH/UG rather than in a column of its own — `UG : LH`. Where the
 * OH/UG type isn't known yet (all 26 of these lots today) the cell holds just
 * `LH` / `RH`, and gains the `UG : ` prefix when the type is determined.
 *
 * Monday "Electric Type" is a STATUS column, so values arrive as new labels
 * (create_labels_if_missing). SharePoint's "Electric Type?" (field_18) is a
 * choice column with allowTextEntry, so free text is accepted as-is.
 */
import { readFileSync } from 'node:fs'
import { mondayQuery, CJL_BOARD_ID } from './monday.mjs'

const APPLY = process.argv.includes('--apply')
const M_TYPE_COL = 'color_mm6tmnp0'   // Monday "Electric Type" (status: OH / UG)
const SP_TYPE_COL = 'field_18'        // SharePoint "Electric Type?" (choice, free text)

/** Pam's marks, read off the returned sheet. LH = left, RH = right, facing the
 *  lot from the road. The two parcels pending a split answer per future lot. */
const SIDES = {
  '1801-006-013': 'LH',
  '1801-010-030': 'LH',
  '1801-010-022': 'LH',
  '1801-015-034': 'RH',
  '1801-024-010': 'LH',
  '1802-003-037': 'LH',
  '1802-004-030': 'RH',
  '1802-002-004': 'LH',
  '1802-005-016': 'RH',
  '1802-002-035': 'RH',
  '1804-002-053': 'RH',
  '1804-005-025': 'RH',
  '1804-003-055': 'RH',
  '1804-003-025': 'RH',
  '1804-003-039': 'LH',
  '1805-003-011': 'Lot 11 LH; Lot 12 RH; Lots 13-14 LH',
  '1805-003-018': 'LH',
  '1805-003-035': 'RH',
  '1807-016-044': 'LH',
  '1813-006-016': 'LH',
  '1813-005-028': 'RH',
  '1813-005-030': 'Lot 30 RH; Lot 31 LH',
  '1813-001-016': 'RH',
  '1813-007-029': 'RH',
  '1805-016-020': 'LH',
  '1807-009-016': 'RH',
}

/** Split a cell back into its OH/UG type and whatever side is already there,
 *  so re-running never stacks up "OH : LH : LH". */
function parseCell(cell) {
  const v = String(cell ?? '').trim()
  if (!v) return { type: '', side: '' }
  const m = v.match(/^(OH|UG)\s*:\s*(.+)$/i)
  if (m) return { type: m[1].toUpperCase(), side: m[2].trim() }
  if (/^(OH|UG)$/i.test(v)) return { type: v.toUpperCase(), side: '' }
  return { type: '', side: v }            // a bare side, no type known yet
}

/** `UG : LH` when the OH/UG type is known, otherwise just the side. */
const compose = (type, side) => (type ? `${type} : ${side}` : side)

// ---------------- Graph ----------------
const SITE_HOST = 'netorg13901770.sharepoint.com', SITE_PATH = '/sites/ProcesstoBuildingaHouse'
const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const gv = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const tok = await (await fetch(`https://login.microsoftonline.com/${gv('GRAPH_TENANT_ID')}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: gv('GRAPH_CLIENT_ID'), client_secret: gv('GRAPH_CLIENT_SECRET'),
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
})).json()
const g = async (path, init) => {
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`,
    { ...init, headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json', ...init?.headers } })
  if (res.status === 204) return null
  const j = await res.json()
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${res.status} ${JSON.stringify(j.error || j)}`)
  return j
}
const site = await g(`/sites/${SITE_HOST}:${SITE_PATH}`)
const lists = await g(`/sites/${site.id}/lists?$select=id,displayName`)
const list = lists.value.find((l) => l.displayName === 'Construction Job List')
const spRows = []
{ let url = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=200`
  while (url) { const j = await g(url); spRows.push(...j.value); url = j['@odata.nextLink'] } }

// ---------------- Monday ----------------
const groups = (await mondayQuery(`query { boards(ids: ${CJL_BOARD_ID}) { groups { id title } } }`)).boards[0].groups
const gid = groups.find((x) => x.title === 'Pre-Permitting').id
const items = (await mondayQuery(
  `query { boards(ids: ${CJL_BOARD_ID}) { groups(ids: ["${gid}"]) { items_page(limit: 500) { items { id column_values { text column { id title } } } } } } }`
)).boards[0].groups[0].items_page.items
const cellOf = (it, title) => (it.column_values.find((c) => c.column.title === title)?.text || '').trim()
const byParcel = new Map(items.map((it) => [cellOf(it, 'Parcel ID'), it]))

// ---------------- plan ----------------
const plan = []
for (const [parcel, side] of Object.entries(SIDES)) {
  const it = byParcel.get(parcel)
  const row = spRows.find((r) => String(r.fields.field_3 || '').trim() === parcel)
  const mCell = it ? cellOf(it, 'Electric Type') : ''
  const sCell = row ? String(row.fields[SP_TYPE_COL] || '').trim() : ''
  // Either system may be the one that knows OH/UG (the nightly sync fills
  // SharePoint), so take the type from whichever has it and write both the same.
  const type = parseCell(mCell).type || parseCell(sCell).type
  const want = compose(type, side)
  plan.push({ parcel, it, row, mFrom: mCell, mTo: want, sFrom: sCell, sTo: want })
}
for (const p of plan) {
  console.log(`  ${p.parcel}  Monday ${JSON.stringify(p.mFrom)} → ${JSON.stringify(p.mTo)}` +
              `${p.row ? `   SP ${JSON.stringify(p.sFrom)} → ${JSON.stringify(p.sTo)}` : '   SP (no row)'}`)
}
console.log(`\n${plan.length} lots · ${plan.filter((p) => p.it).length} on Monday · ${plan.filter((p) => p.row).length} on SharePoint`)

if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); process.exit(0) }

let m = 0, s = 0
for (const p of plan) {
  if (p.it && p.mFrom !== p.mTo) {
    await mondayQuery(
      `mutation ($v: String!) { change_simple_column_value(board_id: ${CJL_BOARD_ID}, item_id: ${p.it.id}, column_id: "${M_TYPE_COL}", value: $v, create_labels_if_missing: true) { id } }`,
      { v: p.mTo })
    m++
  }
  if (p.row && p.sFrom !== p.sTo) {
    await g(`/sites/${site.id}/lists/${list.id}/items/${p.row.id}/fields`,
      { method: 'PATCH', body: JSON.stringify({ [SP_TYPE_COL]: p.sTo }) })
    s++
  }
}
console.log(`\nMonday: ${m} changed · SharePoint: ${s} changed (of ${plan.length}; unchanged cells skipped)`)
