/**
 * scan.mjs — read each permit's county-portal record for ACTIONABLE items:
 *   • Active HOLDS (Status = "Active")
 *   • Inspection / eReview REJECTIONS (Disapproved / Fail / Correction…),
 *     ignoring ones a later pass already cleared.
 *
 * STAGE 1 (now): scrape + print only — a safe dry run. Writing those items
 * into the Workbench (as permit-linked tasks) is Stage 2, wired in once this
 * looks right. Reuses the logged-in session saved by `npm run login`.
 *
 * Usage:
 *   npm run scan                      # all permits, dry run, headless
 *   npm run scan -- --permit 2025020809   # just one permit
 *   npm run scan -- --headed          # watch it work in a visible window
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import fs from 'node:fs'

const BASE = 'https://selfservice.marionfl.org/energov_prod/selfservice'
const PROFILE_DIR = process.env.PROFILE_DIR || './profile'

const args = process.argv.slice(2)
const headed = args.includes('--headed')
const doWrite = args.includes('--write') // without this, the sync only PREVIEWS
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const onlyPermit =
  (args.find((a) => a.startsWith('--permit=')) || '').split('=')[1] ||
  (args.includes('--permit') ? args[args.indexOf('--permit') + 1] : null)

// permit# → portal GUID (generated from the Construction Job List CSV).
const portals = JSON.parse(fs.readFileSync(new URL('./permit-portals.json', import.meta.url)))
let entries = Object.entries(portals)
if (onlyPermit) entries = entries.filter(([p]) => p === onlyPermit)

// A status that means "needs your attention".
const REJECTED = /disapprov|fail(ed)?|reject|correction|denied|incomplete|partial/i
// The county stamps this exact "pay impact fees before final" hold on EVERY
// permit — pure noise. Water-line/WME "Final Holds" don't contain this text.
const BOILERPLATE = /impact fees cannot be paid prior to permit issuance/i
const firstDate = (cells) => cells.find((c) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(c)) || ''

/** Turn the raw tables scraped off a permit page into actionable items + FYIs. */
function classify(tables) {
  const holds = [] // actionable holds
  const rejections = [] // inspection / review disapprovals
  const fyi = [] // "Information …" status notes → dismissible notifications
  for (const t of tables) {
    const hl = t.headers.join('|').toLowerCase()

    // --- HOLDS table: Name | Description | Comments | Hold Date | Status ---
    if (hl.includes('hold date')) {
      for (const r of t.rows) {
        const status = (r[r.length - 1] || '').trim()
        // EXACT match — "Inactive" contains "active", so a substring test would
        // wrongly flag resolved holds.
        if (status.toLowerCase() !== 'active') continue
        const name = (r[0] || '').trim()
        const comment = r[2] || r[1] || ''
        if (BOILERPLATE.test(comment)) continue // standard impact-fee hold → noise
        const item = { name, comment, date: r[3] || '' }
        // "Information …" rows are status FYIs → dismissible notifications, not to-dos.
        if (/^information\b/i.test(name)) fyi.push(item)
        else holds.push(item)
      }
      continue
    }

    // --- INSPECTIONS / eREVIEWS: rows with a Status + a date + a description ---
    const isResults =
      hl.includes('inspector') || hl.includes('scheduled date') || (hl.includes('record number') && hl.includes('status'))
    if (isResults) {
      // De-dupe by description, keep the LATEST attempt, flag if it's not cleared.
      const latest = new Map()
      for (const r of t.rows) {
        const desc = r[1] || r[0] || ''
        const status = r.find((c) => REJECTED.test(c)) || r[2] || ''
        const dateStr = firstDate(r)
        const when = Date.parse(dateStr) || 0
        const prev = latest.get(desc)
        if (!prev || when >= prev.when) latest.set(desc, { desc, status, dateStr, when })
      }
      for (const v of latest.values()) {
        if (REJECTED.test(v.status)) rejections.push({ desc: v.desc, status: v.status, date: v.dateStr })
      }
    }
  }
  return { holds, rejections, fyi }
}

