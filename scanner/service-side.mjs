/**
 * One-off (Sep 21 2026): add an "Electric Service Side" column to the Monday
 * CJL board and the SharePoint Construction Job List, then write in the 26
 * answers Pam brought back from the Rainbow Lakes drive-by.
 *
 *   node service-side.mjs            # dry run
 *   node service-side.mjs --apply
 *
 * Text (not a Left/Right dropdown) on purpose: the two parcels being split
 * carry a per-future-lot answer, which a two-label status column can't hold.
 */
import { readFileSync } from 'node:fs'
import { mondayQuery, CJL_BOARD_ID } from '/Users/Construction/Documents/Claude/Projects/Lodestar/construction-lodestar/scanner/monday.mjs'

const APPLY = process.argv.includes('--apply')
const COL_TITLE = 'Electric Service Side'

const ANSWERS = {
  '1801-006-013': 'Left',
  '1801-010-030': 'Left',
  '1801-010-022': 'Left',
  '1801-015-034': 'Right',
  '1801-024-010': 'Left',
  '1802-003-037': 'Left',
  '1802-004-030': 'Right',
  '1802-002-004': 'Left',
  '1802-005-016': 'Right',
  '1802-002-035': 'Right',
  '1804-002-053': 'Right',
  '1804-005-025': 'Right',
  '1804-003-055': 'Right',
  '1804-003-025': 'Right',
  '1804-003-039': 'Left',
  '1805-003-011': 'Lot 11 Left; Lot 12 Right; Lots 13-14 Left',
  '1805-003-018': 'Left',
  '1805-003-035': 'Right',
  '1807-016-044': 'Left',
  '1813-006-016': 'Left',
  '1813-005-028': 'Right',
  '1813-005-030': 'Lot 30 Right; Lot 31 Left',
  '1813-001-016': 'Right',
  '1813-007-029': 'Right',
  '1805-016-020': 'Left',
  '1807-009-016': 'Right',
}

// ---------------- Graph ----------------
const SITE_HOST = 'netorg13901770.sharepoint.com', SITE_PATH = '/sites/ProcesstoBuildingaHouse'
const env = readFileSync('/Users/Construction/Documents/Claude/Projects/Lodestar/construction-lodestar/scanner/.env', 'utf8')
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
const spCols = await g(`/sites/${site.id}/lists/${list.id}/columns?$select=name,displayName&$top=200`)
let spCol = spCols.value.find((c) => c.displayName.trim() === COL_TITLE)

// ---------------- Monday ----------------
const mCols = (await mondayQuery(`query { boards(ids: ${CJL_BOARD_ID}) { columns { id title type } } }`)).boards[0].columns
let mCol = mCols.find((c) => c.title === COL_TITLE)
const groups = (await mondayQuery(`query { boards(ids: ${CJL_BOARD_ID}) { groups { id title } } }`)).boards[0].groups
const gid = groups.find((x) => x.title === 'Pre-Permitting').id
const items = (await mondayQuery(
  `query { boards(ids: ${CJL_BOARD_ID}) { groups(ids: ["${gid}"]) { items_page(limit: 500) { items { id name column_values { text column { title } } } } } } }`
)).boards[0].groups[0].items_page.items

const parcelOf = (it) => (it.column_values.find((c) => c.column.title === 'Parcel ID')?.text || '').trim()
const byParcel = new Map(items.map((it) => [parcelOf(it), it]))

console.log(`Monday column "${COL_TITLE}": ${mCol ? `exists (${mCol.id})` : 'MISSING — will create'}`)
console.log(`SharePoint column "${COL_TITLE}": ${spCol ? `exists (${spCol.name})` : 'MISSING — will create'}`)
const missing = Object.keys(ANSWERS).filter((p) => !byParcel.has(p))
console.log(`${Object.keys(ANSWERS).length} answers · ${missing.length ? 'NOT on Monday: ' + missing : 'all matched on Monday'}`)

if (!APPLY) {
  for (const [p, v] of Object.entries(ANSWERS)) console.log(`  ${p}  ${v}`)
  console.log('\nDry run — nothing written. Re-run with --apply.')
  process.exit(0)
}

// ---- create the columns
if (!mCol) {
  const created = await mondayQuery(
    `mutation { create_column(board_id: ${CJL_BOARD_ID}, title: "${COL_TITLE}", column_type: text, description: "Which side the electric service runs on, facing the lot from the road. Verified in the field.") { id } }`)
  mCol = created.create_column
  console.log(`✓ Monday column created (${mCol.id})`)
}
if (!spCol) {
  // Graph's app-only Sites.ReadWrite.All can read/write list DATA but not list
  // SCHEMA — creating a column comes back 403. Carry on with Monday and report.
  try {
  spCol = await g(`/sites/${site.id}/lists/${list.id}/columns`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'ElectricServiceSide', displayName: COL_TITLE,
      description: 'Which side the electric service runs on, facing the lot from the road. Verified in the field.',
      text: {}, enforceUniqueValues: false, hidden: false, indexed: false,
    }),
  })
  console.log(`✓ SharePoint column created (${spCol.name})`)
  } catch (e) {
    spCol = null
    console.log(`✗ SharePoint column NOT created — ${e.message.includes('accessDenied') ? 'Graph app-only cannot change list schema (403). Add it by hand, then re-run.' : e.message}`)
  }
}

// ---- SharePoint rows
const spRows = []
let url = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=200`
while (url) { const j = await g(url); spRows.push(...j.value); url = j['@odata.nextLink'] }

let mOk = 0, sOk = 0
for (const [parcel, value] of Object.entries(ANSWERS)) {
  const it = byParcel.get(parcel)
  if (it) {
    await mondayQuery(
      `mutation ($v: String!) { change_simple_column_value(board_id: ${CJL_BOARD_ID}, item_id: ${it.id}, column_id: "${mCol.id}", value: $v) { id } }`,
      { v: value })
    mOk++
  }
  const row = spCol && spRows.find((r) => String(r.fields.field_3 || '').trim() === parcel)
  if (row) {
    await g(`/sites/${site.id}/lists/${list.id}/items/${row.id}/fields`, {
      method: 'PATCH', body: JSON.stringify({ [spCol.name]: value }),
    })
    sOk++
  } else if (spCol) {
    console.log(`  ! no SharePoint row for ${parcel}`)
  }
}
console.log(`\nMonday: ${mOk}/${Object.keys(ANSWERS).length} written · SharePoint: ${sOk}/${Object.keys(ANSWERS).length} written`)
