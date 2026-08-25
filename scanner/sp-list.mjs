/**
 * sp-list.mjs — read / edit cells on the "Construction Job List" SharePoint
 * list (or any list on the ProcesstoBuildingaHouse site) from the terminal.
 *
 * Adam authorized SharePoint list edits (Aug 25 2026) — this is the ONE
 * sanctioned way to write them: one cell at a time, by address, with the
 * before value printed. Bulk/fill-only jobs stay in sync-sharepoint.mjs and
 * pull-septic-permits.mjs.
 *
 *   node sp-list.mjs columns                       # list the editable columns
 *   node sp-list.mjs get "27 Laurel Dr"            # show a row's filled cells
 *   node sp-list.mjs set "27 Laurel Dr" --column "INRB Form (NOT)" --value "Recorded"
 *
 * Options: --list "<display name>" targets another list on the site
 *          (default "Construction Job List").
 *
 * Row matching: case-insensitive on the row's Title (the street address);
 * a unique substring works ("laurel"). Column matching: exact display name
 * first, then a unique case-insensitive substring.
 *
 * Creds: GRAPH_* app-only credentials in scanner/.env (same as the sync).
 */
import { readFileSync } from 'node:fs'

const SITE_HOST = 'netorg13901770.sharepoint.com'
const SITE_PATH = '/sites/ProcesstoBuildingaHouse'
const DEFAULT_LIST = 'Construction Job List'

// ---- args ------------------------------------------------------------
const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const positional = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && arr[i - 1]?.startsWith('--') !== true)
const rowQuery = positional[0]
const LIST_NAME = opt('--list') ?? DEFAULT_LIST

if (!['columns', 'get', 'set'].includes(cmd)) {
  console.log('Usage:\n  node sp-list.mjs columns\n  node sp-list.mjs get "<address>"\n  node sp-list.mjs set "<address>" --column "<display name>" --value "<new value>"')
  process.exit(cmd ? 1 : 0)
}

// ---- env + Graph -------------------------------------------------------
const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const TENANT = get('GRAPH_TENANT_ID')
const CLIENT_ID = get('GRAPH_CLIENT_ID')
const CLIENT_SECRET = get('GRAPH_CLIENT_SECRET')
if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GRAPH_* credentials in scanner/.env')
  process.exit(1)
}

const tokRes = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  }),
})
const tok = await tokRes.json()
if (!tokRes.ok) { console.error(`token: ${tokRes.status} ${tok.error}`); process.exit(1) }
const TOKEN = tok.access_token

const g = async (path, init) => {
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init?.headers },
  })
  if (init?.method === 'PATCH' && res.ok) return null
  const j = await res.json()
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${res.status} ${JSON.stringify(j.error || j)}`)
  return j
}

// ---- resolve site → list → columns -------------------------------------
const site = await g(`/sites/${SITE_HOST}:${SITE_PATH}`)
const lists = await g(`/sites/${site.id}/lists?$select=id,displayName`)
const list = lists.value.find((l) => l.displayName === LIST_NAME)
if (!list) {
  console.error(`No list named "${LIST_NAME}". Lists: ${lists.value.map((l) => l.displayName).join(', ')}`)
  process.exit(1)
}
const cols = await g(`/sites/${site.id}/lists/${list.id}/columns?$select=name,displayName,readOnly&$top=200`)
const editable = cols.value.filter((c) => !c.readOnly)

if (cmd === 'columns') {
  console.log(`Editable columns on "${LIST_NAME}":`)
  for (const c of editable) console.log(`  ${c.displayName.trim()}`)
  process.exit(0)
}

// ---- find the row -------------------------------------------------------
if (!rowQuery) { console.error('Give me the address (or a unique part of it).'); process.exit(1) }
const rows = []
let url = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=200`
while (url) {
  const j = await g(url)
  rows.push(...j.value)
  url = j['@odata.nextLink']
}
const q = rowQuery.trim().toLowerCase()
const hits = rows.filter((r) => String(r.fields?.Title ?? '').toLowerCase().includes(q))
if (hits.length !== 1) {
  console.error(hits.length === 0
    ? `No row's address contains "${rowQuery}".`
    : `"${rowQuery}" matches ${hits.length} rows — be more specific:\n` + hits.map((h) => `  ${h.fields.Title}`).join('\n'))
  process.exit(1)
}
const row = hits[0]

if (cmd === 'get') {
  console.log(`Row: ${row.fields.Title}`)
  const internalToDisplay = Object.fromEntries(cols.value.map((c) => [c.name, c.displayName.trim()]))
  for (const [k, v] of Object.entries(row.fields)) {
    if (v == null || v === '' || k.startsWith('@') || k.startsWith('_')) continue
    if (['id', 'ContentType', 'Modified', 'Created', 'AuthorLookupId', 'EditorLookupId', 'Edit',
         'LinkTitleNoMenu', 'LinkTitle', 'ItemChildCount', 'FolderChildCount', 'AppAuthorLookupId',
         'AppEditorLookupId', 'Attachments', 'ComplianceAssetId'].includes(k)) continue
    console.log(`  ${(internalToDisplay[k] ?? k).padEnd(44)} ${JSON.stringify(v)}`)
  }
  process.exit(0)
}

// ---- set ----------------------------------------------------------------
const colQuery = opt('--column')
const value = opt('--value')
if (!colQuery || value === undefined) {
  console.error('set needs --column "<display name>" and --value "<new value>"')
  process.exit(1)
}
let col = editable.find((c) => c.displayName.trim() === colQuery.trim())
if (!col) {
  const cands = editable.filter((c) => c.displayName.trim().toLowerCase().includes(colQuery.trim().toLowerCase()))
  if (cands.length !== 1) {
    console.error(cands.length === 0
      ? `No editable column matches "${colQuery}". Run "node sp-list.mjs columns" to see them.`
      : `"${colQuery}" matches ${cands.length} columns: ${cands.map((c) => c.displayName.trim()).join(' · ')}`)
    process.exit(1)
  }
  col = cands[0]
}

const before = row.fields[col.name]
await g(`/sites/${site.id}/lists/${list.id}/items/${row.id}/fields`, {
  method: 'PATCH',
  body: JSON.stringify({ [col.name]: value }),
})
const check = await g(`/sites/${site.id}/lists/${list.id}/items/${row.id}?expand=fields($select=Title,${col.name})`)
console.log(`✓ ${row.fields.Title} · ${col.displayName.trim()}: ${JSON.stringify(before ?? '')} → ${JSON.stringify(check.fields[col.name] ?? '')}`)
