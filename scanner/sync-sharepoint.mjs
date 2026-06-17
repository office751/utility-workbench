/**
 * sync-sharepoint.mjs — push electric + core facts from the Workbench into the
 * "Construction Jobs Permitting" SharePoint LIST.
 *
 * Mac-side job (like scan.mjs); NEVER imported by the web app. Reads:
 *   - the Supabase blob  (SUPABASE_URL / SUPABASE_SERVICE_KEY in scanner/.env)
 *   - the SharePoint list (GRAPH_* app-only credentials in scanner/.env)
 *
 * SAFE BY DEFAULT: a DRY RUN that prints every proposed change and writes
 * NOTHING. Pass --apply to actually write. Even with --apply it only FILLS
 * blank / placeholder cells ("TBD…", "Not Applied", "To Type", empty) and
 * REPORTS conflicts (app and list both non-empty and different) instead of
 * overwriting — so it can never clobber a hand-written note.
 *
 *   node sync-sharepoint.mjs            # dry run (preview only)
 *   node sync-sharepoint.mjs --apply    # actually write the fills
 */
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
// --force ALSO writes the explicit "app wins" corrections below, OVERWRITING a
// non-blank cell (normal sync never does that). Manual-only — the nightly job
// runs plain --apply, so these never re-fire on their own.
const FORCE_ON = process.argv.includes('--force')
// One-time "app wins" corrections, run manually with --force then cleared so they
// never re-fire. (Applied 2026-06-17: 22047 Surf "Slab Package Ordered?" → Yes;
// 13 Almond Pass "Parcel ID" → 9023-0489-16.) Add an entry here to force another.
const FORCE = []
const SITE_HOST = 'netorg13901770.sharepoint.com'
const SITE_PATH = '/sites/ProcesstoBuildingaHouse'
const LIST_NAME = 'Construction Jobs Permitting'

// ---- env -----------------------------------------------------------------
const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const SUPABASE_URL = get('SUPABASE_URL')
const SUPABASE_KEY = get('SUPABASE_SERVICE_KEY')
const TENANT = get('GRAPH_TENANT_ID')
const CLIENT_ID = get('GRAPH_CLIENT_ID')
const CLIENT_SECRET = get('GRAPH_CLIENT_SECRET')
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_KEY, TENANT, CLIENT_ID, CLIENT_SECRET })) {
  if (!v) { console.error(`Missing ${k} in scanner/.env`); process.exit(1) }
}

// ---- Microsoft Graph -----------------------------------------------------
async function graphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`token: ${res.status} ${j.error}: ${j.error_description?.split('\n')[0]}`)
  return j.access_token
}
let TOKEN
const g = async (path) => {
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${JSON.stringify(j.error || j)}`)
  return j
}
const gPatch = async (path, body) => {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`)
}

// ---- helpers -------------------------------------------------------------
const normPermit = (s) => String(s ?? '').replace(/\(.*?\)/g, '').replace(/\s+/g, '').toUpperCase()
const normAddr = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
// collapse internal whitespace so "2449  NW  66th St" == "2449 NW 66th St"
const same = (a, b) => normAddr(a) === normAddr(b)

