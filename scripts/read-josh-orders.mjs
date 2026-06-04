/**
 * read-josh-orders.mjs — turn Josh/Mickey's texts into proposed material orders.
 *
 * What it does:
 *   1. Reads the macOS Messages database (needs Full Disk Access for the app
 *      running this — already granted).
 *   2. Pulls received messages from Josh & Mickey, plus any group chats they're
 *      in (so a sub's "slab's ready" post is caught too), since a cutoff date.
 *   3. Decodes the newer "attributedBody" messages (whose text isn't in the
 *      plain text column).
 *   4. Scans each for a PROJECT (address/house number) + an ITEM keyword.
 *   5. Prints proposed ORDERS (→ 🛒 Materials tab) AND proposed TASKS — the
 *      questions/asks where someone needs something from you (→ ✓ Tasks tab),
 *      each with its own ready-to-paste lines.
 *
 * Usage:
 *   node scripts/read-josh-orders.mjs                # last 7 days
 *   node scripts/read-josh-orders.mjs --since 2026-05-19
 *
 * It only READS and PRINTS — it never changes your messages or the app. You
 * stay in control: confirm the ones you want, then paste them into Quick-Add.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const DB = join(homedir(), 'Library/Messages/chat.db')

// Who we trust to be reporting order needs. Add numbers here as needed.
const SENDERS = {
  '+13523616750': 'Josh',
  '+13523615679': 'Mickey',
}

// --- date cutoff ---------------------------------------------------------
const sinceArg = process.argv.indexOf('--since')
const sinceDate =
  sinceArg !== -1 && process.argv[sinceArg + 1]
    ? new Date(process.argv[sinceArg + 1] + 'T00:00:00')
    : new Date(Date.now() - 7 * 86400000)
// Messages stores dates as nanoseconds since 2001-01-01. Use BigInt for exactness.
const sinceNs = BigInt(Math.floor(sinceDate.getTime() / 1000) - 978307200) * 1000000000n

// --- 1. roster: build a project lookup from src/data/projects.ts ---------
const projSrc = readFileSync(join(__dir, '../src/data/projects.ts'), 'utf8')
const STOP = new Set(
  ('sw se ne nw n s e w st rd dr ave blvd ln ct ter pl cir run pass way loop unit model fl ' +
    'florida terrace court place boulevard drive street road lane circle ' +
    'southwest northwest northeast southeast dunnellon ocala belleview summerfield ocklawaha').split(' '),
)
const projects = []
for (const line of projSrc.split('\n')) {
  const m = line.match(/id:\s*(\d+),\s*address:\s*"([^"]*)"[\s\S]*?subdivision:\s*"([^"]*)"/)
  if (!m) continue
  const id = +m[1]
  const address = m[2]
  const subdivision = m[3]
  const tokens = `${address} ${subdivision}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const houseNum = (address.match(/\d+/) || [])[0] || ''
  projects.push({ id, address, subdivision, tokens: new Set(tokens), houseNum })
}
// token -> set of project ids (to know which words are distinctive)
const tokenIndex = {}
for (const p of projects)
  for (const t of p.tokens) {
    if (STOP.has(t) || t.length < 3) continue
    ;(tokenIndex[t] ??= new Set()).add(p.id)
  }

// --- item keywords (incl. Josh's real-world spellings) -------------------
const CATEGORIES = [
  [/truss/, 'Trusses'],
  [/framing|frame pack/, 'Framing package'],
  [/slab|slap package/, 'Slab package'], // "slap" = his typo for slab
  [/\bblock/, 'Block'],
  [/lintel|lentil/, 'Lintels'], // he writes "lentils"
  [/floor/, 'Flooring'],
  [/cabinet/, 'Cabinets'],
  [/\blight(ing)?\b/, 'Lighting package'],
  [/\btile/, 'Bathroom tile'],
  [/garage door/, 'Garage door'],
  [/dumpster/, 'Dumpster'],
  [/porta|port o|ports potty|porta-potty/, 'Porta-potty'],
  [/\bsand\b/, 'Sand'],
]

// --- 2. decode attributedBody (binary) -----------------------------------
function decodeAttributedBody(hex) {
  if (!hex) return ''
  const buf = Buffer.from(hex, 'hex')
  const marker = buf.indexOf(Buffer.from('NSString'))
  if (marker === -1) return ''
  const plus = buf.indexOf(0x2b, marker + 8) // '+' precedes the length
  if (plus === -1) return ''
  let i = plus + 1
  let len = buf[i]
  i += 1
  if (len === 0x81) {
    len = buf.readUInt16LE(i)
    i += 2
  } else if (len === 0x82) {
    len = buf.readUInt32LE(i)
    i += 4
  }
  return buf.slice(i, i + len).toString('utf8')
}

// --- 3. query the DB -----------------------------------------------------
const numberList = Object.keys(SENDERS).map((n) => `'${n}'`).join(',')
const sql = `
WITH target_chats AS (
  SELECT DISTINCT chj.chat_id FROM chat_handle_join chj
  JOIN handle h ON chj.handle_id = h.ROWID WHERE h.id IN (${numberList})
)
SELECT m.date AS d, h.id AS sender, m.text AS text, hex(m.attributedBody) AS abhex
FROM message m
JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
LEFT JOIN handle h ON m.handle_id = h.ROWID
WHERE cmj.chat_id IN (SELECT chat_id FROM target_chats)
  AND m.is_from_me = 0 AND h.id IN (${numberList})
  AND m.date > ${sinceNs}
ORDER BY m.date ASC;`
const rows = JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', DB, sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) || '[]')

// --- 4. match each message to project(s) + item(s) -----------------------
function matchProjects(text) {
  const toks = [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))]
  const score = {}
  for (const t of toks) {
    if (/^\d{2,}$/.test(t)) {
      // a house number is a strong, unique signal
      for (const p of projects) if (p.houseNum === t) score[p.id] = (score[p.id] || 0) + 3
    } else if (tokenIndex[t]) {
      const ids = tokenIndex[t]
      const w = ids.size === 1 && t.length >= 4 ? 2 : ids.size <= 3 ? 0.5 : 0
      for (const id of ids) score[id] = (score[id] || 0) + w
    }
  }
  return projects
    .map((p) => ({ p, s: score[p.id] || 0 }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s)
}
function matchCategories(text) {
  const out = []
  for (const [re, cat] of CATEGORIES) if (re.test(text) && !out.includes(cat)) out.push(cat)
  return out
}

// Phrases that mean "please order this" vs. "just asking / already handled".
const ORDER_SIGNAL = /\border\b|\bneeds?\b|no .{0,25}on site|still no|never ordered|not on site|don'?t have|asap|ready to order|needs? (to be )?(replaced|exchanged|delivered)/
const NOT_ORDER = /\?|did (you|we) order|delivery date|update on|already ordered|went ahead and ordered|being delivered|delivered on|confirmation|\bcorrect\b|do we have|did we (get|receive)|what.?s the delivery|any update/
// Tapback reactions ("Loved …", "Liked …") aren't real messages.
const REACTION = /^(Loved|Liked|Emphasized|Laughed at|Questioned|Disliked)\s[“"]/
// A message that's a request/ask aimed at you → propose it as a TASK.
const TASK_SIGNAL =
  /\?|can you|could you|\bplease\b|need (you|to)|call me|\bemail\b|send me|let me know|any update|update on|confirm|did (we|you)|where('?s| is| are)?|when (will|is)/i
// Words that mean "do this today".
const URGENT_SIGNAL = /asap|right away|immediately|urgent|\btoday\b|by eod|end of day/i

const clearMap = new Map() // projectId|category -> entry (dedup, latest wins)
const tasks = [] // request/question messages → proposed Tasks
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

  // 1) A clear material order for exactly one project → Materials Quick-Add.
  if (cats.length && matches.length === 1 && isOrder) {
    const p = matches[0].p
    for (const c of cats) clearMap.set(`${p.id}|${c}`, { p, c, when, who, quote })
    continue
  }

  // 2) Anything else that's a request/ask, or an item-related question/status,
  //    is "someone needs something from you" → propose it as a Task (you
  //    confirm). The sender becomes "waiting on you"; ASAP/today → due today.
  const isRequest = TASK_SIGNAL.test(lc)
  if (cats.length || isRequest) {
    tasks.push({
      full,
      quote,
      who,
      when,
      due: URGENT_SIGNAL.test(lc) ? 'today' : '',
      hint: matches[0]?.p?.address || '',
    })
  }
}
const clear = [...clearMap.values()]

// --- 5. print ------------------------------------------------------------
const pasteLines = new Set()
const houseWord = (p) => p.houseNum || p.address.toLowerCase().split(/[^a-z0-9]+/).filter((t) => !STOP.has(t))[0]

console.log(`\n📋 Order capture — messages since ${sinceDate.toLocaleDateString()} (${rows.length} scanned)\n`)

if (clear.length) {
  console.log('✅ PROPOSED ORDERS (a real "order this" request, one project)')
  for (const e of clear) {
    console.log(`   • ${e.p.address} → ${e.c}`)
    console.log(`       ⤷ "${e.quote}" — ${e.who}, ${e.when}`)
    pasteLines.add(`${houseWord(e.p)} ${e.c.split(' ')[0].toLowerCase()}`)
  }
}

if (pasteLines.size) {
  console.log('\n📥 Materials Quick-Add — paste into the 🛒 Materials tab:')
  for (const l of pasteLines) console.log(`   ${l}`)
}

if (tasks.length) {
  console.log('\n🗂️  PROPOSED TASKS (someone needs something from you)')
  for (const t of tasks) {
    const tags = [`⏳ ${t.who}`, t.due ? 'due today' : '', t.hint].filter(Boolean).join(' · ')
    console.log(`   • "${t.quote}"  — ${tags}`)
  }
  console.log('\n📥 Tasks — paste into the ✓ Tasks tab (the “Paste from a text scan” box):')
  for (const t of tasks) {
    const safe = t.full.replace(/\s*\|\s*/g, ' / ') // protect our " | " delimiter
    const segs = [safe, `waiting:${t.who}`]
    if (t.due) segs.push('due:today')
    segs.push('hat:office')
    console.log(`   ${segs.join(' | ')}`)
  }
}

if (!clear.length && !tasks.length) console.log('No order- or task-related messages found in that window.')
console.log('')
