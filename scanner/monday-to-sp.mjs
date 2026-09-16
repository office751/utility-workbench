/**
 * monday-to-sp.mjs — copy items from a Monday board group into the
 * "Construction Job List" SharePoint list (Sep 2026).
 *
 * We are mid-migration to Monday, but Adam still wants the SharePoint list
 * kept current, so this pushes the lots that only exist on Monday over to SP.
 *
 *   node monday-to-sp.mjs                       # dry run (default), shows what it would add
 *   node monday-to-sp.mjs --apply               # actually create the rows
 *   node monday-to-sp.mjs --group "Dead Lots"   # a different board group
 *
 * ADD-ONLY and dedupe-safe: a Monday item whose Parcel ID (or, with no
 * parcel, whose address) already exists on the list is SKIPPED — existing
 * SharePoint rows are never modified. Nothing is ever deleted.
 *
 * Creds: MONDAY_API_Token + GRAPH_* in scanner/.env.
 */
import { readFileSync } from 'node:fs'
import { mondayQuery, CJL_BOARD_ID } from './monday.mjs'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const GROUP = (args[args.indexOf('--group') + 1] && args.includes('--group')) ? args[args.indexOf('--group') + 1] : 'Pre-Permitting'

const SITE_HOST = 'netorg13901770.sharepoint.com'
const SITE_PATH = '/sites/ProcesstoBuildingaHouse'
const LIST_NAME = 'Construction Job List'

/** Monday column title → SharePoint internal field name.
 *  Monday-only UI columns (County Map, Project Docs Link, the button columns)
 *  have no SP equivalent and are left out on purpose. "Project Docs" is a
 *  SharePoint hyperlink field, which Graph cannot write — leave it blank. */
const MAP = {
  'Parcel ID': 'field_3',
  City: 'field_1',
  Zipcode: 'Zipcode',
  Subdivision: 'field_9',
  'House Model': 'field_2',
  Owner: 'field_7',
  'Purchased?': 'field_6',
  'Permit Status': 'field_5',      // SP calls it "Permit Issued?" (same choices)
  Survey: 'field_23',
  'Site Plan': 'field_24',
  'Soil Test': 'field_25',
  NOC: 'field_28',
  'Septic/Sewer': 'field_22',
  'Water/Well': 'field_21',
  'Well Drilled?': 'WellDrilled_x003f_',
  'Electric Co.': 'field_14',
  Blueprints: 'Blueprints',
  'Job-Site Paperwork': 'Job_x002d_SitePaperwork',
  'Septic Permit': 'field_31',
  'Flood Zone': 'field_27',
  Notes: 'field_35',
  'Final Inspections': 'FinalInspections',
}

// ---- Graph ---------------------------------------------------------------
const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const gv = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const tokRes = await fetch(`https://login.microsoftonline.com/${gv('GRAPH_TENANT_ID')}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: gv('GRAPH_CLIENT_ID'), client_secret: gv('GRAPH_CLIENT_SECRET'),
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  }),
})
const tok = await tokRes.json()
if (!tokRes.ok) { console.error(`token: ${tokRes.status} ${tok.error}`); process.exit(1) }
const g = async (path, init) => {
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
    ...init, headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json', ...init?.headers },
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${res.status} ${JSON.stringify(j.error || j)}`)
  return j
}

const site = await g(`/sites/${SITE_HOST}:${SITE_PATH}`)
const lists = await g(`/sites/${site.id}/lists?$select=id,displayName`)
const list = lists.value.find((l) => l.displayName === LIST_NAME)
if (!list) { console.error(`No list named "${LIST_NAME}"`); process.exit(1) }

const spRows = []
let url = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=200`
while (url) { const j = await g(url); spRows.push(...j.value); url = j['@odata.nextLink'] }

// ---- Monday --------------------------------------------------------------
const groups = (await mondayQuery(`query { boards(ids: ${CJL_BOARD_ID}) { groups { id title } } }`)).boards[0].groups
const group = groups.find((gr) => gr.title.toLowerCase() === GROUP.toLowerCase())
if (!group) { console.error(`No group "${GROUP}". Groups: ${groups.map((x) => x.title).join(', ')}`); process.exit(1) }
const items = (await mondayQuery(
  `query { boards(ids: ${CJL_BOARD_ID}) { groups(ids: ["${group.id}"]) { items_page(limit: 500) { items { name column_values { text column { title } } } } } } }`
)).boards[0].groups[0].items_page.items

// ---- diff ----------------------------------------------------------------
const norm = (s) => String(s ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase()
const byParcel = new Set(spRows.map((r) => norm(r.fields.field_3)).filter(Boolean))
const byAddr = new Set(spRows.map((r) => norm(r.fields.Title)))

const toAdd = []
for (const it of items) {
  const cv = Object.fromEntries(it.column_values.map((c) => [c.column.title, (c.text ?? '').trim()]))
  const parcel = norm(cv['Parcel ID'])
  if (parcel ? byParcel.has(parcel) : byAddr.has(norm(it.name))) {
    console.log(`  skip (already on the list)  ${it.name}${cv['Parcel ID'] ? ` [${cv['Parcel ID']}]` : ''}`)
    continue
  }
  // The list's "Final Inspections" column defaults to [today], which would
  // stamp a bogus inspection date on every new lot — send null unless Monday
  // actually has a date.
  const fields = { Title: it.name, FinalInspections: null }
  for (const [mCol, spField] of Object.entries(MAP)) {
    const v = cv[mCol]
    if (!v) continue
    fields[spField] = spField === 'FinalInspections' ? new Date(v + 'T00:00:00Z').toISOString() : v
  }
  toAdd.push({ name: it.name, parcel: cv['Parcel ID'] || '', fields })
}

console.log(`\n${GROUP}: ${items.length} on Monday · ${items.length - toAdd.length} already on SharePoint · ${toAdd.length} to add`)
for (const r of toAdd) console.log(`  + ${r.name.padEnd(30)} ${r.parcel.padEnd(14)} ${Object.keys(r.fields).length} fields`)

if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply to create these rows.'); process.exit(0) }

let ok = 0
for (const r of toAdd) {
  try {
    await g(`/sites/${site.id}/lists/${list.id}/items`, { method: 'POST', body: JSON.stringify({ fields: r.fields }) })
    ok++
    console.log(`  ✓ added ${r.name} ${r.parcel}`)
  } catch (e) {
    console.error(`  ✗ FAILED ${r.name} ${r.parcel}: ${e.message}`)
  }
}
console.log(`\nDone — ${ok}/${toAdd.length} rows added to "${LIST_NAME}".`)
