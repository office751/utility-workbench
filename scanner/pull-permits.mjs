/**
 * pull-permits.mjs — backfill BUILDING PERMIT #s and PERMIT PORTAL links
 * from the "Construction Job List" SharePoint list into the app (Adam,
 * Aug 25 2026: "use the sharepoint list to update any building permit
 * numbers and also get the link to the permit portal from the same list").
 *
 * FILL-ONLY, like pull-septic-permits.mjs:
 *   1. roster[].permit      ← list "Permit#" — only when the app's is blank,
 *                             and only values that LOOK like real Marion
 *                             permits (2025070270 / BLDR-26-01-04896);
 *                             placeholders ("Not Applied", "TBD") are skipped.
 *   2. projects[id].permitUrl ← list "Permit Portal" hyperlink — only when
 *                             the app resolves NO portal link at all
 *                             (ps.permitUrl blank AND the baked
 *                             data/sharepoint.ts PERMIT_PORTALS map has no
 *                             entry for the house's permit). Filling
 *                             redundantly would shadow future portal-map
 *                             updates — permitUrl wins in permitPortalOf().
 *
 * Differences (both non-blank) are printed as conflicts, never overwritten.
 *
 *   node pull-permits.mjs            # dry run (preview only)
 *   node pull-permits.mjs --write    # apply, with backup + fresh re-read
 */
import { readFileSync, writeFileSync } from 'node:fs'

const WRITE = process.argv.includes('--write')
const SITE_HOST = 'netorg13901770.sharepoint.com'
const SITE_PATH = '/sites/ProcesstoBuildingaHouse'
const LIST_NAMES = ['Construction Job List', 'Construction Jobs Permitting']

// ---- env -------------------------------------------------------------
const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const SB_URL = get('SUPABASE_URL')
const SB_KEY = get('SUPABASE_SERVICE_KEY')
const TENANT = get('GRAPH_TENANT_ID')
const CLIENT_ID = get('GRAPH_CLIENT_ID')
const CLIENT_SECRET = get('GRAPH_CLIENT_SECRET')
for (const [k, v] of Object.entries({ SB_URL, SB_KEY, TENANT, CLIENT_ID, CLIENT_SECRET })) {
  if (!v) { console.error(`Missing ${k} in scanner/.env`); process.exit(1) }
}
const H = { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}` }

// ---- the baked portal map (permit # → URL) from the app source ---------
const shp = readFileSync(new URL('../src/data/sharepoint.ts', import.meta.url), 'utf8')
const PORTAL_KEYS = new Set([...shp.matchAll(/'([^']+)':\s*'https:\/\/selfservice/g)].map((m) => m[1]))

// ---- Graph -----------------------------------------------------------
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
const g = async (path) => {
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
    headers: { authorization: `Bearer ${tok.access_token}` },
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${JSON.stringify(j.error || j)}`)
  return j
}

const site = await g(`/sites/${SITE_HOST}:${SITE_PATH}`)
const lists = await g(`/sites/${site.id}/lists?$select=id,displayName,name`)
const list = lists.value.find((l) => LIST_NAMES.includes(l.displayName) || LIST_NAMES.includes(l.name))
if (!list) { console.error(`No list named ${LIST_NAMES.join(' / ')} found.`); process.exit(1) }

// Title = address, field_3 = "Parcel ID", field_4 = "Permit#",
// PermitPortal = "Permit Portal" (hyperlink)
const rows = []
let url = `/sites/${site.id}/lists/${list.id}/items?expand=fields($select=Title,field_3,field_4,PermitPortal)&$top=200`
while (url) {
  const j = await g(url)
  for (const it of j.value) rows.push(it.fields || {})
  url = j['@odata.nextLink']
}
console.log(`List "${list.displayName}": ${rows.length} rows`)

// ---- read the blob -----------------------------------------------------
const bres = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })
const blob = (await bres.json())?.[0]?.data
if (!blob || !Array.isArray(blob.roster) || blob.roster.length === 0 || !blob.projects) {
  console.error('✗ Could not read a healthy workbench blob — aborting.'); process.exit(1)
}

// ---- match + compute fills ----------------------------------------------
// Parcel FIRST (unique), unique address second — several lots share a "TBD …"
// placeholder address on both sides, so address alone can mis-attribute.
const normAddr = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const normParcel = (s) => String(s ?? '').replace(/\s+/g, '').trim()
const byParcel = new Map()
for (const p of blob.roster) if (normParcel(p.parcel)) byParcel.set(normParcel(p.parcel), p)
const addrCount = {}
for (const p of blob.roster) addrCount[normAddr(p.address)] = (addrCount[normAddr(p.address)] ?? 0) + 1
const byAddr = new Map(blob.roster.filter((p) => addrCount[normAddr(p.address)] === 1).map((p) => [normAddr(p.address), p]))
const listAddrCount = {}
for (const f of rows) listAddrCount[normAddr(f.Title)] = (listAddrCount[normAddr(f.Title)] ?? 0) + 1
const skipped = []

