#!/usr/bin/env node
// outlook-draft.mjs: create an email DRAFT (never sends) in a mailbox via
// Microsoft Graph, so it shows up in Outlook's Drafts folder on every device.
//
// Needs the scanner/.env Graph app to have Mail.ReadWrite (granted Oct 13 2026).
//
// New message:
//   node scanner/outlook-draft.mjs --to orlando@fgtcabinetry.com --subject "..." --body-file body.txt [--attach file.docx ...]
// Reply in an existing thread (finds the newest message whose subject contains the text):
//   node scanner/outlook-draft.mjs --reply-to-subject "8 Separate Orders" [--from-sender fgtcabinetry.com] --body-file body.txt [--attach ...]
// Forward an existing message (newest match) to someone, our text above the quoted original:
//   node scanner/outlook-draft.mjs --forward-subject "Transaction Receipt" [--from-sender paytrace.com] --to data@ironshieldconstruction.com --body-file body.txt [--attach ...] [--subject "FW: ..."]
// Options: --mailbox (default office@ironshieldconstruction.com), --cc a@b.com, --to a@b.com (on a reply: overrides the recipient — use it when following up on our own sent email)
// Body text is plain text. Paragraphs are separated by blank lines.
// Adam's Outlook signature (scanner/signature-office.html + signature-logo.png) is
// added automatically, right under the message and above any quoted reply,
// because Outlook does NOT add it to drafts made this way and inserting it by
// hand drops it at the very bottom. Pass --no-signature to skip it.
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'

const here = new URL('.', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env', here), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
)

// ---- tiny argv parser: repeated flags (--attach, --to, --cc) become arrays
const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '')
  const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true
  if (['attach', 'to', 'cc'].includes(k)) (args[k] ??= []).push(v)
  else args[k] = v
}
const mailbox = args.mailbox || 'office@ironshieldconstruction.com'
const G = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`

async function token() {
  const r = await fetch(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: env.GRAPH_CLIENT_ID, client_secret: env.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`token: ${j.error_description}`)
  return j.access_token
}
const tok = await token()
async function graph(method, path, body, extraHeaders = {}) {
  const r = await fetch(path.startsWith('http') ? path : G + path, {
    method,
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}

// Plain text → simple HTML paragraphs (keeps bullets/line breaks readable in Outlook)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const bodyText = args['body-file'] ? readFileSync(args['body-file'], 'utf8') : String(args.body ?? '')
// Paragraph spacing (Adam, Oct 19 2026): ONE blank line between paragraphs, never more.
// The Oct 15 fix added an empty <p>&nbsp;</p> spacer between paragraphs; in Adam's Outlook
// that doubled the gap ("really spaced out") and he deleted every spacer before sending.
// An explicit bottom margin on each <p> gives exactly one blank line whether or not
// Outlook zeroes the default <p> margin, so no spacer paragraphs are needed.
const bodyHtml = bodyText.trim().split(/\n\s*\n/).map((p) => `<p style="margin:0 0 1em 0">${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n')
// Signature block + its inline logo (cid:ironshield-sig-logo)
const useSig = !args['no-signature']
const sigHtml = useSig ? readFileSync(new URL('signature-office.html', here), 'utf8') : ''
const withSig = (html) => (useSig ? html + '<br>' + sigHtml : html)
const rcpt = (list = []) => list.map((a) => ({ emailAddress: { address: a } }))

let draft
if (args['reply-to-subject']) {
  // Find the newest matching message (any folder), then createReply keeps the thread + quote.
  const q = encodeURIComponent(`"subject:${args['reply-to-subject']}"`)
  const found = await graph('GET', `/messages?$search=${q}&$top=25&$select=id,subject,from,receivedDateTime,isDraft`, null, { ConsistencyLevel: 'eventual' })
  const hits = found.value
    .filter((m) => !m.isDraft)
    .filter((m) => !args['from-sender'] || (m.from?.emailAddress?.address ?? '').toLowerCase().includes(String(args['from-sender']).toLowerCase()))
    .sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime))
  if (!hits.length) throw new Error(`no message found with subject containing "${args['reply-to-subject']}"`)
  const orig = hits[0]
  console.log(`replying to: "${orig.subject}" from ${orig.from?.emailAddress?.address} (${orig.receivedDateTime})`)
  draft = await graph('POST', `/messages/${orig.id}/createReply`, { comment: '' })
  // createReply pre-fills the quoted original; put our text above it.
  // ⚠ replacer must be a FUNCTION: a string replacement treats "$1" in our text (e.g. "$15,247.00") as a capture ref and eats it (Oct 16 2026).
  const full = await graph('GET', `/messages/${draft.id}?$select=body`)
  const quoted = full.body?.content ?? ''
  const mine = withSig(bodyHtml) + '<br>'
  const merged = quoted.includes('<body') ? quoted.replace(/<body([^>]*)>/i, (_m, attrs) => `<body${attrs}>${mine}`) : mine + quoted
  const patch = { body: { contentType: 'HTML', content: merged } }
  // --to overrides who the reply goes to. Needed when following up on our OWN sent email:
  // createReply then addresses the draft back to office@ instead of the vendor.
  if (args.to) patch.toRecipients = rcpt(args.to)
  if (args.cc) patch.ccRecipients = rcpt(args.cc)
  await graph('PATCH', `/messages/${draft.id}`, patch)
} else if (args['forward-subject']) {
  // Forward the newest matching message (any folder) to --to; createForward keeps the original
  // body (and its attachments) quoted below our text. Same --from-sender filter as reply.
  if (!args.to) throw new Error('--forward-subject needs --to')
  const q = encodeURIComponent(`"subject:${args['forward-subject']}"`)
  const found = await graph('GET', `/messages?$search=${q}&$top=25&$select=id,subject,from,receivedDateTime,isDraft`, null, { ConsistencyLevel: 'eventual' })
  const hits = found.value
    .filter((m) => !m.isDraft)
    .filter((m) => !args['from-sender'] || (m.from?.emailAddress?.address ?? '').toLowerCase().includes(String(args['from-sender']).toLowerCase()))
    .sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime))
  if (!hits.length) throw new Error(`no message found with subject containing "${args['forward-subject']}"`)
  const orig = hits[0]
  console.log(`forwarding: "${orig.subject}" from ${orig.from?.emailAddress?.address} (${orig.receivedDateTime})`)
  draft = await graph('POST', `/messages/${orig.id}/createForward`, { comment: '', toRecipients: rcpt(args.to) })
  const full = await graph('GET', `/messages/${draft.id}?$select=body`)
  const quoted = full.body?.content ?? ''
  const mine = withSig(bodyHtml) + '<br>'
  const merged = quoted.includes('<body') ? quoted.replace(/<body([^>]*)>/i, (_m, attrs) => `<body${attrs}>${mine}`) : mine + quoted
  const patch = { body: { contentType: 'HTML', content: merged } }
  if (args.subject) patch.subject = args.subject
  if (args.cc) patch.ccRecipients = rcpt(args.cc)
  await graph('PATCH', `/messages/${draft.id}`, patch)
} else {
  if (!args.to || !args.subject) throw new Error('need --to and --subject (or --reply-to-subject / --forward-subject)')
  draft = await graph('POST', '/messages', {
    subject: args.subject,
    body: { contentType: 'HTML', content: withSig(bodyHtml) },
    toRecipients: rcpt(args.to),
    ccRecipients: rcpt(args.cc),
  })
}