const readTables = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('table')].map((tbl) => ({
      headers: [...tbl.querySelectorAll('th')].map((th) => th.textContent.trim()).filter(Boolean),
      rows: [...tbl.querySelectorAll('tbody tr')]
        .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim().replace(/\s+/g, ' ')))
        .filter((r) => r.some((c) => c)),
    })),
  )

// The two tables whose presence proves the tabs we care about actually rendered.
const hasHoldsTable = (tables) => tables.some((t) => t.headers.join('|').toLowerCase().includes('hold date'))
const hasInspTable = (tables) =>
  tables.some((t) => {
    const h = t.headers.join('|').toLowerCase()
    return h.includes('inspector') || h.includes('scheduled date') || h.includes('view inspection')
  })

// Click the tabs whose tables we need (Angular only builds the active tab; the
// eReviews/Inspections tab hides under the "More Info" dropdown). Idempotent:
// opens "More Info" only if eReviews isn't already reachable, so repeated calls
// don't toggle the dropdown shut.
async function activateTabs(page) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button,li,span')].find((e) => (e.textContent || '').trim() === 'Holds')
    if (el) el.click()
  })
  await page.waitForTimeout(900)
  await page.evaluate(() => {
    const vis = (e) => e && e.offsetParent !== null
    const er = [...document.querySelectorAll('a,button,li,span')].find((e) => (e.textContent || '').trim() === 'eReviews' && vis(e))
    if (!er) {
      const more = [...document.querySelectorAll('a,button')].find((e) => /more info/i.test((e.textContent || '').trim()) && vis(e))
      if (more) more.click()
    }
  })
  await page.waitForTimeout(700)
  await page.evaluate(() => {
    const er = [...document.querySelectorAll('a,button,li,span')].find((e) => (e.textContent || '').trim() === 'eReviews')
    if (er) er.click()
  })
  await page.waitForTimeout(1000)
}

async function scrapePermit(page, guid) {
  await page.goto(`${BASE}#/permit/${guid}`, { waitUntil: 'domcontentloaded' })
  // The SPA polls forever (never "idle"), so wait for actual content.
  const loaded = await page
    .waitForFunction(() => /Permit Number/i.test(document.body.innerText), { timeout: 30000 })
    .then(() => true)
    .catch(() => false)
  if (!loaded) return { holds: [], rejections: [], fyi: [], complete: false, tableCount: 0 }

  // Poll: re-activate the Holds + eReviews/Inspections tabs until BOTH tables are
  // actually in the DOM. The SPA renders tabs lazily, and trusting a read before
  // the Inspections tab rendered is exactly what produced false "clear" results.
  let tables = []
  for (let attempt = 0; attempt < 5; attempt++) {
    await activateTabs(page)
    tables = await readTables(page)
    if (hasHoldsTable(tables) && hasInspTable(tables)) break
    await page.waitForTimeout(1500)
  }
  const complete = hasHoldsTable(tables) && hasInspTable(tables)
  return { ...classify(tables), complete, tableCount: tables.length }
}

/* -------- write findings into the Workbench (Supabase), de-duped + safe -------- */
const permitFromKey = (k) => {
  const m = /^portal:([^:]+):/.exec(k || '')
  return m ? m[1] : null
}
const trimDesc = (d) => (d || '').replace(/\s*-\s*1\s*&\s*2\s*Residential Family\s*$/i, '').trim()

