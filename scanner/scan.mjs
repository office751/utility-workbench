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
import 'dotenv/config'
import fs from 'node:fs'

const BASE = 'https://selfservice.marionfl.org/energov_prod/selfservice'
const PROFILE_DIR = process.env.PROFILE_DIR || './profile'

const args = process.argv.slice(2)
const headed = args.includes('--headed')
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

async function scrapePermit(page, guid) {
  await page.goto(`${BASE}#/permit/${guid}`, { waitUntil: 'domcontentloaded' })
  // The SPA polls forever (never goes "idle"), so wait for actual content.
  await page
    .waitForFunction(() => /Permit Number|Type:\s/.test(document.body.innerText), { timeout: 30000 })
    .catch(() => {})

  // Render the tabs whose tables we need (Angular only builds the active tab).
  await page.evaluate(() => {
    const click = (txt) => {
      const el = [...document.querySelectorAll('a,button,li,span')].find((e) => (e.textContent || '').trim() === txt)
      if (el) el.click()
    }
    click('Holds')
  })
  await page.waitForTimeout(700)
  await page.evaluate(() => {
    const more = [...document.querySelectorAll('a,button')].find(
      (e) => /more info/i.test((e.textContent || '').trim()) && e.offsetParent !== null,
    )
    if (more) more.click()
    const er = [...document.querySelectorAll('a,button,li,span')].find((e) => (e.textContent || '').trim() === 'eReviews')
    if (er) er.click()
  })
  await page.waitForTimeout(900)

  const tables = await page.evaluate(() =>
    [...document.querySelectorAll('table')].map((tbl) => ({
      headers: [...tbl.querySelectorAll('th')].map((th) => th.textContent.trim()).filter(Boolean),
      rows: [...tbl.querySelectorAll('tbody tr')]
        .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim().replace(/\s+/g, ' ')))
        .filter((r) => r.some((c) => c)),
    })),
  )
  return classify(tables)
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
    const { holds, rejections, fyi } = await scrapePermit(page, guid)
    results.push({ permit, holds, rejections, fyi })
    const n = holds.length + rejections.length
    if (n || fyi.length) {
      console.log(`\n● ${permit}  (${n} action${n === 1 ? '' : 's'}${fyi.length ? `, ${fyi.length} FYI` : ''})`)
      for (const r of rejections) console.log(`   ⚠️  ${r.desc}: ${r.status} [${r.date}]`)
      for (const h of holds) console.log(`   🚧 HOLD: ${h.name} — ${h.comment} [${h.date}]`)
      for (const f of fyi) console.log(`   🔔 FYI: ${f.name} — ${f.comment.slice(0, 80)} [${f.date}]`)
    } else {
      console.log(`● ${permit}  — clear`)
    }
  } catch (e) {
    console.log(`● ${permit}  — error: ${e.message}`)
  }
}
await ctx.close()

const total = results.reduce((s, r) => s + r.holds.length + r.rejections.length, 0)
const fyiTotal = results.reduce((s, r) => s + (r.fyi ? r.fyi.length : 0), 0)
console.log(`\nDone. ${results.length} permits scanned, ${total} action item(s)${fyiTotal ? ` + ${fyiTotal} FYI` : ''}.`)
console.log('(Dry run — nothing written. Writing into the Workbench is the next step.)\n')