if (useSig) {
  await graph('POST', `/messages/${draft.id}/attachments`, {
    '@odata.type': '#microsoft.graph.fileAttachment', name: 'signature-logo.png', contentType: 'image/png',
    isInline: true, contentId: 'ironshield-sig-logo',
    contentBytes: readFileSync(new URL('signature-logo.png', here)).toString('base64'),
  })
}

// ---- attachments: small ones inline (<3 MB), big ones via an upload session (≤150 MB)
for (const file of args.attach ?? []) {
  const size = statSync(file).size
  const name = basename(file)
  const bytes = readFileSync(file)
  if (size < 3 * 1024 * 1024) {
    await graph('POST', `/messages/${draft.id}/attachments`, { '@odata.type': '#microsoft.graph.fileAttachment', name, contentBytes: bytes.toString('base64') })
  } else {
    const s = await graph('POST', `/messages/${draft.id}/attachments/createUploadSession`, { AttachmentItem: { attachmentType: 'file', name, size } })
    const CHUNK = 4 * 1024 * 1024
    for (let off = 0; off < size; off += CHUNK) {
      const end = Math.min(off + CHUNK, size) - 1
      const r = await fetch(s.uploadUrl, { method: 'PUT', headers: { 'content-range': `bytes ${off}-${end}/${size}`, 'content-length': String(end - off + 1) }, body: bytes.subarray(off, end + 1) })
      if (!r.ok && r.status !== 201 && r.status !== 200) throw new Error(`upload ${name}: ${r.status} ${await r.text()}`)
    }
  }
  console.log(`attached: ${name} (${Math.round(size / 1024)} KB)`)
}

const check = await graph('GET', `/messages/${draft.id}?$select=subject,isDraft,toRecipients,hasAttachments,webLink`)
console.log(`DRAFT READY (not sent): "${check.subject}" → ${check.toRecipients.map((r) => r.emailAddress.address).join(', ')} | attachments: ${check.hasAttachments}`)
console.log(`open in Outlook web: ${check.webLink}`)
