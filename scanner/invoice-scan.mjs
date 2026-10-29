#!/usr/bin/env node
// invoice-scan.mjs — "scan for new invoices"
//
// Since Oct 22 2026 every vendor invoice has to go to data@ironshieldconstruction.com
// (bookkeeping), NOT to office@/adam@. Instead of forwarding invoices over, Adam
// replies to each one asking the vendor to resend it to data@ and to use that
// address from now on. This script finds those invoices and writes the replies
// as Outlook DRAFTS (never sends — Adam reads and clicks Send himself).
//
//   node scanner/invoice-scan.mjs            # list what's waiting (dry run, changes nothing)
//   node scanner/invoice-scan.mjs --draft    # same, then create one reply draft per vendor
//   --days 3                                 # look back further, e.g. after a weekend (default: TODAY only)
//   --mailbox office@…  (repeatable)         # default: office@, adam@, cassidy@ (the three Adam OK'd)
//   --json                                   # machine-readable queue instead of the table
//   --only 1,3  /  --skip 2                  # after reviewing the numbered list, draft only some rows
//
// How it decides (keep this list in sync with the skill ~/.claude/skills/scan-invoices):
//   1. Inbox only, received TODAY (Eastern) unless --days says otherwise, not sent by us,
//      not Monday notifications. Adam (Oct 22 2026): this is a forward-looking transition,
//      never retroactive — don't go digging through old invoices.
//   2. "Invoice-ish" = invoice / statement / past due / amount due / balance due in the
//      subject, preview, or an attachment name. Receipts and OUR payment confirmations
//      (receipt, "Thanks for your order", AutoPay, payment received…) are NOT invoices —
//      those stay with the forward-receipts skill.
//   3. Already handled = we replied to the vendor in that conversation, we already forwarded
//      it to data@ ourselves (then there's nothing to resend — skip it), a reply draft is
//      already sitting in Drafts, or this message id is in the ledger.
//   4. One draft per vendor contact (replyTo if present, else From), on the newest
//      invoice, listing every invoice number we found for them.
//   5. The reply goes to the vendor only. No CC to data@ — the whole point is that the
//      VENDOR resends it there.
//
// Ledger: scanner/invoice-redirects.json (gitignored) remembers which message ids got a
// draft and the date each vendor was first told, so a repeat offender gets the shorter
// "as mentioned on <date>" wording (variant B) and nothing is drafted twice.
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const here = new URL('.', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env', here), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
)

// ---- argv: --draft / --json are flags, --mailbox repeats, --days takes a number
const args = { mailbox: [] }
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '')
  const next = process.argv[i + 1]
  const v = next && !next.startsWith('--') ? process.argv[++i] : true
  if (k === 'mailbox') args.mailbox.push(v)
  else args[k] = v
}
const DATA = 'data@ironshieldconstruction.com'
// Mail from our own people is never a vendor invoice (William forwards things in from his other addresses).
const OUR_PEOPLE_RX = /@(ironshieldconstruction\.com|williamfstiles\.com|mrocalabuyshouses\.com)$|^wfstiles@gmail\.com$/i
const MAILBOXES = args.mailbox.length ? args.mailbox : ['office@ironshieldconstruction.com', 'adam@ironshieldconstruction.com', 'cassidy@ironshieldconstruction.com']
const LEDGER_PATH = new URL('invoice-redirects.json', here)
const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) : { lastScanAt: null, drafted: {}, vendors: {} }

// Look-back window: midnight today in Eastern time; --days N widens it (after a weekend).
// Already-forwarded invoices are skipped either way, so a wider window is safe.
const days = args.days ? Number(args.days) : null
const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
const offsetMs = Date.now() - nowET.getTime()                       // how far ET is from the Mac's clock
const midnightET = new Date(new Date(nowET).setHours(0, 0, 0, 0) + offsetMs)
const since = days ? new Date(Date.now() - days * 864e5) : midnightET
const sinceIso = since.toISOString()

