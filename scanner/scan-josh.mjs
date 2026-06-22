/**
 * scan-josh.mjs — the one-click "Scan Josh" : turn Josh's NEW texts into
 * material orders + tasks, written STRAIGHT into the Workbench (no pasting).
 *
 * How it differs from the old scripts/read-josh-orders.mjs:
 *   • Josh ONLY (Mickey + everyone else dropped).
 *   • INCREMENTAL — it remembers the last scan in `.josh-state.json` and only
 *     reads messages since then. Scan Friday, scan again today → only the
 *     messages since Friday. The cursor advances ONLY after a successful write.
 *   • WRITES into the app — proposed orders land on the matched house's
 *     🛒 Materials tab, proposed tasks land on the ✓ Tasks tab. ADD-ONLY and
 *     delete-safe, mirroring scan.mjs's safe write: it reads the blob, refuses
 *     to write anything that doesn't look like a real Workbench, backs the blob
 *     up first, and never removes or overwrites your existing data.
 *
 * The house roster is read from the LIVE blob (`blob.roster`), NOT from
 * src/data/projects.ts — same single source of truth scan.mjs uses, so added /
 * renamed / deleted houses are always matched correctly.
 *
 * Usage (the Desktop "Scan Josh" button runs the first form):
 *   node scan-josh.mjs --write              # scan since last time + write into the app
 *   node scan-josh.mjs                       # PREVIEW — show what it WOULD add, write nothing
 *   node scan-josh.mjs --since 2026-06-01 [--write]   # override the start date
 *
 * Mac-only: reads the Messages database (needs Full Disk Access). Lives in
 * scanner/ alongside the permit scanner and NEVER ships to the browser.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const __dir = dirname(fileURLToPath(import.meta.url))
const DB = join(homedir(), 'Library/Messages/chat.db')
const STATE_FILE = join(__dir, '.josh-state.json')

const args = process.argv.slice(2)
const doWrite = args.includes('--write')
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

// Josh only. (Add a number here if you ever want another trusted reporter.)
const SENDERS = { '+13523616750': 'Josh' }

// --- date cutoff: --since arg  >  saved cursor  >  7 days ago ----------------
const runStart = new Date()
const todayYMD = runStart.toISOString().slice(0, 10)
function loadCursor() {
  try {
    return new Date(JSON.parse(readFileSync(STATE_FILE, 'utf8')).lastScan)
  } catch {
    return null // first run, or state file missing
  }
}
const sinceArg = args.indexOf('--since')
const sinceDate =
  sinceArg !== -1 && args[sinceArg + 1]
    ? new Date(args[sinceArg + 1] + 'T00:00:00')
    : loadCursor() || new Date(Date.now() - 7 * 86400000)
// Messages stores dates as nanoseconds since 2001-01-01. BigInt for exactness.
const sinceNs = BigInt(Math.floor(sinceDate.getTime() / 1000) - 978307200) * 1000000000n

const STOP = new Set(
  ('sw se ne nw n s e w st rd dr ave blvd ln ct ter pl cir run pass way loop unit model fl ' +
    'florida terrace court place boulevard drive street road lane circle ' +
    'southwest northwest northeast southeast dunnellon ocala belleview summerfield ocklawaha').split(' '),
)

// Project lookup — populated from blob.roster (see buildLookup), not a file.
let projects = []
let tokenIndex = {}
function buildLookup(roster) {
  projects = []
  for (const p of roster) {
    if (!p || typeof p.address !== 'string') continue
    const tokens = `${p.address} ${p.subdivision || ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    projects.push({ id: p.id, address: p.address, subdivision: p.subdivision || '', tokens: new Set(tokens), houseNum: (p.address.match(/\d+/) || [])[0] || '' })
  }
  tokenIndex = {}
  for (const p of projects)
    for (const t of p.tokens) {
      if (STOP.has(t) || t.length < 3) continue
      ;(tokenIndex[t] ??= new Set()).add(p.id)
    }
}

// --- item keywords (incl. Josh's real-world spellings) -----------------------
const CATEGORIES = [
  [/truss/, 'Trusses'],
  [/framing|frame pack/, 'Framing package'],
  [/slab|slap package/, 'Slab package'],
  [/\bblock/, 'Block'],
  [/lintel|lentil/, 'Lintels'],
  [/floor/, 'Flooring'],
  [/cabinet/, 'Cabinets'],
  [/\blight(ing)?\b/, 'Lighting package'],
  [/\btile/, 'Bathroom tile'],
  [/garage door/, 'Garage door'],
  [/dumpster/, 'Dumpster'],
  [/porta|port o|ports potty|porta-potty/, 'Porta-potty'],
  [/\bsand\b/, 'Sand'],
]

function decodeAttributedBody(hex) {
  if (!hex) return ''
  const buf = Buffer.from(hex, 'hex')
  const marker = buf.indexOf(Buffer.from('NSString'))
  if (marker === -1) return ''
  const plus = buf.indexOf(0x2b, marker + 8)
  if (plus === -1) return ''
  let i = plus + 1
  let len = buf[i]
  i += 1
  if (len === 0x81) { len = buf.readUInt16LE(i); i += 2 }
  else if (len === 0x82) { len = buf.readUInt32LE(i); i += 4 }
  return buf.slice(i, i + len).toString('utf8')
}

function matchProjects(text) {
  const toks = [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))]
  const score = {}
  for (const t of toks) {
    if (/^\d{2,}$/.test(t)) {
      for (const p of projects) if (p.houseNum === t) score[p.id] = (score[p.id] || 0) + 3
    } else if (tokenIndex[t]) {
      const ids = tokenIndex[t]
      const w = ids.size === 1 && t.length >= 4 ? 2 : ids.size <= 3 ? 0.5 : 0
      for (const id of ids) score[id] = (score[id] || 0) + w
    }
  }
  return projects.map((p) => ({ p, s: score[p.id] || 0 })).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s)
}
function matchCategories(text) {
  const out = []
  for (const [re, cat] of CATEGORIES) if (re.test(text) && !out.includes(cat)) out.push(cat)
  return out
}

const ORDER_SIGNAL = /\border\b|\bneeds?\b|no .{0,25}on site|still no|never ordered|not on site|don'?t have|asap|ready to order|needs? (to be )?(replaced|exchanged|delivered)/
const NOT_ORDER = /\?|did (you|we) order|delivery date|update on|already ordered|went ahead and ordered|being delivered|delivered on|confirmation|\bcorrect\b|do we have|did we (get|receive)|what.?s the delivery|any update/
const REACTION = /^(Loved|Liked|Emphasized|Laughed at|Questioned|Disliked)\s[“"]/
const TASK_SIGNAL = /\?|can you|could you|\bplease\b|need (you|to)|call me|\bemail\b|send me|let me know|any update|update on|confirm|did (we|you)|where('?s| is| are)?|when (will|is)/i
const URGENT_SIGNAL = /asap|right away|immediately|urgent|\btoday\b|by eod|end of day/i

// --- main: read blob → roster lookup → scan Messages → merge → write ---------
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n✗ Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in scanner/.env — cannot reach the app.\n')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const { data, error } = await sb.from('workbench').select('data').eq('id', 'main').maybeSingle()
if (error) { console.error('\n✗ Could not read the Workbench:', error.message, '\n'); process.exit(1) }
const blob = data && data.data
// SAFETY: never write (and don't even match) unless the blob looks like a real,
// populated Workbench. Same guard the permit scanner uses — protects against
// clobbering on a transient/empty read.
if (!blob || !Array.isArray(blob.roster) || blob.roster.length === 0 || !blob.projects || !Array.isArray(blob.tasks)) {
  console.error('\n✗ Workbench data looks invalid — aborting (nothing read or written).\n')
  process.exit(1)
}
const originalJson = JSON.stringify(data.data) // captured BEFORE we mutate, for the backup
buildLookup(blob.roster) // single source of truth = the live roster

// --- query Messages ----------------------------------------------------------
const numberList = Object.keys(SENDERS).map((n) => `'${n}'`).join(',')
const sql = `
WITH target_chats AS (
  SELECT DISTINCT chj.chat_id FROM chat_handle_join chj
  JOIN handle h ON chj.handle_id = h.ROWID WHERE h.id IN (${numberList})
)
SELECT m.date AS d, m.guid AS guid, h.id AS sender, m.text AS text, hex(m.attributedBody) AS abhex
FROM message m
JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
LEFT JOIN handle h ON m.handle_id = h.ROWID
WHERE cmj.chat_id IN (SELECT chat_id FROM target_chats)
  AND m.is_from_me = 0 AND h.id IN (${numberList})
  AND m.date > ${sinceNs}
ORDER BY m.date ASC;`
const rows = JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', DB, sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) || '[]')

// --- match each message to project(s) + item(s) ------------------------------
const clearMap = new Map() // projectId|category -> proposed order (dedup, latest wins)
const tasks = []
for (const r of rows) {
  const text = (r.text && r.text.trim()) || decodeAttributedBody(r.abhex)
  if (!text || REACTION.test(text)) continue
  const lc = text.toLowerCase()
  const cats = matchCategories(lc)
  const matches = matchProjects(text)
  const when = new Date((Number(r.d) / 1e9 + 978307200) * 1000).toLocaleDateString()
  const who = SENDERS[r.sender] || r.sender
  const full = text.replace(/\s+/g, ' ').trim()
  const quote = full.slice(0, 90)
  const isOrder = ORDER_SIGNAL.test(lc) && !NOT_ORDER.test(lc)

  if (cats.length && matches.length === 1 && isOrder) {
    const p = matches[0].p
    for (const c of cats) clearMap.set(`${p.id}|${c}`, { pid: p.id, address: p.address, category: c, when, who, quote })
    continue
  }
  if (cats.length || TASK_SIGNAL.test(lc)) {
    tasks.push({
      guid: r.guid,
      full,
      quote,
      who,
      when,
      due: URGENT_SIGNAL.test(lc) ? todayYMD : '',
      projectId: matches.length === 1 ? matches[0].p.id : undefined,
      hint: matches[0]?.p?.address || '',
    })
  }
}
const orders = [...clearMap.values()]

// --- print what we found -----------------------------------------------------
console.log(`\n📋 Scan Josh — messages since ${sinceDate.toLocaleDateString()} (${rows.length} scanned)\n`)
if (orders.length) {
  console.log('✅ ORDERS (a clear "order this", one house)')
  for (const o of orders) console.log(`   • ${o.address} → ${o.category}   ⤷ "${o.quote}" (${o.when})`)
}
if (tasks.length) {
  console.log('\n🗂️  TASKS (someone needs something from you)')
  for (const t of tasks) console.log(`   • "${t.quote}"  — ⏳ ${t.who}${t.due ? ' · due today' : ''}${t.hint ? ' · ' + t.hint : ''}`)
}
if (!orders.length && !tasks.length) console.log('Nothing new from Josh in that window.')

// --- merge into the blob (add-only) ------------------------------------------
// ORDERS → the matched house's Materials list. Skip a category the house
// already has (mirrors the app's Quick-Add duplicate guard).
let oAdded = 0, oDup = 0
for (const o of orders) {
  const ps = (blob.projects[o.pid] ??= { orders: [] })
  if (!Array.isArray(ps.orders)) ps.orders = []
  if (ps.orders.some((x) => (x.category || '').toLowerCase() === o.category.toLowerCase())) { oDup++; continue }
  ps.orders.push({ id: crypto.randomUUID(), category: o.category, status: 'toOrder', createdAt: new Date().toISOString() })
  oAdded++
}

// TASKS → ✓ Tasks. Dedup by sourceKey "josh:<message guid>" so a re-scan that
// overlaps never duplicates.
let tAdded = 0, tDup = 0
const existingKeys = new Set(blob.tasks.filter((t) => t.sourceKey).map((t) => t.sourceKey))
const seen = new Set()
for (const t of tasks) {
  const key = `josh:${t.guid}`
  if (seen.has(key) || existingKeys.has(key)) { tDup++; continue }
  seen.add(key)
  blob.tasks.push({
    id: crypto.randomUUID(),
    text: t.full.slice(0, 200),
    category: 'construction',
    ...(t.projectId ? { projectId: t.projectId } : {}),
    waitingOn: t.who,
    ...(t.due ? { dueDate: t.due } : {}),
    sourceKey: key,
    done: false,
    createdAt: new Date().toISOString(),
  })
  tAdded++
}

console.log('\nWorkbench sync:')
console.log(`   orders: +${oAdded} new (${oDup} already on the house)`)
console.log(`   tasks:  +${tAdded} new (${tDup} already captured)`)

if (!doWrite) {
  console.log('\n(PREVIEW — nothing written. Double-click "Scan Josh", or run with  --write , to apply.)\n')
  process.exit(0)
}

// Back the blob up, write, then advance the cursor — in that order, so a failed
// write never loses messages (the cursor only moves on a successful write).
mkdirSync(join(__dir, 'backups'), { recursive: true })
const stamp = runStart.toISOString().replace(/[:.]/g, '-')
writeFileSync(join(__dir, `backups/workbench-josh-${stamp}.json`), originalJson)
const { error: werr } = await sb.from('workbench').upsert({ id: 'main', data: blob, updated_at: new Date().toISOString() })
if (werr) { console.error('\n✗ Write failed (cursor NOT advanced):', werr.message, '\n'); process.exit(1) }
writeFileSync(STATE_FILE, JSON.stringify({ lastScan: runStart.toISOString() }, null, 2))
console.log(`\n✓ Added to your Workbench. Next scan starts from now.\n   Backup: scanner/backups/workbench-josh-${stamp}.json\n`)
