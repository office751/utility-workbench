/**
 * pull-septic-permits.mjs — one-time(ish) backfill: SharePoint list → app.
 *
 * Reads the "Construction Job List" SharePoint list and FILLS (never overwrites)
 * three things on each matched house in the Workbench blob:
 *
 *   1. septicPermit   ← "Septic Permit" column, cleaned to the bare DOH number
 *                       ("Done - 42-S1-5167182" → "42-S1-5167182")
 *   2. septicSystem   ← "INRB Form (NOT)" column:
 *                       To Type / Typed / Recorded → INRB, ATU → ATU, N/A → NA
 *   3. steps.septic.snrb ← checked when the column says "Recorded" (the notice
 *                       is already recorded — don't nag about finished work).
 *                       Dated '(caught up)', same convention as lib/catchup.ts.
 *
 * FILL-ONLY, like sync-sharepoint.mjs: a value Adam already set in the app is
 * NEVER touched (differences are printed as conflicts instead).
 *
 * SAFE BY DEFAULT: dry run that prints every proposed change. --write applies,
 * with the usual blob safety: backup file first, fresh re-read right before
 * writing, verify after.
 *
 *   node pull-septic-permits.mjs            # preview
 *   node pull-septic-permits.mjs --write    # apply
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

// ---- Graph -----------------------------------------------------------
async function graphToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`token: ${res.status} ${j.error}`)
  return j.access_token
}
const TOKEN = await graphToken()
const g = async (path) => {
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${JSON.stringify(j.error || j)}`)
  return j
}

// ---- read the list ---------------------------------------------------
const site = await g(`/sites/${SITE_HOST}:${SITE_PATH}`)
const lists = await g(`/sites/${site.id}/lists?$select=id,displayName,name`)
const list = lists.value.find((l) => LIST_NAMES.includes(l.displayName) || LIST_NAMES.includes(l.name))
if (!list) { console.error(`No list named ${LIST_NAMES.join(' / ')} found.`); process.exit(1) }

// Column internals (stable even when display names change): Title = address,
// field_31 = "Septic Permit", field_30 = "INRB Form (NOT)".
const rows = []
let url = `/sites/${site.id}/lists/${list.id}/items?expand=fields($select=Title,field_31,field_30)&$top=200`
while (url) {
  const j = await g(url)
  for (const it of j.value) rows.push(it.fields || {})
  url = j['@odata.nextLink']
}
console.log(`List "${list.displayName}": ${rows.length} rows`)

// ---- read the blob ---------------------------------------------------
const bres = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })
const blob = (await bres.json())?.[0]?.data
if (!blob || !Array.isArray(blob.roster) || blob.roster.length === 0 || !blob.projects) {
  console.error('✗ Could not read a healthy workbench blob — aborting.'); process.exit(1)
}

// ---- match + compute fills --------------------------------------------
const normAddr = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const byAddr = new Map(blob.roster.map((p) => [normAddr(p.address), p]))

// "Done - 42-S1-5167182", "Easement Recorded - 42-SO-3080768 (…)" → the number.
const permitOf = (s) => (String(s ?? '').match(/\b42-S[A-Z0-9]{1,2}-\d+\b/i) || [])[0]?.toUpperCase()
const systemOf = (s) => {
  const v = String(s ?? '').trim().toLowerCase()
  if (['to type', 'typed', 'recorded'].includes(v)) return 'INRB'
  if (v === 'atu') return 'ATU'
  if (v === 'n/a') return 'NA'
  return '' // blank / anything odd → no opinion
}

const CAUGHT_UP_DATE = '(caught up)' // same convention as lib/catchup.ts

const fills = [] // {pid, addr, field, from, to, apply(ps)}
const conflicts = []
let unmatched = 0
for (const f of rows) {
  const p = byAddr.get(normAddr(f.Title))
  if (!p) { if (f.field_31 || f.field_30) unmatched++; continue }
  const ps = blob.projects[p.id] || blob.projects[String(p.id)] || {}

  const permit = permitOf(f.field_31)
  if (permit) {
    const cur = (ps.septicPermit ?? '').trim()
    if (!cur) fills.push({ pid: p.id, addr: p.address, field: 'septicPermit', to: permit })
    else if (cur.toUpperCase() !== permit) conflicts.push(`${p.address} · septicPermit: app="${cur}" list="${permit}"`)
  }

  const sys = systemOf(f.field_30)
  if (sys) {
    const cur = ps.septicSystem ?? ''
    if (!cur) fills.push({ pid: p.id, addr: p.address, field: 'septicSystem', to: sys })
    else if (cur !== sys) conflicts.push(`${p.address} · septicSystem: app="${cur}" list="${f.field_30}"`)
  }

  // Notice already recorded → check the snrb step so it never nags.
  const recorded = String(f.field_30 ?? '').trim().toLowerCase() === 'recorded'
  const sysWillBeInrb = (ps.septicSystem ?? '') === 'INRB' || (!ps.septicSystem && sys === 'INRB')
  if (recorded && sysWillBeInrb && !ps.steps?.septic?.snrb?.done) {
    fills.push({ pid: p.id, addr: p.address, field: 'steps.septic.snrb', to: 'done (Recorded)' })
  }
}

console.log(`\n=== PROPOSED FILLS (${fills.length}) — blank app fields only ===`)
for (const f of fills) console.log(`  ${f.addr}  ·  ${f.field} → ${f.to}`)
console.log(`\n=== CONFLICTS (${conflicts.length}) — left untouched ===`)
for (const c of conflicts) console.log(`  ${c}`)
if (unmatched) console.log(`\n(${unmatched} list rows with septic data had no roster match — probably other companies' houses.)`)

if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write to apply.'); process.exit(0) }
if (!fills.length) { console.log('\nNothing to write.'); process.exit(0) }

// ---- apply (fresh read → backup → mutate → write → verify) ------------
const fres = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })
const fresh = (await fres.json())?.[0]?.data
if (!fresh || !Array.isArray(fresh.roster) || !fresh.projects) {
  console.error('✗ Fresh re-read failed — aborting, nothing written.'); process.exit(1)
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(new URL(`backups/workbench-septic-backfill-${stamp}.json`, import.meta.url), JSON.stringify(fresh))

let applied = 0
for (const f of fills) {
  const ps = (fresh.projects[f.pid] ??= {})
  if (f.field === 'septicPermit') {
    if (!(ps.septicPermit ?? '').trim()) { ps.septicPermit = f.to; applied++ }
  } else if (f.field === 'septicSystem') {
    if (!ps.septicSystem) { ps.septicSystem = f.to; applied++ }
  } else if (f.field === 'steps.septic.snrb') {
    ps.steps ??= {}
    ps.steps.septic ??= {}
    if (!ps.steps.septic.snrb?.done) {
      ps.steps.septic.snrb = {
        done: true, date: CAUGHT_UP_DATE,
        note: 'Backfilled from SharePoint — INRB Form column says Recorded',
      }
      applied++
    }
  }
}

const wres = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main`, {
  method: 'PATCH',
  headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
  body: JSON.stringify({ data: fresh, updated_at: new Date().toISOString() }),
})
if (!wres.ok) { console.error(`✗ Write failed: ${wres.status} ${await wres.text()}`); process.exit(1) }

// verify
const vres = await fetch(`${SB_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })
const check = (await vres.json())?.[0]?.data
const sample = fills.find((f) => f.field === 'septicPermit')
const ok = !sample || (check?.projects?.[sample.pid]?.septicPermit ?? '') !== ''
console.log(ok ? `\n✓ wrote ${applied} fill(s). Backup: backups/workbench-septic-backfill-${stamp}.json`
               : '\n⚠ wrote, but verification read did not show the fill — check manually!')
