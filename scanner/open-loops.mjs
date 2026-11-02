#!/usr/bin/env node
// open-loops.mjs — the "Open Loops" radar sweep (Nov 2026).
//
// One place for every open ask / request / commitment across Adam's work,
// filled automatically. READ-ONLY by default: it reads mail (Graph), texts
// (the Mac's Messages database) and the Monday Construction Job List, then
// prints + saves a report of what it would put on the Open Loops board.
// Nothing is emailed, texted or written to Monday unless --write is given
// AND an Open Loops board id is configured (see BOARD below).
//
//   node scanner/open-loops.mjs                 → dry run, report in ~/Documents/Claude/Open Loops/
//   node scanner/open-loops.mjs --days 45       → look back 45 days (default 30)
//   node scanner/open-loops.mjs --write         → also upsert the Monday board (needs BOARD.id)
//   node scanner/open-loops.mjs --json          → print the JSON instead of the summary
//
// What counts as an open loop (v1 heuristics — tune the regexes below):
//   MAIL   the LAST message in a thread is an ask and nobody has answered.
//            to-us    someone asked Adam/office@ and we have not replied     → waiting on Adam
//            from-us  we asked someone and they have not replied             → waiting on them
//            promise  our last message says "I will …" and nothing followed  → Adam owes it
//          A reply under a different subject counts when it is from the same person
//          AND about the same house / same subject (per the verify-done rule); those
//          show as "closed (evidence)" in the report instead of on the board.
//   TEXTS  same idea on the Pam / Josh / Diana / William chats + the group chats; a
//          reaction from Adam counts as a reply; asks aimed at someone else by name are skipped.
//   MONDAY a CJL Notes cell that says "waiting on / TBD / follow up / must come from…",
//          or the newest item comment by someone other than Adam that is an ask.
//
// Each loop carries a stable `key` so the board can be upserted and loops can close
// themselves when their evidence changes on the next sweep.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadEnv, mondayQuery, createItem, setColumns, createUpdate, CJL_BOARD_ID, CJL } from './monday.mjs'

// ---- config -----------------------------------------------------------------
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => {
  if (!a.startsWith('--')) return [null, null]
  const next = all[i + 1]
  return [a.slice(2), next && !next.startsWith('--') ? next : true]
}).filter(([k]) => k))
const DAYS = Number(args.days || 30)
const MIN_AGE = { 'to-us': Number(args['min-to-us'] ?? 1), 'from-us': Number(args['min-from-us'] ?? 3), promise: 3 }
const OUT_DIR = args.out || join(homedir(), 'Documents', 'Claude', 'Open Loops')
const WRITE = !!args.write

// The Open Loops board (Properties workspace). Empty until Adam OKs creating it;
// --write does nothing until id + column ids are filled in.
const BOARD = {
  id: 18438166074, // https://the-network-empire.monday.com/boards/18438166074 (created Nov 2 2026)
  cols: { status: 'color_mm8qw0sa', owner: 'color_mm8q7h2b', waitingOn: 'text_mm8qaz8r', whoAsked: 'text_mm8q5cnv', house: 'board_relation_mm8qyqbk', firstSeen: 'date_mm8qmqh5', source: 'link_mm8q2mer', evidence: 'text_mm8qtj7c', note: 'long_text_mm8qnkqp', details: 'long_text_mm8q5wyr', key: 'text_mm8q6cs', days: 'numeric_mm8qn1zm' },
  status: { open: 'Open', auto: 'Closed (auto)', adam: 'Closed by Adam', notLoop: 'Not a loop' },
  groups: { open: 'topics', closed: 'group_mm8q3a4t' },
  archiveAfterDays: 7, // closed rows leave the board after a week
}
const POSTED = join(OUT_DIR, 'details-posted.json') // which cards already carry their full message as an update
const LESSONS = join(OUT_DIR, 'lessons.json') // what Adam wrote in "Note to Claude" / marked "Not a loop" — read by the daily task

const MAILBOXES = ['office@ironshieldconstruction.com', 'adam@ironshieldconstruction.com', 'cassidy@ironshieldconstruction.com']
const OUR_DOMAIN = 'ironshieldconstruction.com'
const SKIP_FOLDERS = /^(deleted items|junk email|drafts|outbox|sync issues|conversation history|rss feeds|snoozed|archive)$/i
// Threads that have their own watcher / pipeline — not for this radar.
const PIPELINE_RE = /resend (it|them|the invoices?( above)?) to data@|send all invoices going forward to data@/i

// Texts: who is who. is_from_me = Adam on this Mac.
const PEOPLE = {
  '+13523615679': 'Pam', '+13523616750': 'Josh', '+13528904193': 'Diana', '+13523422206': 'William',
  '+13524339205': 'Craig', '+19045011474': 'Andrea', '+13524842581': 'Tabby', '+13524616512': 'Carey',
  '+13523005473': 'Jessica', '+18135100104': 'Madison Caputo', '+13522331121': 'Jake Henry', '+13523628959': 'Adam (cell)',
}
const CHATS = [
  { id: 334, name: 'Pam + Josh group', group: true },
  { id: 1, name: 'Pam' }, { id: 63, name: 'Josh' }, { id: 19, name: 'Diana' }, { id: 53, name: 'William' },
  { id: 259, name: 'Construction Crew', group: true },
  { id: 407, name: 'Caputo house chat', group: true },
]
const TEAM_NAMES = /\b(pam|josh|diana|william|craig|andrea|tabby|carey|jessica|madison|jake)\b/i