/** From scan results + the roster, build the tasks + per-project FYIs we WANT to exist. */
function buildDesired(results, roster) {
  const idByPermit = new Map()
  const addrById = new Map()
  for (const p of roster) {
    if (p.permit) idByPermit.set(p.permit, p.id)
    addrById.set(p.id, p.address)
  }
  const tasks = []
  const notesByProject = new Map()
  for (const r of results) {
    const pid = idByPermit.get(r.permit)
    if (pid == null) continue // permit not in roster → skip
    const addr = addrById.get(pid) || r.permit
    for (const rej of r.rejections)
      tasks.push({ sourceKey: `portal:${r.permit}:rej:${rej.desc}`, projectId: pid, text: `${addr}: ${trimDesc(rej.desc)} — ${rej.status}` })
    for (const h of r.holds)
      tasks.push({ sourceKey: `portal:${r.permit}:hold:${h.name}:${h.date}`, projectId: pid, text: `${addr}: ${h.name} — ${(h.comment || '').slice(0, 140)}` })
    for (const f of r.fyi) {
      if (!notesByProject.has(pid)) notesByProject.set(pid, [])
      notesByProject.get(pid).push({ sourceKey: `portal:${r.permit}:fyi:${f.name}:${f.date}`, text: `${f.name} — ${(f.comment || '').slice(0, 220)}`, date: f.date })
    }
  }
  return { tasks, notesByProject }
}

async function syncToWorkbench(results) {
  if (!SERVICE_KEY) {
    console.log('\n(No SUPABASE_SERVICE_KEY in .env — scan only, nothing written.)\n')
    return
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.from('workbench').select('data').eq('id', 'main').maybeSingle()
  if (error) return console.error('\n✗ Could not read Workbench:', error.message, '\n')
  const blob = data && data.data
  // SAFETY: never write if the data doesn't look like a real workbench.
  if (!blob || !Array.isArray(blob.roster) || blob.roster.length === 0 || !blob.projects || !Array.isArray(blob.tasks))
    return console.error('\n✗ Workbench data looks invalid — aborting (nothing written).\n')
  const originalJson = JSON.stringify(data.data) // captured BEFORE we mutate, for the backup

  const scanned = new Set(results.map((r) => r.permit))
  const { tasks: desired, notesByProject } = buildDesired(results, blob.roster)
  const desiredKeys = new Set(desired.map((t) => t.sourceKey))
  const existingByKey = new Map(blob.tasks.filter((t) => t.sourceKey).map((t) => [t.sourceKey, t]))

  // --- tasks: drop resolved portal items (only for permits we scanned), add/update the rest ---
  let added = 0, updated = 0, cleared = 0
  blob.tasks = blob.tasks.filter((t) => {
    const perm = permitFromKey(t.sourceKey)
    if (perm && scanned.has(perm) && !desiredKeys.has(t.sourceKey)) { cleared++; return false }
    return true
  })
  for (const d of desired) {
    const ex = existingByKey.get(d.sourceKey)
    if (ex) {
      if (ex.text !== d.text || ex.done) { ex.text = d.text; ex.done = false; delete ex.doneAt; updated++ } // re-flagged → reopen
    } else {
      blob.tasks.push({ id: crypto.randomUUID(), text: d.text, category: 'construction', projectId: d.projectId, sourceKey: d.sourceKey, done: false, createdAt: new Date().toISOString() })
      added++
    }
  }

  // --- FYI notifications (per project): preserve `dismissed`, drop resolved ---
  let nAdded = 0, nCleared = 0
  const scannedPids = new Set()
  for (const r of results) { const p = blob.roster.find((x) => x.permit === r.permit); if (p) scannedPids.add(p.id) }
  for (const pid of scannedPids) {
    const ps = blob.projects[pid]
    if (!ps) continue
    const desiredNotes = notesByProject.get(pid) || []
    const desiredNKeys = new Set(desiredNotes.map((n) => n.sourceKey))
    const byKey = new Map((ps.notifications || []).filter((n) => n.sourceKey).map((n) => [n.sourceKey, n]))
    const kept = (ps.notifications || []).filter((n) => {
      const perm = permitFromKey(n.sourceKey)
      if (perm && !desiredNKeys.has(n.sourceKey)) { nCleared++; return false }
      return true
    })
    for (const d of desiredNotes) {
      const ex = byKey.get(d.sourceKey)
      if (ex) { ex.text = d.text; ex.date = d.date } // keep `dismissed`
      else { kept.push({ sourceKey: d.sourceKey, text: d.text, date: d.date, dismissed: false, createdAt: new Date().toISOString() }); nAdded++ }
    }
    ps.notifications = kept
  }

  console.log('\nWorkbench sync:')
  console.log(`   tasks:         +${added} new, ${updated} updated, ${cleared} cleared`)
  console.log(`   notifications: +${nAdded} new, ${nCleared} cleared`)
  if (!doWrite) return console.log('\n(PREVIEW — nothing written. Re-run with  --write  to apply.)\n')

  fs.mkdirSync(new URL('./backups/', import.meta.url), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.writeFileSync(new URL(`./backups/workbench-${stamp}.json`, import.meta.url), originalJson)
  const { error: werr } = await sb.from('workbench').upsert({ id: 'main', data: blob, updated_at: new Date().toISOString() })
  if (werr) return console.error('\n✗ Write failed:', werr.message, '\n')
  console.log(`\n✓ Written to your Workbench. Backup: scanner/backups/workbench-${stamp}.json\n`)
}

// ---- run ----
const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: !headed,
  viewport: { width: 1280, height: 900 },
})
const page = ctx.pages()[0] || (await ctx.newPage())

