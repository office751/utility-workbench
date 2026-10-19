// outlook-rules.mjs — the two Inbox rules on office@ (Adam OK'd Oct 19 2026):
//   1. receipt senders (Amazon orders, Floor & Decor, Office Depot orders, Lowe's,
//      county Paymentus) → "Receipts" folder, left UNREAD — Claude's "forward
//      receipts" skill works from that folder.
//   2. store marketing (deals, rewards, surveys) → "Completed Items", marked read.
// Idempotent: re-running updates the rules in place. Add a sender to a list and re-run.
//
// ⚠ Needs the Graph app to have **MailboxSettings.ReadWrite** (application) with
// admin consent — Mail.ReadWrite alone gets 403 on /messageRules (hit Oct 19 2026).
// Entra → App registrations → "Lodestar SharePoint Sync" → API permissions → Add →
// Microsoft Graph → Application → MailboxSettings.ReadWrite → Grant admin consent.
//
//   node scanner/outlook-rules.mjs           # create/update both rules
import { readFileSync } from 'node:fs'
const envTxt = readFileSync(new URL('.env', import.meta.url),'utf8')
const env = Object.fromEntries(envTxt.split('\n').map(l=>l.match(/^\s*([A-Za-z_]+)\s*=\s*(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]))
const r = await fetch(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ client_id: env.GRAPH_CLIENT_ID, client_secret: env.GRAPH_CLIENT_SECRET, scope:'https://graph.microsoft.com/.default', grant_type:'client_credentials' }) })
const tok = (await r.json()).access_token
const G = 'https://graph.microsoft.com/v1.0/users/office@ironshieldconstruction.com'
const api = async (method, path, body) => { const res = await fetch(G+path, { method, headers:{ authorization:`Bearer ${tok}`, 'content-type':'application/json' }, body: body?JSON.stringify(body):undefined }); const j = await res.json().catch(()=>({})); if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(j.error||j)}`); return j }

const folders = (await api('GET', '/mailFolders?$top=100&$select=id,displayName')).value
const completed = folders.find(f=>f.displayName==='Completed Items - Filtered out of Inbox')
let receipts = folders.find(f=>f.displayName==='Receipts')
if (!receipts) { receipts = await api('POST', '/mailFolders', { displayName: 'Receipts' }); console.log('created folder Receipts') } else console.log('Receipts folder already exists')

const MARKETING = ['store-news@amazon.com','no-reply@business.amazon.com','account-update@amazon.com','customer-reviews-messages@amazon.com','marketplace-messages@amazon.com','prime@amazon.com','return@amazon.com','hello@email.health.amazon.com',
  'vistaprint@mail.vistaprint.com','officedepot@cs.officedepot.com','officedepot@em.officedepot.com','odsurvey@odsurvey.officedepot.com','info@sr.staplesadvantage.com','news@insideapple.apple.com']
const RECEIPTS = ['auto-confirm@amazon.com','shipment-tracking@amazon.com','order-update@amazon.com','no-reply@amazon.com','payments-update@amazon.com',
  'auto-confirm@email.flooranddecor.com','officedepotorders@officedepot.com','do-not-reply@confirmation.lowes.com','billpay@paymentus.com']
const addrs = (list) => list.map(a => ({ emailAddress: { address: a } }))
const existing = (await api('GET', '/mailFolders/inbox/messageRules')).value
console.log('existing rules:', existing.map(x=>x.displayName).join(' | ') || 'none')
const ensure = async (rule) => {
  const ex = existing.find(x=>x.displayName===rule.displayName)
  if (ex) { await api('PATCH', `/mailFolders/inbox/messageRules/${ex.id}`, rule); console.log('updated rule:', rule.displayName) }
  else { await api('POST', '/mailFolders/inbox/messageRules', rule); console.log('created rule:', rule.displayName) }
}
await ensure({ displayName: 'Receipts → Receipts folder', sequence: 1, isEnabled: true,
  conditions: { fromAddresses: addrs(RECEIPTS) },
  actions: { moveToFolder: receipts.id, stopProcessingRules: true } })
await ensure({ displayName: 'Store marketing → Completed Items', sequence: 2, isEnabled: true,
  conditions: { fromAddresses: addrs(MARKETING) },
  actions: { moveToFolder: completed.id, markAsRead: true, stopProcessingRules: true } })
console.log('RECEIPTS_FOLDER_ID=' + receipts.id)