// Real Marion permits only: 2025070270-style (10 digits) or BLDR-26-01-04896.
const permitOf = (s) => (String(s ?? '').match(/\b(BLDR-\d{2}-\d{2}-\d{4,6}|20\d{8})\b/i) || [])[0]?.toUpperCase()
// Hyperlink columns come back as { Description, Url }.
const urlOf = (v) => {
  const u = (typeof v === 'object' && v ? v.Url : v) ?? ''
  return /^https?:\/\//i.test(String(u).trim()) ? String(u).trim() : ''
}

const fills = [] // { pid, addr, field, to }
const conflicts = []
for (const f of rows) {
  let p = byParcel.get(normParcel(f.field_3))
  if (!p) {
    // Address fallback ONLY when the address is unique on BOTH sides.
    if (listAddrCount[normAddr(f.Title)] > 1) { skipped.push(`${f.Title} (address not unique, no parcel match)`); continue }
    p = byAddr.get(normAddr(f.Title))
  }
  if (!p) continue
  const ps = blob.projects[p.id] || blob.projects[String(p.id)] || {}

  const permit = permitOf(f.field_4)
  const curPermit = String(p.permit ?? '').trim()
  if (permit) {
    if (!curPermit) fills.push({ pid: p.id, addr: p.address, field: 'permit', to: permit })
    else if (curPermit.toUpperCase() !== permit) conflicts.push(`${p.address} · permit: app="${curPermit}" list="${permit}"`)
  }

  const portal = urlOf(f.PermitPortal)
  if (portal) {
    const effPermit = curPermit || permit || ''
    const appHasLink = !!(ps.permitUrl ?? '').trim() || PORTAL_KEYS.has(effPermit)
    if (!appHasLink) fills.push({ pid: p.id, addr: p.address, field: 'permitUrl', to: portal })
    // A different existing link isn't a conflict worth nagging about — the
    // scanner keeps the baked map current and permitUrl was hand-set if set.
  }
}

console.log(`\n=== PROPOSED FILLS (${fills.length}) — blank app fields only ===`)
for (const f of fills) console.log(`  ${f.addr}  ·  ${f.field} → ${f.to}`)
console.log(`\n=== CONFLICTS (${conflicts.length}) — left untouched ===`)
for (const c of conflicts) console.log(`  ${c}`)
if (skipped.length) {
  console.log(`\n=== SKIPPED (${skipped.length}) — ambiguous match, fill by hand ===`)
  for (const s of skipped) console.log(`  ${s}`)
}

if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write to apply.'); process.exit(0) }
if (!fills.length) { console.log('\nNothing to write.'); process.exit(0) }

// ---- apply (fresh read → backup → mutate → write → verify) --------------
const fres = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })
const fresh = (await fres.json())?.[0]?.data
if (!fresh || !Array.isArray(fresh.roster) || !fresh.projects) {
  console.error('✗ Fresh re-read failed — aborting, nothing written.'); process.exit(1)
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(new URL(`backups/workbench-permit-backfill-${stamp}.json`, import.meta.url), JSON.stringify(fresh))

let applied = 0
for (const f of fills) {
  if (f.field === 'permit') {
    const row = fresh.roster.find((r) => r.id === f.pid)
    if (row && !String(row.permit ?? '').trim()) { row.permit = f.to; applied++ }
  } else if (f.field === 'permitUrl') {
    const ps = (fresh.projects[f.pid] ??= {})
    if (!(ps.permitUrl ?? '').trim()) { ps.permitUrl = f.to; applied++ }
  }
}

const wres = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main`, {
  method: 'PATCH',
  headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
  body: JSON.stringify({ data: fresh, updated_at: new Date().toISOString() }),
})
if (!wres.ok) { console.error(`✗ Write failed: ${wres.status} ${await wres.text()}`); process.exit(1) }

const vres = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })
const check = (await vres.json())?.[0]?.data
const sample = fills[0]
const ok = sample.field === 'permit'
  ? (check?.roster?.find((r) => r.id === sample.pid)?.permit ?? '') !== ''
  : ((check?.projects?.[sample.pid]?.permitUrl ?? '') !== '')
console.log(ok ? `\n✓ wrote ${applied} fill(s). Backup: backups/workbench-permit-backfill-${stamp}.json`
               : '\n⚠ wrote, but verification read did not show the fill — check manually!')