// Auth check: actually LOAD the first permit and confirm its record renders.
// (The portal keeps both "Log In" and "Log Out" in the DOM, so a text check is
// unreliable — loading a permit is the real test of whether the session is good.)
const probeGuid = entries[0] && entries[0][1]
if (probeGuid) {
  await page.goto(`${BASE}#/permit/${probeGuid}`, { waitUntil: 'domcontentloaded' })
  const ok = await page
    .waitForFunction(() => /Permit Number/i.test(document.body.innerText), { timeout: 30000 })
    .then(() => true)
    .catch(() => false)
  if (!ok) {
    console.error('\n✗ Could not load a permit (likely logged out). Run `npm run login` first, then retry.\n')
    await ctx.close()
    process.exit(1)
  }
}

console.log(`\nScanning ${entries.length} permit${entries.length === 1 ? '' : 's'}…`)
const results = []
for (const [permit, guid] of entries) {
  try {
    const res = await scrapePermit(page, guid)
    results.push({ permit, ...res })
    if (!res.complete) {
      console.log(`● ${permit}  — ⚠ under-rendered (${res.tableCount} tables) — skipped, its items left untouched`)
      continue
    }
    const n = res.holds.length + res.rejections.length
    if (n || res.fyi.length) {
      console.log(`\n● ${permit}  (${n} action${n === 1 ? '' : 's'}${res.fyi.length ? `, ${res.fyi.length} FYI` : ''})`)
      for (const r of res.rejections) console.log(`   ⚠️  ${r.desc}: ${r.status} [${r.date}]`)
      for (const h of res.holds) console.log(`   🚧 HOLD: ${h.name} — ${h.comment} [${h.date}]`)
      for (const f of res.fyi) console.log(`   🔔 FYI: ${f.name} — ${f.comment.slice(0, 80)} [${f.date}]`)
    } else {
      console.log(`● ${permit}  — clear`)
    }
  } catch (e) {
    console.log(`● ${permit}  — error: ${e.message}`)
  }
}
await ctx.close()

// Only permits that FULLY rendered get synced — under-rendered ones are left
// alone (never cleared) so a flaky load can't wipe real items.
const done = results.filter((r) => r.complete)
const skipped = results.length - done.length
const total = done.reduce((s, r) => s + r.holds.length + r.rejections.length, 0)
const fyiTotal = done.reduce((s, r) => s + (r.fyi ? r.fyi.length : 0), 0)
console.log(
  `\nScanned ${done.length}/${results.length} fully${skipped ? ` (${skipped} skipped)` : ''}: ${total} action item(s)${fyiTotal ? ` + ${fyiTotal} FYI` : ''}.`,
)
await syncToWorkbench(done)