// ---- ask / closer / noise heuristics ----------------------------------------
const ASK_RE = /\?|\bplease (?!see|find|note|refer|keep in mind|be advised|disregard|contact|reach out|log ?in|update your records|share your|feel free|remit)\w+|\b(can|could|would|will) (you|y'all|someone|anyone|we get)\b|\blet (me|us) know\b|\bsend (me|us|over|it|them)\b|\b(we|i|they) need(s)? (you|a|an|the)\b|\bneed(s|ed)? (you|from you)\b|\bconfirm\b|\bwhen (can|will|do|does|is|are)\b|\bapprov(e|al)\b|\bschedule\b|\bany update\b|\bstatus (on|of)\b|\bfollow(ing)? up\b|\bchecking in\b|\bwaiting (on|for)\b|\breminder\b|\basap\b/i
const PROMISE_RE = /\b(i|we)('ll| will) (send|get|reach|update|let|follow|have|call|check|circle|confirm|forward|look)\b|\bwill (update|send|get back|reach out|let you know|follow up)\b/i
const CLOSER_RE = /^\s*(thank(s| you)|got it|perfect|sounds good|received|will do|ok(ay)?|great|awesome|noted|done|👍|you're welcome|no problem|yes|no)[\s!.,]*(thank(s| you)[!.]*)?\s*$/i
const NOISE_RE = /unsubscribe|view (this email |it )?(in|online)|(in|web) browser|verification code|rewards|webinar|flyer|subscription|your receipt|your statement|statement from|password|received this (notice|email|message) in error|do not reply|automated (message|email)|survey|how likely are you|your package|your delivery|your order has|delivery schedule|sale\b|training|lots? (for sale|available)|funding|fudning|loan offer|off-market|builder-ready|change how you receive|still looking for|feel free to reach|here as a resource/i
const AUTOMATED_RE = /no-?reply|donotreply|do-not-reply|notification|mailer|newsletter|alerts?@|billing@|receipts?@|invoices?@|quickbooks|intuit|docusign|monday\.com|indeed|linkedin|facebook|google\.com|apple\.com|amazon|paytrace|typeform|vercel|supabase|github|zoom|calendly|dropbox|adobe|godaddy|microsoft|bounce|postmaster|mailchimp|constantcontact|hubspot|salesforce|zillow|realtor\.com|lowes|homedepot|builderportal|customer ?experience|primo|office ?depot|ups\.com|sunpass|surepayroll|tactacam|spectrum|scribe|deluxe|chiefarchitect|copytrans|onesite/i
const AUTO_SUBJECT_RE = /^(automatic reply|out of office|undeliverable|delivery (status|failure)|read:|accepted:|declined:|tentative:)/i
const URLISH_RE = /https?:\/\/|www\.|mailto:|\[cid:|urldefense|cloud-protect|\.(com|net|org|gov|us)\b.*</i
// Our own signature + the county's — everything from here down is not a sentence.
const SIG_RE = /^(adam stiles|william stiles|iron shield construction|office:? ?\(?\d{3}|cell:? ?\(?\d{3}|empowering marion for success|\d{3}[-.) ]\d{3}[-.]\d{4}\s*$)/i

// consequence 1..5 — what a stalled loop costs. Higher = digest first.
const CONSEQUENCE = [
  [5, /\b(permit|inspection|inspector|county|reviewer|rejection|rejected|comments|energov|c\.?o\.?\b|certificate of occupancy|noc|lien|stop work|affidavit)\b/i],
  [5, /\b(lender|draw|closing|title|escrow|wire|appraisal|loan|funding|onesite|ffb|release)\b/i],
  [4, /\b(power|electric|seco|duke|meter|water|mcu|septic|dep|well|utility|transformer|underground|overhead|pole|ug)\b/i],
  [3, /\b(truss|window|cabinet|door|flooring|lvp|quartz|sod|dumpster|concrete|block|roof|order|deliver|delivery|quote|estimate|schedule|crew|plans|blueprints|calcs)\b/i],
  [3, /\b(w-?9|coi|insurance|certificate|notar|sign|invoice|payment)\b/i],
]
// Adam, Nov 2 2026: "When it comes to invoices or late payments, all of that will go to data since
// I'm not on the accounting team." Payment-reminder / overdue / "we'll mail a check" mail is closed
// with that reason instead of landing on his board (the accounting team works data@).
const BILLING_RE = /past due|overdue|payment reminder|outstanding (invoice|balance)|expect(ing)? (a )?payment|\b(making|make|made|mail(ed)?|sending|send) (a |the )?(payment|check)\b|balance (due|owed)|late (fee|payment)|statement of account|\bacct ?#/i
const BILLING_EVIDENCE = 'billing → data@ / accounting (Adam, 11/2: not his loop)'
// Adam, Nov 2 2026 (JB Wells, "Can you confirm or resend"): "already taken care of ... Make sure you have
// all the context before adding this to my open cards." Carey had emailed the signed LOA for 24028 at 1:15;
// their server delayed it, so at 1:41 they asked where it was. When an ask is "I don't see it / resend",
// what we sent that person on the same house/subject in the 2 days BEFORE it is the answer.
const RESEND_RE = /\bre-?send\b|\b(don'?t|do not|didn'?t|did not|can'?t|cannot|haven'?t|have not) (see|have|find|get|got|receive)|\bnot (seeing|received|getting)\b|\bnever (got|received|came)\b/i
const ORDER_RE = /^can i please have the following (order|removed)|^(swap out|remove|deliver) (dumpster|porta)/i
const consequence = (s) => (ORDER_RE.test(s) ? 2 : CONSEQUENCE.find(([, re]) => re.test(s))?.[0] ?? 2)
const scoreOf = (cons, ageDays) => cons * 10 + Math.min(Math.round(ageDays), 30)

const days = (ms) => (Date.now() - ms) / 86_400_000
const ymd = (d) => new Date(d).toISOString().slice(0, 10)
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const short = (s, n = 110) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const bareSubject = (s) => squash(s).replace(/^((re|fw|fwd|aw|wg)\s*:\s*|\[external\]\s*)+/gi, '').toLowerCase()

/** Drop quoted history, URLs and signatures so only the new words are judged. */
function cleanBody(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n')
  const out = []
  for (const raw of lines) {
    const l = raw.trim()
    if (/^(from|sent|to|subject):\s/i.test(l) && out.length > 1) break
    if (/^-{2,}\s*(original message|forwarded message)/i.test(l)) break
    if (/^on .{6,160} wrote:?$/i.test(l)) break
    if (SIG_RE.test(l) && out.length > 0) break
    if (/^>/.test(l) || URLISH_RE.test(l) || !l) continue
    if (/^(thanks|thank you|best|regards|sincerely|kind regards|respectfully|thanks again)[,!.]?\s*$/i.test(l) && out.length > 1) break
    out.push(l)
  }
  return out.join('\n').trim()
}
// Courtesy lines ("let me know if you have any questions") are not asks — blank them before testing.
const COURTESY_RE = /\b(please )?(let (me|us) know|reach out|feel free to (reach out|contact|call|email))( to me)? if (you|there'?s| there is)[^.?!\n]*[.?!]?|\bif you have any (questions|concerns)[^.?!\n]*[.?!]?|\bshould you (have any questions|need (any |additional |further )?(assistance|help|anything))[^.?!\n]*[.?!]?|\b(please )?(do not|don'?t) hesitate to (contact|reach|call|email)[^.?!\n]*[.?!]?/gi
const deCourtesy = (t) => String(t ?? '').replace(COURTESY_RE, ' ')
const isAsk = (t) => { const c = deCourtesy(t); return ASK_RE.test(c) && !CLOSER_RE.test(c) }
/** The sentence that holds the ask — what goes in the "What" column. */
function askLine(text, fallback) {
  // a line break before a lowercase word is the email's hard wrap, not a new sentence ("photos below and\nlet us know")
  const sents = deCourtesy(text).replace(/([^.?!:;\n])\n(?=[a-z])/g, '$1 ').split(/(?<=[.?!])\s+|\n+/).map(squash).filter((s) => s.length > 3)
  const hit = sents.find((s) => /\?/.test(s)) || sents.find((s) => ASK_RE.test(s)) || sents.find((s) => PROMISE_RE.test(s)) || sents[0]
  return short(hit || fallback || '', 300)
}

// Card titles (Adam, Nov 2 2026: "easier to see what the description is ... clunky clicking on it").
// The title is the ask in plain words, short enough to read on the card without opening it;
// the full message goes in the Details column.
const FILLER_RE = /^((hi|hello|hey|good (morning|afternoon|evening))\b[^,.!]*[,.!]\s*|(also|and|so|ok(ay)?|great),?\s+|(could|can|would|will) (you|y'all|we|i) (please |kindly )?|(please|kindly) |if (we|you) could (please )?|whenever you get a chance,?\s*|i just wanted to |just (a )?(reminder|checking in)( that)?,?\s*)/i
const TITLE_REWRITES = [
  [/^have the following (order )?delivered to /i, 'Deliver order to '],
  [/^have the following removed from (our )?/i, 'Pick up from '],
  [/^\[\d{4}-\d{2}-\d{2}\]\s*/, ''], // "[2026-06-08] Water: …" (dated job-list notes)
  [/,?\s*(that would be great|i would (greatly )?appreciate it|thank you|thanks)[!.]*$/i, ''],
  [/,?\s*(Ocala|Dunnellon|Bronson|Belleview|Citra|Summerfield|Silver Springs),?\s*FL\s*\d{5}(-\d{4})?/gi, ''],
]
function titleOf(what) {
  let t = squash(what).replace(/…$/, '')
  for (let i = 0; i < 4 && FILLER_RE.test(t); i++) t = t.replace(FILLER_RE, '')
  for (const [re, to] of TITLE_REWRITES) t = t.replace(re, to)
  t = t.replace(/[?.!:,\s]+$/, '').replace(/\s+(and|or|but|so)$/i, '').trim() // "photos below and" once the courtesy tail is cut
  t = t.charAt(0).toUpperCase() + t.slice(1)
  if (t.length > 80) t = t.slice(0, 80).replace(/[\s,;:-]+\S*$/, '') + '…'
  return t || short(squash(what), 80)
}

/** The card's Details column: their exact words first (the card shows the first two lines),
 *  then who / when / subject underneath. Greetings are dropped so line one is the substance. */
function detailOf(text, from) {
  const body = String(text ?? '').replace(/\[(image|cid)[^\]]*\]/gi, '').replace(/\n{3,}/g, '\n\n').replace(/^\s*(hi|hello|hey|good (morning|afternoon|evening))\b[^\n]*\n+/i, '').trim()
  return `${body.slice(0, 1500)}\n\n— ${from}`
}

// ---- people + companies --------------------------------------------------------
// Adam, Nov 2 2026: "Who asked" (and Waiting on) must be a person or company he recognizes —
// never "CJL Notes" or a bare email address. Name from the email's display name or a
// first.last address, company from the domain; role inboxes (csr@, releases@) show the company.
const COMPANIES = {
  'marionfl.org': 'Marion County', 'floridaexpress.us': 'Florida Express', 'preferredmaterials.com': 'Preferred Materials',
  'secoenergy.com': 'SECO', 'duke-energy.com': 'Duke Energy', 'floridadep.gov': 'Florida DEP', 'luminate.bank': 'Luminate Bank',
  'ironshieldheatingandair.com': 'Iron Shield Heating & Air', 'jbwellsandwater.com': 'JB Wells & Water', 'alandsonsmw.com': 'Al & Sons',
  'lamkadesign.com': 'Lamka Design', 'smyrnareadymix.com': 'Smyrna Ready Mix', 'ironshieldconstruction.com': 'Iron Shield',
  'bldr.com': 'BFS', 'fgtcabinetry.com': 'FGT Cabinetry', 'stonebridgekitchenandbath.com': 'Stonebridge Kitchen & Bath',
  'signaturetitleocala.com': 'Signature Title', 'ironshieldplumbing.com': 'Iron Shield Plumbing', 'blueskyocala.com': 'Blue Sky Ocala',
}
const FREEMAIL_RE = /^(gmail|yahoo|aol|outlook|hotmail|icloud|me|live|msn|comcast|att|bellsouth|earthlink)\./i
const ROLE_RE = /^(csr|dispatch|releases?|calcs|info|office|admin|owner|sales|service|support|billing|accounts?|ap|ar|orders?|draws|engineering\w*|buildingsafety|mcbuildingsafety|osp_csa|eda-\w+|tssnorth|customerservice|permits?|scheduling|estimating|data|orlando|buildingsafetyforms|bsuccst)$/i
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
function companyOf(addr) {
  const d = domainOf(addr || '').toLowerCase()
  if (!d || !d.includes('.') || FREEMAIL_RE.test(d)) return ''
  return COMPANIES[d] || COMPANIES[d.split('.').slice(-2).join('.')] || cap(d.split('.').slice(-2)[0])
}
function personOf(name, addr) {
  const local = (addr || '').split('@')[0]
  if (ROLE_RE.test(local)) return '' // a shared inbox's display name is a department ("Engineering MSA"), not a person
  let n = squash(name).replace(/\s*\([^)]*\)\s*$/, '') // "Rusnak, Kimberly (Preferred Materials)"
  if (n.includes('@')) n = ''
  n = n.replace(/^([^,]+),\s*(.+)$/, '$2 $1') // "Portera, Joseph" → "Joseph Portera"
  if (n && !/^[A-Z][A-Za-z'’.-]+( [A-Z][A-Za-z'’.-]+){0,3}$/.test(n)) n = '' // "EDA - Ocala", "OSP_CSA" aren't people
  if (!n && /^[a-z]+[._][a-z]+$/i.test(local)) n = local.split(/[._]/).map(cap).join(' ')
  const co = companyOf(addr).split(' ')[0]
  if (n && co && n.toLowerCase().includes(co.toLowerCase())) n = '' // "Lamka Design Services" is the company again
  return n
}
/** "Terry Roach, Donald Hanchar (Marion County)" · "Florida Express" · "Michelle Hirst" */
function partyLabel(people) {
  let persons = [...new Set(people.map(([n, a]) => personOf(n, a)).filter(Boolean))]
  // our own people cc'd on the thread (William on a lender email) aren't the other side
  if (persons.some((n) => !TEAM_NAMES.test(n))) persons = persons.filter((n) => !TEAM_NAMES.test(n))
  const companies = [...new Set(people.map(([, a]) => companyOf(a)).filter(Boolean))]
  const who = persons.length > 2 ? `${persons.slice(0, 2).join(', ')} +${persons.length - 2}` : persons.join(', ')
  if (who && companies.length === 1) return `${who} (${companies[0]})`
  return who || companies.join(', ') || people.map(([n, a]) => n || a).join(', ')
}

// Who a job-list note is about: the company/person named in it ("MCU (Jessie Richman)",
// "Carrie Hyde (MCU)", "waiting on Davey (Taylor)"). Order matters: first match wins.
const NOTE_PARTIES = [
  [/\bMCU\b|marion county utilit/i, 'MCU'], [/JB Wells/i, 'JB Wells & Water'], [/\bDavey\b/i, 'Davey Tree'], [/\bComcast\b/i, 'Comcast'],
  [/Zacour/i, 'Alfonso Zacour'], [/Lamka/i, 'Lamka Design'], [/Hirst/i, 'Hirst Surveying'], [/Florida Express|FL Express/i, 'Florida Express'],
  [/\bFFB\b|First Federal/i, 'First Federal Bank'], [/\bDEP\b|septic/i, 'Florida DEP'], [/\bDuke\b/i, 'Duke Energy'], [/\bSECO\b/i, 'SECO'],
  [/\bcounty\b|EnerGov|\bpermit\b|inspect/i, 'Marion County'],
]
const isCompanyWord = (s) => NOTE_PARTIES.some(([re]) => re.test(s))
function noteParty(clause) {
  const company = NOTE_PARTIES.find(([re]) => re.test(clause))?.[1] || ''
  let person = ''
  for (const [, a, b] of clause.matchAll(/([A-Z][A-Za-z&]+(?: [A-Z][a-z]+)?) \(([A-Z][A-Za-z&]+(?: [A-Z][a-z]+)?)\)/g)) {
    if (isCompanyWord(a) && !isCompanyWord(b)) person = b
    else if (isCompanyWord(b) && !isCompanyWord(a)) person = a
    if (person) break
  }
  if (person && company && person !== company) return `${person} (${company})`
  return company || person || 'Iron Shield team'
}
// A note that says we're waiting ON someone ("waiting on Davey", "sent to MCU", "well date TBD")
// is theirs to move; one that says what WE still have to do ("re-file stop", "reschedule") is Adam's.
const NOTE_THEIRS_RE = /\b(waiting on|awaiting|tbd|sent to|must come from|sending to|to pull|followed? up|said|emailed)\b/i

// ---- houses (Monday CJL) ------------------------------------------------------
let HOUSES = []
async function loadHousesWithNotes() {
  const d = await mondayQuery(`query { boards(ids:[${CJL_BOARD_ID}]) { items_page(limit:500) { items {
    id name updated_at group { id title } column_values(ids:["${CJL.parcel}","${CJL.permit}","${CJL.notes}"]) { id text }
    updates(limit:3) { text_body created_at creator { name } } } } } }`)
  return d.boards[0].items_page.items.map((it) => {
    const cv = Object.fromEntries(it.column_values.map((c) => [c.id, squash(c.text)]))
    const name = squash(it.name).replace(/^CFP_/, '')
    const m = name.match(/^(\d+)\s+(?:(N|S|E|W|NE|NW|SE|SW)\s+)?(\d+(?:st|nd|rd|th)?|[A-Za-z]+)/i)
    return {
      id: it.id, name, groupId: it.group.id, group: it.group.title, updatedAt: it.updated_at,
      parcel: cv[CJL.parcel], permit: cv[CJL.permit], notes: cv[CJL.notes], updates: it.updates,
      url: `https://the-network-empire.monday.com/boards/${CJL_BOARD_ID}/pulses/${it.id}`,
      // "4168 SW 112th Ln" → number 4168 + street token "112"; "TBD SW Marine Blvd" → parcel/permit only
      num: m?.[1], street: m?.[3]?.replace(/(st|nd|rd|th)$/i, '').toLowerCase(),
    }
  })
}
function matchHouse(text) {
  const t = String(text ?? '')
  const tl = t.toLowerCase()
  for (const h of HOUSES) {
    if (h.parcel && h.parcel.length >= 8 && t.includes(h.parcel)) return h
    const p = h.permit?.toLowerCase().replace(/\(.*?\)/g, '').trim()
    if (p && p.length >= 8 && tl.includes(p)) return h
  }
  for (const h of HOUSES) {
    if (!h.num || !h.street) continue
    if (new RegExp(`\\b${h.num}\\b[^\\n]{0,25}\\b${h.street}(st|nd|rd|th)?\\b`, 'i').test(t)) return h
  }
  return null
}

// ---- Graph -------------------------------------------------------------------
const env = loadEnv()
let TOKEN = null
async function token() {
  const r = await fetch(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: env.GRAPH_CLIENT_ID, client_secret: env.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('Graph token: ' + j.error_description)
  return j.access_token
}
async function graph(url, tries = 5) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, { headers: { authorization: `Bearer ${TOKEN}`, prefer: 'outlook.body-content-type="text"' } })
    if (r.ok) return r.json()
    const body = await r.text()
    if (i >= tries || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${r.status} ${url.slice(0, 120)} ${body.slice(0, 200)}`)
    await new Promise((res) => setTimeout(res, Number(r.headers.get('retry-after') || 2 ** i) * 1000))
  }
}
async function all(url) {
  const out = []
  while (url) { const j = await graph(url); out.push(...j.value); url = j['@odata.nextLink'] }
  return out
}
const addr = (p) => (p?.emailAddress?.address || '').toLowerCase()
const pname = (p) => (p?.emailAddress?.name || addr(p)).replace(/^'|'$/g, '')
const isOurs = (a) => a.endsWith('@' + OUR_DOMAIN) || a.startsWith('/o=exchangelabs')
const domainOf = (a) => a.split('@')[1] || a

async function sweepMail(sinceIso) {
  TOKEN = await token()
  const byId = new Map() // internetMessageId → message (dedupe across mailboxes)
  const sel = '$select=id,subject,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,conversationId,webLink,isDraft,body,internetMessageId'
  for (const mb of MAILBOXES) {
    const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}`
    const folders = await all(`${base}/mailFolders?$top=100&$select=id,displayName,totalItemCount`)
    for (const f of folders) {
      if (SKIP_FOLDERS.test(f.displayName) || !f.totalItemCount) continue
      let msgs
      try {
        msgs = await all(`${base}/mailFolders/${f.id}/messages?$top=50&${sel}&$filter=receivedDateTime ge ${sinceIso}`)
      } catch (e) { console.error(`  ! ${mb} / ${f.displayName}: ${e.message}`); continue }
      for (const m of msgs) {
        if (m.isDraft) continue
        const key = m.internetMessageId || m.id
        if (byId.has(key)) continue
        const from = addr(m.from)
        byId.set(key, {
          id: m.id, mailbox: mb, folder: f.displayName, subject: squash(m.subject), bare: bareSubject(m.subject), from, fromName: pname(m.from),
          to: (m.toRecipients || []).map(addr), toNames: (m.toRecipients || []).map(pname), cc: (m.ccRecipients || []).map(addr),
          time: new Date(m.receivedDateTime || m.sentDateTime).getTime(), conv: m.conversationId, link: m.webLink,
          text: cleanBody(m.body?.content || ''), outbound: isOurs(from),
        })
      }
    }
  }
  const msgs = [...byId.values()].sort((a, b) => a.time - b.time)
  // display name for every address we've seen, so cc'd people get names too
  const nameBook = new Map()
  for (const m of msgs) { nameBook.set(m.from, m.fromName); m.to.forEach((a, i) => m.toNames[i] && !nameBook.has(a) && nameBook.set(a, m.toNames[i])) }
  for (const m of msgs) m.house = matchHouse(m.subject + '\n' + m.text)
  // People we actually correspond with (anyone we sent to in the window) — cold inbound
  // from anyone else is treated as marketing unless it is a reply to us.
  const contacted = new Set()
  for (const m of msgs) if (m.outbound) for (const a of [...m.to, ...m.cc]) { contacted.add(a); contacted.add(domainOf(a)) }

  // Threads: Outlook conversationId, then merged by bare subject when the same outside party is on both
  // (the same thread shows up with different ids when it lands in office@ and adam@ separately).
  const threads = new Map()
  for (const m of msgs) (threads.get(m.conv) || threads.set(m.conv, []).get(m.conv)).push(m)
  const bySubject = new Map()
  for (const [, list] of threads) {
    const parties = new Set(list.flatMap((m) => [m.from, ...m.to, ...m.cc]).filter((a) => !isOurs(a)))
    const k = list[0].bare
    const existing = bySubject.get(k)
    if (existing && [...parties].some((p) => existing.parties.has(p))) { existing.list.push(...list); for (const p of parties) existing.parties.add(p) } else bySubject.set(k + (existing ? '#' + list[0].conv : ''), { list, parties })
  }

  const loops = []
  for (const { list } of bySubject.values()) {
    list.sort((a, b) => a.time - b.time)
    const last = list[list.length - 1]
    const text = last.text
    if (!text || AUTO_SUBJECT_RE.test(last.subject)) continue
    const house = last.house || list.map((x) => x.house).find(Boolean)
    const base = { source: 'mail', key: `mail:${last.conv}`, subject: last.subject, mailbox: last.mailbox, link: last.link, house: house?.name || '', houseId: house?.id || null, firstSeen: ymd(last.time), ageDays: days(last.time), thread: list.length }
    // A later message from the same party counts as the answer only when it is clearly the same matter.
    const sameMatter = (x) => (house && x.house?.id === house.id) || x.bare === last.bare || (!house && !x.house)
    if (!last.outbound) {
      if (!isAsk(text) || CLOSER_RE.test(text)) continue
      if (AUTOMATED_RE.test(last.from) || AUTOMATED_RE.test(last.fromName) || NOISE_RE.test(text) || NOISE_RE.test(last.subject)) continue
      const known = contacted.has(last.from) || contacted.has(domainOf(last.from)) || /^(re|fw|fwd):/i.test(last.subject) || list.length > 1 || isOurs(last.from)
      if (!known) continue
      const internal = isOurs(last.from)
      const toThem = (x) => x.outbound && (x.to.includes(last.from) || x.cc.includes(last.from)) && sameMatter(x)
      const reply = msgs.find((x) => toThem(x) && x.time > last.time) ||
        (RESEND_RE.test(text) ? msgs.find((x) => toThem(x) && x.time < last.time && last.time - x.time < 2 * 86_400_000) : null)
      const billing = BILLING_RE.test(last.subject + ' ' + text)
      const asker = internal ? `${personOf(last.fromName, last.from) || last.fromName} (team)` : partyLabel([[last.fromName, last.from]])
      loops.push({ ...base, kind: 'to-us', whoAsked: asker, whoAddr: last.from, owner: 'Adam', waitingOn: 'Adam',
        detail: detailOf(text, `${asker} → us · ${when(last.time)} · "${last.subject}"`),
        what: askLine(text, last.subject), consequence: consequence(last.subject + ' ' + text),
        evidence: billing ? BILLING_EVIDENCE : reply ? `we emailed ${last.fromName} ${ymd(reply.time)}${reply.time < last.time ? ' (before they asked — crossed in the mail)' : ''}: "${short(reply.subject, 60)}"` : null })
    } else {
      if (PIPELINE_RE.test(text)) continue
      const them = [...last.to, ...last.cc].filter((a) => !isOurs(a))
      const themNames = last.toNames.filter((_, i) => !isOurs(last.to[i]))
      if (!them.length) continue
      const ask = isAsk(text), promise = !ask && PROMISE_RE.test(text)
      if (!ask && !promise) continue
      const reply = msgs.find((x) => !x.outbound && x.time > last.time && them.includes(x.from) && sameMatter(x) && !AUTO_SUBJECT_RE.test(x.subject))
      const who = partyLabel(them.map((a) => [nameBook.get(a) || '', a]))
      loops.push({ ...base, kind: ask ? 'from-us' : 'promise', whoAsked: ask ? 'Adam' : who, whoAddr: last.from, whoAddrs: them.join(' '), askText: text.slice(0, 2000), owner: ask ? who : 'Adam', waitingOn: ask ? who : 'Adam',
        detail: detailOf(text, `Us → ${who} · ${when(last.time)} · "${last.subject}"`),
        what: askLine(text, last.subject), consequence: ORDER_RE.test(text) ? 2 : consequence(last.subject + ' ' + text),
        evidence: promise && BILLING_RE.test(last.subject + ' ' + text) ? BILLING_EVIDENCE : reply ? `${reply.fromName} replied ${ymd(reply.time)}: "${short(reply.subject, 60)}"` : null })
    }
  }

  // County asks that never get an email reply ("attach this to the permit", "invoice the final
  // fees") close on the permit's EnerGov workflow step instead — public endpoint, no login.
  for (const l of loops) {
    if (l.kind !== 'from-us' || !/marionfl\.org/i.test(l.whoAddrs || '')) continue
    const ev = await energovEvidence(l)
    if (ev) l.evidence = ev
    else if (ev === false) l.what += ' [EnerGov step still open]'
  }
  return loops
}

const ENERGOV = 'https://selfservice.marionfl.org/energov_prod/selfservice/api/energov/workflow/summary/activities/1/'
let CASE_IDS = null
const workflowCache = new Map()
/** true-ish evidence string when the matching step closed, false when it is still open, null when unknown. */
async function energovEvidence(l) {
  const hay = `${l.subject}\n${l.askText || ''}`
  // only two ask shapes are verifiable here: "invoice the final fees" and "attach <DEP/septic letter>"
  const step = /final fee/i.test(hay) ? /collection of final fee/i : /\battach/i.test(hay) && /dep|septic|health/i.test(hay) ? /dep final letter/i : null
  if (!step) return null
  CASE_IDS ??= JSON.parse(readFileSync(new URL('permit-portals.json', import.meta.url), 'utf8'))
  const permits = [...hay.matchAll(/\b(BLDR-\d{2}-\d{2}-\d{5}|20\d{8})\b/g)].map((m) => m[1])
  for (const permit of permits) {
    const caseId = CASE_IDS[permit]
    if (!caseId) continue
    let steps = workflowCache.get(caseId)
    if (!steps) {
      try {
        const r = await fetch(ENERGOV + caseId, { headers: { accept: 'application/json', tenantId: '1' } })
        steps = (await r.json()).Result || []
      } catch { steps = [] }
      workflowCache.set(caseId, steps)
    }
    const hit = steps.find((s) => step.test(s.Name || ''))
    if (!hit) continue
    if (hit.Status === 0) return `EnerGov ${permit}: "${hit.Name}" closed ${(hit.CompletedOn || '').slice(0, 10) || '(no date)'}`
    return false
  }
  return null
}

// ---- Texts (Messages database, read-only) -----------------------------------
function decodeAttributedBody(hex) {
  if (!hex) return ''
  const b = Buffer.from(hex, 'hex')
  const i = b.indexOf('NSString')
  if (i < 0) return ''
  const plus = b.indexOf(0x2b, i + 8)
  if (plus < 0) return ''
  let p = plus + 1
  let len = b[p++]
  if (len === 0x81) { len = b.readUInt16LE(p); p += 2 } else if (len === 0x82) { len = b.readUInt32LE(p); p += 4 }
  return b.subarray(p, p + len).toString('utf8')
}
const when = (t) => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
function sweepTexts(sinceMs) {
  const db = join(homedir(), 'Library', 'Messages', 'chat.db')
  const ids = CHATS.map((c) => c.id).join(',')
  const sinceApple = Math.floor(sinceMs / 1000 - 978307200) * 1e9
  const sql = `select m.ROWID rowid, j.chat_id chat, m.is_from_me me, h.id handle, m.date d, m.text t, hex(m.attributedBody) ab, m.associated_message_type amt, m.associated_message_guid ag, m.guid g
    from message m join chat_message_join j on j.message_id=m.ROWID left join handle h on h.ROWID=m.handle_id
    where j.chat_id in (${ids}) and m.date > ${sinceApple} order by m.date`
  const rows = JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', db, sql], { maxBuffer: 256e6 }).toString() || '[]')
  const byChat = new Map()
  for (const r of rows) {
    const text = squash(r.t || decodeAttributedBody(r.ab)).replace(/￼/g, '').trim()
    const time = r.d / 1e6 + 978307200 * 1000
    ;(byChat.get(r.chat) || byChat.set(r.chat, []).get(r.chat)).push({ ...r, text, time, who: r.me ? 'Adam' : PEOPLE[r.handle] || r.handle, reaction: r.amt >= 2000 && r.amt < 3000 })
  }
  const loops = []
  for (const chat of CHATS) {
    const list = byChat.get(chat.id) || []
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      if (m.reaction || !m.text || m.text.length < 6 || !(isAsk(m.text) || (m.me && PROMISE_RE.test(m.text))) || NOISE_RE.test(m.text)) continue
      // forwarded notices ("If you feel you received this in error…") are not asks
      if (/^(if you|this (is|was) an automated)/i.test(m.text)) continue
      const later = list.slice(i + 1)
      const house = matchHouse(m.text)
      const base = { source: 'text', key: `text:${chat.id}:${m.rowid}`, chat: chat.name, detail: detailOf(m.text, `${m.who} in ${chat.name} texts · ${when(m.time)}`), house: house?.name || '', houseId: house?.id || null, firstSeen: ymd(m.time), ageDays: days(m.time), consequence: consequence(m.text), link: `Messages › ${chat.name} › ${when(m.time)}` }
      if (!m.me) {
        // asks aimed at someone else by name are theirs, not Adam's
        const named = m.text.match(TEAM_NAMES)?.[1]
        if (chat.group && named && !/adam/i.test(m.text)) continue
        const myReply = later.find((x) => x.me && (!x.reaction || x.ag?.includes(m.g)) && days(m.time) - days(x.time) < 3)
        if (myReply && later.indexOf(myReply) <= 8) continue
        const lateReply = later.find((x) => x.me && !x.reaction)
        loops.push({ ...base, kind: 'to-us', whoAsked: m.who, owner: 'Adam', waitingOn: 'Adam', what: askLine(m.text, ''),
          evidence: lateReply ? `Adam replied ${ymd(lateReply.time)}: "${short(lateReply.text, 60)}"` : null })
      } else if (!isAsk(m.text) && PROMISE_RE.test(m.text)) {
        const followUp = later.find((x) => x.me && !x.reaction && x.text.length > 20)
        if (followUp) continue
        loops.push({ ...base, kind: 'promise', whoAsked: chat.name, owner: 'Adam', waitingOn: 'Adam', what: askLine(m.text, ''), evidence: null })
      } else {
        const theirReply = later.find((x) => !x.me && !x.reaction && days(m.time) - days(x.time) < 3)
        if (theirReply && later.indexOf(theirReply) <= 8) continue
        const lateReply = later.find((x) => !x.me && !x.reaction)
        loops.push({ ...base, kind: 'from-us', whoAsked: 'Adam', owner: chat.name, waitingOn: chat.name, what: askLine(m.text, ''),
          evidence: lateReply ? `${lateReply.who} replied ${ymd(lateReply.time)}: "${short(lateReply.text, 60)}"` : null })
      }
    }
  }
  return loops
}

// ---- Monday CJL notes + comments ---------------------------------------------
const NOTE_WAIT_RE = /\b(waiting on|awaiting|tbd|follow(ed)? up|re-?file|must come from|pending|still holding|reschedule|sending to|to pull|date tbd|→)/i
function sweepMonday() {
  const loops = []
  for (const h of HOUSES) {
    if (h.groupId === CJL.groups.dead || h.groupId === CJL.groups.completed) continue
    if (h.notes && NOTE_WAIT_RE.test(h.notes)) {
      // the clause that holds the wait, e.g. "waiting on Davey (Taylor) to pull it"
      const clause = h.notes.split(/\s*[|·]\s*|\.\s+(?=[A-Z])/).find((c) => NOTE_WAIT_RE.test(c)) || h.notes
      // first seen = the newest M/D written inside the note (notes are hand-dated), else the row's last edit
      const dates = [...h.notes.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)].map(([, mo, da, yr]) => new Date(yr ? (yr.length === 2 ? 2000 + +yr : +yr) : new Date().getFullYear(), mo - 1, da).getTime()).filter((t) => t <= Date.now())
      const seen = dates.length ? Math.max(...dates) : new Date(h.updatedAt).getTime()
      const party = noteParty(clause), theirs = NOTE_THEIRS_RE.test(clause)
      loops.push({ source: 'monday', key: `monday:${h.id}:notes`, kind: theirs ? 'from-us' : 'to-us', whoAsked: theirs ? 'Adam' : party, owner: theirs ? party : 'Adam', waitingOn: theirs ? party : 'Adam', house: h.name, houseId: h.id,
        detail: detailOf(h.notes, `Job list note on ${h.name}`),
        what: short(clause, 300), firstSeen: ymd(seen), ageDays: days(seen), consequence: consequence(h.notes), evidence: null, link: h.url })
    }
    const u = h.updates?.[0]
    if (u && !/adam/i.test(u.creator?.name || '') && isAsk(u.text_body || '') && days(new Date(u.created_at).getTime()) >= 2) {
      loops.push({ source: 'monday', key: `monday:${h.id}:update`, kind: 'to-us', whoAsked: u.creator?.name || 'Iron Shield team', owner: 'Adam', waitingOn: 'Adam', house: h.name, houseId: h.id,
        detail: detailOf(u.text_body, `${u.creator?.name || 'Someone'} commented on ${h.name} · ${ymd(u.created_at)}`),
        what: askLine(u.text_body, ''), firstSeen: ymd(u.created_at), ageDays: days(new Date(u.created_at).getTime()), consequence: consequence(u.text_body), evidence: null, link: h.url })
    }
  }
  return loops
}

// ---- main ---------------------------------------------------------------------
const since = Date.now() - DAYS * 86_400_000
console.error(`Open Loops sweep: last ${DAYS} days (since ${ymd(since)})`)
HOUSES = await loadHousesWithNotes()
console.error(`  CJL: ${HOUSES.length} houses`)
const mail = await sweepMail(new Date(since).toISOString().replace(/\.\d+Z$/, 'Z'))
console.error(`  mail: ${mail.length} candidate loops`)
const texts = sweepTexts(since)
console.error(`  texts: ${texts.length} candidate loops`)
const monday = sweepMonday()
console.error(`  monday: ${monday.length} candidate loops`)

// The same ask to the same party about several houses (TSSNorth UG ×3, the G-model affidavit ×4) is ONE loop.
function mergeTwins(list) {
  const out = new Map()
  for (const l of list) {
    const k = `${l.kind}|${l.whoAsked}|${l.waitingOn}|${l.what.toLowerCase().replace(/\d[\d\s\w]*?\b(st|nd|rd|th|ave|blvd|ct|pl|ter|ln|dr|rd)\b/g, '#')}`
    const prev = out.get(k)
    if (!prev) { out.set(k, { ...l, keys: [l.key], houses: l.house ? [l.house] : [], houseIds: l.houseId ? [l.houseId] : [] }); continue }
    prev.keys.push(l.key)
    if (l.house && !prev.houses.includes(l.house)) prev.houses.push(l.house)
    if (l.houseId && !prev.houseIds.includes(l.houseId)) prev.houseIds.push(l.houseId)
    prev.house = prev.houses.join(', ')
    if (l.ageDays > prev.ageDays) { prev.ageDays = l.ageDays; prev.firstSeen = l.firstSeen }
    // the merged loop is answered only when EVERY twin is (one reply on one house's thread
    // doesn't answer the same ask on another house's thread)
    if (!l.evidence) prev.evidence = null
  }
  return [...out.values()]
}
const everything = mergeTwins([...mail, ...texts, ...monday]).map((l) => ({ ...l, score: scoreOf(l.consequence, l.ageDays), ageDays: Math.round(l.ageDays * 10) / 10 }))
// loops Adam marked "Not a loop" stay off the report and the digest too
// (only the ask as it stood when he marked it: a newer ask in the same thread still counts)
let muted = []
try { muted = JSON.parse(readFileSync(LESSONS, 'utf8')).filter((x) => x.status === 'Not a loop') } catch {}
const isMuted = (l) => muted.some((x) => x.keys.some((k) => (l.keys || [l.key]).includes(k)) && !(x.firstSeen && l.firstSeen > x.firstSeen))
const open = everything.filter((l) => !l.evidence && l.ageDays >= MIN_AGE[l.kind] && !isMuted(l)).sort((a, b) => b.score - a.score)
const fresh = everything.filter((l) => !l.evidence && l.ageDays < MIN_AGE[l.kind])
const closed = everything.filter((l) => l.evidence)
const digest = open.slice(0, 5)

mkdirSync(OUT_DIR, { recursive: true })
const stamp = new Date().toISOString().slice(0, 10)
const result = { ranAt: new Date().toISOString(), days: DAYS, open, fresh, closed, digest }
writeFileSync(join(OUT_DIR, `sweep-${stamp}.json`), JSON.stringify(result, null, 2))

const dir = (l) => ({ 'to-us': '→ Adam', 'from-us': 'Adam →', promise: 'Adam owes' })[l.kind]
const who = (l) => (l.kind === 'to-us' ? l.whoAsked : l.kind === 'from-us' ? l.waitingOn : l.whoAsked)
const src = (l) => l.source + (l.subject ? ': ' + short(l.subject, 50) : l.chat ? ': ' + l.chat : '')
const cell = (s) => String(s ?? '').replace(/\|/g, '/')
const row = (l, i) => `| ${i + 1} | ${l.ageDays}d | ${dir(l)} | ${cell(who(l))} | ${cell(short(l.what, 110))} | ${cell(l.house)} | ${cell(src(l))} |`
const table = (list) => ['| # | Age | Dir | Who | What | House | Source |', '|---|---|---|---|---|---|---|', ...list.map(row)].join('\n')
const md = `# Open Loops — dry run ${stamp}

Swept the last ${DAYS} days: office@/adam@/cassidy@ mail, texts with Pam/Josh/Diana/William (+ Construction Crew, Caputo chat), CJL Notes + comments. Nothing was written anywhere.

**Totals:** ${open.length} open · ${fresh.length} too fresh to count yet · ${closed.length} closed by evidence

## Morning digest would be (top 5 by consequence × age)
${table(digest)}

## All open loops (${open.length})
${table(open)}

## Closed by evidence (${closed.length}) — would NOT go on the board
${['| # | Age | Dir | Who | What | Evidence |', '|---|---|---|---|---|---|', ...closed.map((l, i) => `| ${i + 1} | ${l.ageDays}d | ${dir(l)} | ${cell(who(l))} | ${cell(short(l.what, 70))} | ${cell(l.evidence)} |`)].join('\n')}

## Too fresh (${fresh.length}) — under ${MIN_AGE['to-us']}d (to Adam) / ${MIN_AGE['from-us']}d (from Adam)
${table(fresh)}
`
writeFileSync(join(OUT_DIR, `sweep-${stamp}.md`), md)
if (args.json) console.log(JSON.stringify(result, null, 2))
else console.log(md)
console.error(`Saved ${join(OUT_DIR, `sweep-${stamp}.md`)}`)

// ---- optional board write (off until BOARD is configured) --------------------
if (WRITE) await writeBoard()

/** Upsert the board from this sweep. Rules: match by Key; never touch a row whose Status Adam set
 *  (Closed by Adam / Not a loop); open loops that gained evidence become Closed (auto) and move
 *  down; closed rows are archived after a week; everything Adam wrote in "Note to Claude" or
 *  marked "Not a loop" is saved to lessons.json for the daily task to fold into memory + rules. */
async function writeBoard() {
  const C = BOARD.cols
  const d = await mondayQuery(`query { boards(ids:[${BOARD.id}]) { items_page(limit:500) { items {
    id name updated_at group { id } column_values(ids:["${C.status}","${C.key}","${C.note}","${C.firstSeen}","${C.evidence}"]) { id text } } } } }`)
  const rows = d.boards[0].items_page.items.map((it) => {
    const cv = Object.fromEntries(it.column_values.map((c) => [c.id, (c.text ?? '').trim()]))
    return { id: it.id, name: it.name, group: it.group.id, updatedAt: it.updated_at, status: cv[C.status], keys: cv[C.key].split(/\s+/).filter(Boolean), note: cv[C.note], firstSeen: cv[C.firstSeen], evidence: cv[C.evidence] }
  })
  // A key can have several rows over time (a thread Adam closed by hand, then a NEW ask in the
  // same thread later): the newest row (latest First seen) is the one that counts.
  const byKey = new Map()
  for (const r of rows) for (const k of r.keys) (byKey.get(k) || byKey.set(k, []).get(k)).push(r)
  const findRow = (l) => (l.keys || [l.key]).flatMap((k) => byKey.get(k) || []).sort((a, b) => (b.firstSeen || '').localeCompare(a.firstSeen || ''))[0]
  // Adam's hand-close (Closed by Adam / Not a loop) mutes the ask as it stood on that day only.
  // A later message in the same thread that is itself an unanswered ask is a new loop → new card.
  const manual = (r) => r && (r.status === BOARD.status.adam || r.status === BOARD.status.notLoop)
  const mutedBy = (r, l) => manual(r) && !(l.firstSeen && r.firstSeen && l.firstSeen > r.firstSeen)

  // 1. lessons: anything Adam wrote or muted, saved once per row
  let lessons = []
  try { lessons = JSON.parse(readFileSync(LESSONS, 'utf8')) } catch {}
  const have = new Set(lessons.map((x) => x.rowId + '|' + x.note + '|' + x.status))
  for (const r of rows) {
    if (!r.note && r.status !== BOARD.status.notLoop) continue
    const sig = r.id + '|' + r.note + '|' + r.status
    if (have.has(sig)) continue
    lessons.push({ rowId: r.id, keys: r.keys, what: r.name, status: r.status, note: r.note, firstSeen: r.firstSeen, seenAt: new Date().toISOString().slice(0, 10), folded: false })
  }
  writeFileSync(LESSONS, JSON.stringify(lessons, null, 2))

  const linkFor = (l) => {
    if (l.source === 'text') { const h = Object.entries(PEOPLE).find(([, n]) => l.chat.startsWith(n))?.[0] || '+13523615679'; return { url: `sms:${h}`, text: l.link } }
    return { url: l.link, text: l.source === 'mail' ? short(l.subject, 60) : 'CJL row' }
  }
  const columnsFor = (l, status) => ({
    [C.status]: { label: status },
    [C.owner]: { label: l.kind === 'from-us' ? 'Them' : 'Adam' },
    [C.waitingOn]: l.waitingOn, [C.whoAsked]: l.whoAsked, [C.details]: { text: l.detail || l.what },
    [C.house]: { item_ids: [...new Set([l.houseId, ...(l.houseIds || [])].filter(Boolean).map(Number))] },
    [C.firstSeen]: { date: l.firstSeen },
    [C.days]: String(Math.round(l.ageDays)), // numbers column; a formula column doesn't show on Kanban cards
    [C.source]: linkFor(l),
    [C.evidence]: l.evidence || '',
    [C.key]: (l.keys || [l.key]).join(' '),
  })
  const stats = { created: 0, updated: 0, closed: 0, archived: 0, skipped: 0, posted: 0 }
  // The full message goes on the card as its first update, so opening a card shows it straight away
  // (Adam, Nov 2 2026: clicking into the description was clunky). Posted once per card; again only
  // if the thread brings a newer message. Posted as Adam's own update, so it doesn't notify anyone.
  let posted = {}
  try { posted = JSON.parse(readFileSync(POSTED, 'utf8')) } catch {}
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // newMessage: the card reopened because the thread brought a new unanswered message → post that one too
  const postDetail = async (itemId, l, newMessage = false) => {
    const sig = (l.detail || '').slice(0, 300)
    if (!l.detail || (posted[itemId] && !newMessage) || posted[itemId] === sig) return
    await createUpdate(itemId, l.detail.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''))
    posted[itemId] = sig
    writeFileSync(POSTED, JSON.stringify(posted, null, 2))
    stats.posted++
  }

  // 2. open loops → create or refresh
  for (const l of open) {
    const r = findRow(l)
    if (mutedBy(r, l)) { stats.skipped++; continue }
    if (!r || manual(r)) {
      // no row yet — or the newest row is a hand-close older than this ask → a fresh card
      const id = await createItem(BOARD.id, BOARD.groups.open, titleOf(l.what), columnsFor(l, BOARD.status.open))
      stats.created++
      await postDetail(id, l)
    } else if (r.status !== BOARD.status.open || r.group !== BOARD.groups.open) {
      // it had closed (auto) earlier but the ask is back (a new unanswered message) → reopen
      await setColumns(BOARD.id, r.id, { ...columnsFor(l, BOARD.status.open), name: titleOf(l.what) })
      await mondayQuery(`mutation { move_item_to_group(item_id:${r.id}, group_id:"${BOARD.groups.open}") { id } }`)
      stats.updated++
      await postDetail(r.id, l, true)
    } else {
      const c = columnsFor(l)
      await setColumns(BOARD.id, r.id, { name: titleOf(l.what), [C.owner]: c[C.owner], [C.waitingOn]: l.waitingOn, [C.whoAsked]: l.whoAsked, [C.details]: c[C.details], [C.house]: c[C.house], [C.key]: c[C.key], [C.days]: c[C.days] })
      stats.updated++
      await postDetail(r.id, l)
    }
  }
  // 3. loops with evidence → close the row if it is open
  for (const l of closed) {
    const r = findRow(l)
    if (!r || manual(r) || r.status !== BOARD.status.open) continue
    await setColumns(BOARD.id, r.id, { [C.status]: { label: BOARD.status.auto }, [C.evidence]: `${new Date().toISOString().slice(0, 10)} · ${l.evidence}` })
    await mondayQuery(`mutation { move_item_to_group(item_id:${r.id}, group_id:"${BOARD.groups.closed}") { id } }`)
    stats.closed++
  }
  // 4. open rows the sweep no longer sees at all, whose ask is still inside the window → the thread moved on
  const seen = new Set([...open, ...closed, ...fresh].flatMap((l) => l.keys || [l.key]))
  for (const r of rows) {
    if (r.status !== BOARD.status.open || r.keys.some((k) => seen.has(k))) continue
    if (r.firstSeen && days(new Date(r.firstSeen).getTime()) > DAYS) continue // aged out of the window; leave it for Adam
    await setColumns(BOARD.id, r.id, { [C.status]: { label: BOARD.status.auto }, [C.evidence]: `${new Date().toISOString().slice(0, 10)} · sweep no longer finds it open (thread moved on)` })
    await mondayQuery(`mutation { move_item_to_group(item_id:${r.id}, group_id:"${BOARD.groups.closed}") { id } }`)
    stats.closed++
  }
  // 5. archive closed rows after a week (Adam's own closes too — they stay in the archive, searchable)
  for (const r of rows) {
    if (r.group !== BOARD.groups.closed || r.status === BOARD.status.open) continue
    if (days(new Date(r.updatedAt).getTime()) < BOARD.archiveAfterDays) continue
    await mondayQuery(`mutation { archive_item(item_id:${r.id}) { id } }`)
    stats.archived++
  }
  console.error(`board: ${JSON.stringify(stats)} · lessons on file: ${lessons.length}`)
}