async function main() {
  TOKEN = await graphToken()

  // 1) Resolve site → list → columns (display name → internal field name).
  const site = await g(`/sites/${SITE_HOST}:${SITE_PATH}`)
  const lists = await g(`/sites/${site.id}/lists?$select=id,displayName,name&$top=200`)
  const list = lists.value.find((l) => l.displayName === LIST_NAME || l.name === LIST_NAME)
  if (!list) { console.error(`List "${LIST_NAME}" not found. Lists: ${lists.value.map((l) => l.displayName).join(', ')}`); process.exit(1) }
  const cols = await g(`/sites/${site.id}/lists/${list.id}/columns?$select=name,displayName,readOnly&$top=200`)
  const internal = {} // displayName -> WRITABLE internal name
  // skip read-only columns (e.g. "LinkTitle", the computed link alias of Title)
  for (const c of cols.value) if (!c.readOnly) internal[c.displayName] = c.name
  // The UI's "Street Address:" column is the READ-ONLY LinkTitle alias; the
  // writable address field is the list's primary field, internal name "Title"
  // (which actually holds the street address). Point the address mapping there.
  internal['Street Address:'] = 'Title'

  // 2) Read all list items (with fields), paginated.
  const items = []
  let url = `/sites/${site.id}/lists/${list.id}/items?expand=fields&$top=200`
  while (url) {
    const page = await g(url)
    items.push(...page.value)
    url = page['@odata.nextLink'] || null
  }

  // 3) Read the Workbench blob from Supabase.
  const row = await (await fetch(`${SUPABASE_URL}/rest/v1/workbench?id=eq.main&select=data`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
  })).json()
  const data = row[0]?.data
  if (!data?.roster) { console.error('Could not read workbench blob (roster missing).'); process.exit(1) }

  // 4) Build the per-project mapped values from the blob.
  const byPermit = new Map()
  const byAddr = new Map()
  const byParcel = new Map()
  // count parcels so we only match-by-parcel when it's UNIQUE (ADU pairs share
  // a parcel — never match those by parcel, it'd be ambiguous)
  const parcelCounts = {}
  for (const p of data.roster) {
    const k = String(p.parcel || '').trim().toUpperCase()
    if (k) parcelCounts[k] = (parcelCounts[k] || 0) + 1
  }
  for (const p of data.roster) {
    const ps = (data.projects && data.projects[p.id]) || {}
    const el = (ps.steps && ps.steps.electric) || {}
    const applied = !!el.submit?.done
    // a REAL date only — seed markers like "(C.O.)" / "(from list)" / "(inferred)" don't count
    const realDate = (d) => (d && !/^\(/.test(String(d).trim()) ? String(d).trim() : '')
    const appliedDate = realDate(el.submit?.date) || realDate(el.submit?.doneAt ? new Date(el.submit.doneAt).toLocaleDateString('en-US') : '')
    const utility = ps.electricCo || p.electricCo || ''
    const serviceType = ps.serviceType || p.serviceType || '' // EXPLICIT only — never the inferred territory guess
    const engineer = (ps.engineer != null ? ps.engineer : p.engineer) || ''
    const isTbd = /^\s*tbd/i.test(p.address || '')
    // (Owner intentionally NOT synced — the app's owner/investor field is the
    //  portal-access person, not the legal lot owner the list tracks. Different
    //  concepts; syncing it would mix them.)
    // water SOURCE only (not the richer "City - connected" status the list keeps)
    const waterMap = { Well: 'Well', City: 'City Water', CityWM: 'City Water - WM Extension Required' }
    const waterVal = waterMap[ps.waterSource || p.waterSource] || ''
    // EXPLICIT only — don't spray the app's default "Septic" into blank cells
    const septicVal = ps.septicSource === 'Sewer' ? 'Sewer' : ps.septicSource === 'Septic' ? 'Septic' : ''
    const soilDone = !!ps.steps?.septic?.seval?.done // septic "Site / soil evaluation" step
    const orders = ps.orders || []
    const ordered = (cat) => orders.some((o) => o.category === cat && o.status && o.status !== 'toOrder')
    const permitIssued =
      p.listStatus === 'CO' ? 'C.O.' : p.listStatus === 'Hold' ? 'On Hold' : ps.steps?.permit?.issued?.done ? 'Issued' : ''
    const rec = {
      id: p.id,
      // mapped fields: list display column -> { value, ph: isPlaceholder(listVal), norm?: compare-normalizer }.
      // NOT synced (app has no such field): Permitting Agent, NOC, Survey, Site
      // Plan, Windows (no order category), Notes (clobber risk — left to you).
      fields: {
        // address: only offer a REAL house number into a TBD/blank list cell
        'Street Address:': { value: isTbd ? '' : p.address, ph: (v) => !v || /^\s*tbd/i.test(v) },
        City: { value: p.city, ph: (v) => !v },
        Zipcode: { value: p.zip, ph: (v) => !v },
        'Parcel ID': { value: p.parcel, ph: (v) => !v },
        // strip the list's "Model " prefix when comparing so "Model A" == "A"
        'House Model': { value: p.model, ph: (v) => !v, norm: (s) => normAddr(String(s ?? '').replace(/^\s*model\s+/i, '')) },
        'Permit Issued?': { value: permitIssued, ph: (v) => !v },
        'Water/Well': { value: waterVal, ph: (v) => !v },
        'Septic/Sewer': { value: septicVal, ph: (v) => !v },
        // the list keeps "Done <date>"; the app only knows done/not — treat any "Done…" as a match
        'Soil Test': { value: soilDone ? 'Done' : '', ph: (v) => !v, norm: (s) => (/^done/i.test(String(s ?? '').trim()) ? 'done' : normAddr(s)) },
        'Slab Package Ordered?': { value: ordered('Slab package') ? 'Yes' : '', ph: (v) => !v },
        'Truss & Framing Pack Ordered?': { value: ordered('Trusses') || ordered('Framing package') ? 'Yes' : '', ph: (v) => !v },
        'Electric Co.': { value: utility, ph: (v) => !v },
        Engineer: { value: engineer, ph: (v) => !v },
        'Electric Type?': { value: serviceType, ph: (v) => !v },
        // only flip a "Not Applied"/blank cell to "Applied <real date>"
        'Electric - Current Stage': {
          value: applied && appliedDate ? `Applied ${appliedDate}` : '',
          ph: (v) => !v || /^not applied$/i.test(String(v).trim()) || /^to type$/i.test(String(v).trim()),
        },
      },
    }
    if (p.permit) byPermit.set(normPermit(p.permit), rec)
    byAddr.set(normAddr(p.address), rec)
    const pk = String(p.parcel || '').trim().toUpperCase()
    if (pk && parcelCounts[pk] === 1) byParcel.set(pk, rec) // unique parcels only
  }

  // Find the list's permit + address columns (display names vary; locate robustly).
  const permitCol = Object.keys(internal).find((d) => /permit\s*(#|%23)?$/i.test(d) && !/portal|issued|agent|in progress/i.test(d)) || 'Permit#'
  const addrCol = Object.keys(internal).find((d) => /street address/i.test(d)) || 'Street Address:'
  const parcelCol = Object.keys(internal).find((d) => /parcel/i.test(d)) || 'Parcel ID'

  // 5) Match each list item to a project + compute fills / conflicts.
  const fills = [], conflicts = [], unmatchedRows = []
  const matchedProjectIds = new Set()
  for (const it of items) {
    const f = it.fields || {}
    const listPermit = f[internal[permitCol]]
    const listAddr = f[internal[addrCol]]
    const listParcel = f[internal[parcelCol]]
    // permit → address → unique-parcel (parcel catches a TBD row whose app
    // address has since been assigned a real house number)
    const rec =
      (listPermit && byPermit.get(normPermit(listPermit))) ||
      (listAddr && byAddr.get(normAddr(listAddr))) ||
      (listParcel && byParcel.get(String(listParcel).trim().toUpperCase()))
    if (!rec) { unmatchedRows.push(listAddr || listPermit || `item ${it.id}`); continue }
    matchedProjectIds.add(rec.id)
    const label = listAddr || listPermit
    for (const [col, spec] of Object.entries(rec.fields)) {
      // skip empties and paren-wrapped junk like "(none listed)"
      if (!spec.value || /^\(.*\)$/.test(String(spec.value).trim())) continue
      const iname = internal[col]
      if (!iname) { continue } // column not found on the list (logged once below)
      const listVal = f[iname]
      const eq = spec.norm ? spec.norm(listVal) === spec.norm(spec.value) : same(listVal, spec.value)
      if (eq) continue // already matches
      if (spec.ph(listVal)) fills.push({ itemId: it.id, label, col, iname, from: listVal ?? '', to: spec.value })
      else conflicts.push({ label, col, listVal, appVal: spec.value })
    }
  }

  // 6) Report.
  const MAPPED_COLS = ['Street Address:', 'City', 'Zipcode', 'Parcel ID', 'House Model', 'Permit Issued?', 'Water/Well', 'Septic/Sewer', 'Soil Test', 'Slab Package Ordered?', 'Truss & Framing Pack Ordered?', 'Electric Co.', 'Engineer', 'Electric Type?', 'Electric - Current Stage']
  console.log(`\nSite: ${SITE_PATH}   List: "${list.displayName}"   items: ${items.length}`)
  console.log(`Matched ${matchedProjectIds.size} app projects to list rows. Permit col: "${permitCol}"  Addr col: "${addrCol}"`)
  const mappedColsMissing = MAPPED_COLS.filter((c) => !internal[c])
  if (mappedColsMissing.length) console.log(`⚠️  List columns not found (skipped): ${mappedColsMissing.join(', ')}`)

  console.log(`\n=== PROPOSED FILLS (${fills.length}) — blank/placeholder cells the app can fill ===`)
  for (const x of fills) console.log(`  ${x.label}  ·  ${x.col}:  "${x.from}" → "${x.to}"`)

  console.log(`\n=== CONFLICTS (${conflicts.length}) — both differ; NOT written, for your review ===`)
  for (const x of conflicts) console.log(`  ${x.label}  ·  ${x.col}:  list="${x.listVal}"  app="${x.appVal}"`)

  if (unmatchedRows.length) console.log(`\n(${unmatchedRows.length} list rows had no app match: ${unmatchedRows.slice(0, 8).join('; ')}${unmatchedRows.length > 8 ? '…' : ''})`)

  // 7) Apply (only with --apply).
  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to write the ${fills.length} fill(s) above.`)
    return
  }
  console.log(`\n--apply: writing ${fills.length} fill(s)…`)
  let ok = 0
  const failed = []
  for (const x of fills) {
    // resilient: one bad field (e.g. a read-only column) must not abort the rest
    try {
      await gPatch(`/sites/${site.id}/lists/${list.id}/items/${x.itemId}/fields`, { [x.iname]: x.to })
      ok++
    } catch (e) {
      failed.push(`${x.label} · ${x.col}: ${e.message}`)
    }
  }
  console.log(`✓ wrote ${ok} fill(s)${failed.length ? `, ${failed.length} FAILED` : ''}. Conflicts (${conflicts.length}) left untouched.`)
  failed.forEach((m) => console.log(`  ✗ ${m}`))
  // explicit "app wins" overrides (overwrite a non-blank cell) — only with --force
  if (FORCE_ON) {
    console.log(`--force: applying ${FORCE.length} explicit override(s)…`)
    for (const fr of FORCE) {
      const it = items.find((i) => normPermit(i.fields?.[internal[permitCol]]) === normPermit(fr.permit))
      const iname = internal[fr.col]
      if (!it || !iname) { console.log(`  ⚠️ force skipped (${fr.permit} / ${fr.col}) — item or column not found`); continue }
      try {
        await gPatch(`/sites/${site.id}/lists/${list.id}/items/${it.id}/fields`, { [iname]: fr.value })
        console.log(`  forced ${fr.permit} · ${fr.col} → "${fr.value}"`)
      } catch (e) {
        console.log(`  ✗ force ${fr.permit} · ${fr.col}: ${e.message}`)
      }
    }
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