// ---- Graph (app-only, same creds as outlook-draft.mjs)
const tokRes = await fetch(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  body: new URLSearchParams({ client_id: env.GRAPH_CLIENT_ID, client_secret: env.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
})
const tokJson = await tokRes.json()
if (!tokRes.ok) throw new Error(`token: ${tokJson.error_description}`)
const tok = tokJson.access_token
async function graph(url) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${tok}`, ConsistencyLevel: 'eventual' } })
  const text = await r.text()
  if (!r.ok) throw new Error(`GET ${url}: ${r.status} ${text.slice(0, 300)}`)
  return JSON.parse(text)
}
// Follow @odata.nextLink pages until done.
async function all(url) {
  const out = []
  while (url) { const j = await graph(url); out.push(...j.value); url = j['@odata.nextLink'] }
  return out
}

// ---- Classification
const INVOICE_RX = /\b(invoice|inv\b|inv[_\-\s]?\d|statement|past due|amount due|balance due|payment due|remittance)\b/i
// Things that LOOK like money mail but are receipts / confirmations of payments WE made.
const NOT_INVOICE_RX = /\b(receipt|payment confirmation|payment received|payment is being processed|payment has been|thanks for your order|order confirmation|ordered:|autopay|auto-pay|your payment|refund|canceled your automatic|is scheduled|new lead|shipped|tracking)\b/i
const NOREPLY_RX = /no-?reply|donotreply|do-not-reply|notifications?@|mailer-daemon/i
const addr = (p) => (p?.emailAddress?.address ?? '').toLowerCase()
const name = (p) => p?.emailAddress?.name ?? ''

// Pull invoice numbers and a house address out of a subject so the reply can name them.
function invoiceRefs(subject, attachments) {
  // A ref = optional short letter prefix glued to digits, e.g. 3161, 26-3627Bd, INV71310, S1-INV-625, 000492.
  // Letters+space+digits ("INVOICE ON 10") is NOT a ref. Underscores end a ref (attachment names).
  const find = (s) => {
    const refs = new Set()
    for (const m of s.matchAll(/\binv(?:oice)?s?[\s_#:.-]*(?:no\.?|number)?[\s_#:.-]*((?:[A-Z]{1,4}-)?\d[A-Za-z0-9-]{2,14})(?![\w])/gi)) refs.add(m[1])
    for (const m of s.matchAll(/#\s?([A-Z]{0,4}\d{3,}[A-Za-z0-9-]*)/g)) refs.add(m[1])
    return [...refs].filter((r) => /\d{3}/.test(r) && !/^\d{1,2}\/\d/.test(r))
  }
  const fromSubject = find(subject)
  if (fromSubject.length) return fromSubject
  return find(attachments.map((a) => a.name).join(' '))
}
// Vendor name for the queue line: the From display name, else "from X" in the subject, else the domain.
function vendorName(m, contact) {
  const n = name(m.from)
  if (n && !n.includes('@')) return n
  const s = (m.subject ?? '').match(/\bfrom\s+(.+?)\s*$/i)
  if (s) return s[1].replace(/\.$/, '')
  const dom = contact.split('@')[1] ?? ''
  return /gmail|yahoo|hotmail|outlook|aol/i.test(dom) ? contact.split('@')[0] : dom
}
function houseAddress(text) {
  const m = text.match(/\b\d{3,5}\s+(?:NE|NW|SE|SW)\s+\d{1,3}(?:st|nd|rd|th)?\s+(?:St|Street|Ave|Avenue|Pl|Place|Ct|Court|Ter|Terr|Terrace|Ln|Lane|Rd|Road|Blvd|Loop|Cir|Way|Dr)\b\.?(?:\s+Rd)?/i)
  return m ? m[0] : null
}
// "Teresa Meyer" → Teresa; "PENINSULA CONCRETE PUMPING INC" / an email address → no first name.
function firstName(display, email) {
  const d = (display || '').trim()
  if (!d || d.includes('@') || /\d/.test(d)) return null
  if (/\b(inc|llc|co|corp|company|services|supply|concrete|cabinet|plumbing|electric|roofing|design|group|pumping|block|wells|doors|drywall|stucco|insulation|products|surfaces|express|associates|office|billing|accounting|accounts|receivable|ar|team|dept)\b/i.test(d)) return null
  const parts = d.replace(/[,.]/g, ' ').split(/\s+/).filter(Boolean)
  if (parts.length < 1 || parts.length > 3) return null
  const f = parts[0]
  if (f.length < 2 || f === f.toUpperCase()) return null
  return f[0].toUpperCase() + f.slice(1).toLowerCase()
}

// The name the sender SIGNS with beats the account's display name: Rapid Septic's mail comes
// from "Craig Davis" but Sherra signs it, and Adam changed "Good morning, Craig," to "Sherra"
// before sending (Oct 22 2026). Only the top reply is searched, not the quoted history.
function signoffName(html) {
  const text = (html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  // Gmail's quote header ("On Thu, Oct 22, 2026 at 11:49 AM Iron Shield Construction <…> wrote:") runs ~100 chars.
  const top = text.split(/\n\s*(?:From:|On .{10,200}? wrote:|-{3,} ?Original Message)/i)[0]
  // Closer words are matched in either case; the NAME must be capitalized (so "thanks,\nplease…" can't match).
  const m = top.match(/\b(?:[Tt]hank you|[Tt]hanks|[Bb]est regards|[Kk]ind regards|[Rr]egards|[Ss]incerely|[Bb]est|[Cc]heers)[,!.]*\s*\n+\s*([A-Z][a-z]{1,15})\b(?![\w.]*@)/)
  return m ? m[1] : null
}

// ---- Scan every mailbox
const queue = []      // one entry per invoice email we should reply to
const skipped = []    // handled / draft waiting / no contact — shown so nothing is silent
// Our side of each conversation, pooled across ALL scanned mailboxes: Hirst invoices arrive in
// cassidy@ but Adam forwards them from office@, so a per-mailbox check would miss the forward.
const sent = [], drafts = []
for (const mb of MAILBOXES) {
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}`
  sent.push(...await all(`${base}/mailFolders/sentitems/messages?$top=100&$select=id,subject,toRecipients,sentDateTime,conversationId&$filter=sentDateTime ge ${sinceIso}`))
  drafts.push(...await all(`${base}/mailFolders/drafts/messages?$top=100&$select=id,subject,conversationId,toRecipients`))
}
for (const mb of MAILBOXES) {
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}`
  const sel = '$select=id,subject,from,sender,replyTo,toRecipients,receivedDateTime,hasAttachments,bodyPreview,conversationId,isRead&$expand=attachments($select=name,contentType)'
  const inbox = await all(`${base}/mailFolders/inbox/messages?$top=100&${sel}&$filter=receivedDateTime ge ${sinceIso}&$orderby=receivedDateTime desc`)

  for (const m of inbox) {
    const from = addr(m.from), senderAddr = addr(m.sender)
    if (OUR_PEOPLE_RX.test(from) || OUR_PEOPLE_RX.test(senderAddr)) continue
    if (/monday\.com|microsoft\.com|sharepointonline/.test(from)) continue
    const atts = (m.attachments ?? []).filter((a) => !/^image\//.test(a.contentType ?? ''))
    const haystack = [m.subject, m.bodyPreview, ...atts.map((a) => a.name)].join(' \n ')
    if (!INVOICE_RX.test(haystack)) continue
    // A receipt-ish subject with no invoice word in the SUBJECT or an attachment name is a receipt.
    const strong = INVOICE_RX.test([m.subject, ...atts.map((a) => a.name)].join(' '))
    if (NOT_INVOICE_RX.test(m.subject) && !strong) continue
    if (/^(re|fw|fwd):/i.test(m.subject) && !strong) continue

    // Who do we write back to? Graph's createReply uses Reply-To automatically; we
    // resolve it here too so the queue shows the real person and no-reply senders get flagged.
    const replyTo = (m.replyTo ?? []).map(addr).filter(Boolean)
    const contact = replyTo[0] || from
    // Display name for the greeting: Reply-To's name if it's a real name, else From's
    // (jobprotech puts the ARP rep's name on From and only an address on Reply-To).
    const rtName = replyTo[0] ? name(m.replyTo[0]) : ''
    const contactName = rtName && !rtName.includes('@') ? rtName : name(m.from)
    // Sign-off name from the body (one extra GET per candidate; the list is short).
    const full = await graph(`${base}/messages/${encodeURIComponent(m.id)}?$select=body`)
    const signed = signoffName(full.body?.content)
    const vendorLabel = vendorName(m, contact)
    const refs = invoiceRefs(m.subject ?? '', atts)
    const house = houseAddress([m.subject, m.bodyPreview, ...atts.map((a) => a.name)].join(' '))
    const entry = {
      mailbox: mb, id: m.id, conversationId: m.conversationId, received: m.receivedDateTime,
      subject: m.subject, vendor: vendorLabel, contact, firstName: firstName(contactName, contact),
      refs, house, attachments: atts.map((a) => a.name), variant: 'A',
      signedBy: signed,
    }
    if (signed) entry.firstName = signed

    if (ledger.drafted[m.id]) { skipped.push({ ...entry, why: `drafted ${ledger.drafted[m.id].date.slice(0, 10)}` }); continue }
    if (drafts.some((d) => d.conversationId === m.conversationId)) { skipped.push({ ...entry, why: 'reply draft already in Drafts' }); continue }
    if (NOREPLY_RX.test(contact)) { skipped.push({ ...entry, why: `no-reply sender (${contact}) — reply by hand to the A/R contact on the invoice` }); continue }

    // Our replies/forwards in this thread. Forwards made from Apple Mail / the phone don't share
    // Outlook's conversationId, so a same-subject "FW:" sent after it counts too.
    const bare = (t) => (t ?? '').replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').trim().toLowerCase()
    const ours = sent.filter((s) => s.sentDateTime > m.receivedDateTime && (s.conversationId === m.conversationId || bare(s.subject) === bare(m.subject)))
    const repliedToVendor = ours.some((s) => (s.toRecipients ?? []).some((t) => [contact, from].includes(addr(t))))
    if (repliedToVendor) { skipped.push({ ...entry, why: 'we already replied in this thread' }); continue }
    const forwardedToData = ours.some((s) => (s.toRecipients ?? []).some((t) => addr(t) === DATA))
    if (forwardedToData) { skipped.push({ ...entry, why: 'already forwarded to data@ (not retroactive)' }); continue }
    if (ledger.vendors[contact]) entry.variant = 'B'   // repeat offender → short "as mentioned on…" wording
    queue.push(entry)
  }
}

// ---- Group by vendor contact: one reply (on the newest invoice) listing all their invoices.
const byVendor = new Map()
for (const e of queue.sort((a, b) => b.received.localeCompare(a.received))) {
  const g = byVendor.get(e.contact) ?? { contact: e.contact, items: [] }
  g.items.push(e)
  byVendor.set(e.contact, g)
}
// Row numbers are stable across a dry run and the --draft run that follows (same sort), so
// "--only 2,5" / "--skip 1" refer to the numbers printed in the table.
let rowNo = 0
for (const g of byVendor.values()) for (const e of g.items) e.row = ++rowNo
const pick = (flag) => String(args[flag] ?? '').split(',').map((x) => Number(x.trim())).filter(Boolean)
const only = pick('only'), skip = pick('skip')
const chosen = (e) => (!only.length || only.includes(e.row)) && !skip.includes(e.row)

if (args.json) {
  console.log(JSON.stringify({ since: sinceIso, groups: [...byVendor.values()], skipped }, null, 2))
} else {
  console.log(`Invoices in ${MAILBOXES.map((m) => m.split('@')[0] + '@').join(' / ')} Inbox since ${sinceIso.slice(0, 10)}:`)
  if (!byVendor.size) console.log('  (none waiting)')
  let n = 0
  for (const g of byVendor.values()) {
    for (const e of g.items) {
      n = e.row
      const v = e.variant === 'A' ? '' : '  [told before → short version]'
      const mbTag = e.mailbox.startsWith('office@') ? '' : ` [${e.mailbox.split('@')[0]}@]`
      const who = e.firstName ? ` · greet: ${e.firstName}${e.signedBy ? ' (signs)' : ''}` : ' · greet: (no name)'
      console.log(`  ${n}. ${e.received.slice(0, 10)}${mbTag} · ${e.vendor} <${e.contact}> · ${e.subject}${who}${e.refs.length ? ` · inv ${e.refs.join(', ')}` : ''}${e.house ? ` · ${e.house}` : ''}${v}`)
    }
  }
  if (skipped.length) {
    console.log('\nSkipped:')
    for (const s of skipped) console.log(`  - ${s.received.slice(0, 10)} · ${s.vendor} · ${s.subject} — ${s.why}`)
  }
  console.log(`\n${byVendor.size} reply draft(s) would be made${args.draft ? '' : ' (run with --draft to create them)'}.`)
}

// ---- Draft the replies (never sends)
if (args.draft && byVendor.size) {
  // Greeting by clock, Eastern time (Adam's rule: never copy a greeting from an older email).
  const hourET = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(new Date()))
  const timeOfDay = hourET < 12 ? 'Good morning' : 'Good afternoon'
  const today = new Date().toISOString()
  const todayUS = new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date())
  const tmp = mkdtempSync(join(tmpdir(), 'invoice-redirect-'))

  let made = 0
  for (const g0 of byVendor.values()) {
    const g = { contact: g0.contact, items: g0.items.filter(chosen) }
    if (!g.items.length) continue
    const newest = g.items[0]
    const greeting = newest.firstName ? `${timeOfDay}, ${newest.firstName},` : `${timeOfDay},`
    const variant = g.items.some((i) => i.variant === 'B') ? 'B' : 'A'
    // What we're pointing at: "Invoice 3161 (7540 SW 121st Terr)" / "this invoice" / a numbered list.
    const label = (e) => e.refs.length
      ? `Invoice ${e.refs[0]}${e.house ? ` (${e.house})` : ''}`
      // Eastern date, not the UTC one in `received`: a 9:48 PM invoice would otherwise say "tomorrow" (Oct 29 2026).
      : `the invoice sent on ${new Date(e.received).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' })}${e.house ? ` for ${e.house}` : ''}`
    const toResend = g.items
    const several = toResend.length > 1
    // A numbered list only earns its place when at least one invoice has a number. Two
    // unnumbered ARP invoices would otherwise read "1. the invoice from 10/08  2. the invoice from 10/08".
    const anyNumbered = toResend.some((e) => e.refs.length)
    const us = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' })
    const dates = [...new Set(toResend.map((e) => us(e.received)))]
    const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
    const bunch = `the ${words[toResend.length] ?? toResend.length} invoices sent ${dates.length === 1 ? `on ${dates[0]}` : `between ${dates[dates.length - 1]} and ${dates[0]}`}`
    const list = several && anyNumbered ? toResend.map((e, i) => `${i + 1}. ${label(e)}`).join('\n') : ''
    const these = several ? (anyNumbered ? 'the invoices below' : bunch) : label(toResend[0])
    const those = several ? (anyNumbered ? 'the invoices above' : 'them') : 'it'

    let paragraphs
    if (variant === 'B') {
      const told = ledger.vendors[g.contact]?.firstTold?.slice(0, 10)
      const toldUS = told ? new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' }).format(new Date(told)) : null
      paragraphs = [
        greeting,
        `As mentioned${toldUS ? ` on ${toldUS}` : ' previously'}, all Iron Shield invoices need to go to ${DATA} only. Invoices sent to this address are not forwarded over, so ${these} will need to be resent.`,
        ...(list ? [list] : []),
        `Could you please resend ${those} to ${DATA} and update your records so future invoices go there as well?`,
        `Thank you!`,
      ]
    } else {
      paragraphs = [
        greeting,
        `I need your help with a change to where Iron Shield receives invoices.`,
        `Going forward, please send all invoices to ${DATA} only. That inbox goes straight to our bookkeeping team, and invoices sent to this address will no longer be forwarded over, so ${these} will need to be resent.`,
        ...(list ? [list] : []),
        `Could you please resend ${those} to ${DATA} and update your records so future invoices go there as well?`,
        `Thank you!`,
      ]
    }
    const bodyFile = join(tmp, `${g.contact.replace(/[^a-z0-9]/gi, '_')}.txt`)
    writeFileSync(bodyFile, paragraphs.join('\n\n') + '\n')

    // outlook-draft.mjs does the Graph createReply + signature + HTML; we just hand it the id.
    const out = execFileSync(process.execPath, [new URL('outlook-draft.mjs', here).pathname, '--mailbox', newest.mailbox, '--reply-to-id', newest.id, '--body-file', bodyFile], { encoding: 'utf8' })
    process.stdout.write(out.split('\n').filter((l) => /DRAFT READY|replying to/.test(l)).map((l) => '  ' + l).join('\n') + '\n')
    made++

    for (const e of g.items) ledger.drafted[e.id] = { date: today, vendor: e.vendor, contact: g.contact, subject: e.subject, variant }
    ledger.vendors[g.contact] ??= { vendor: newest.vendor, firstTold: today }
    ledger.vendors[g.contact].lastTold = today
    ledger.vendors[g.contact].count = (ledger.vendors[g.contact].count ?? 0) + 1
  }
  console.log(`\n${made} draft(s) in Outlook Drafts, dated ${todayUS}. Nothing was sent.`)
}

// Only a --draft run moves the "last scan" marker, so a dry run never hides anything next time.
if (args.draft) {
  ledger.lastScanAt = new Date().toISOString()
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n')
}
