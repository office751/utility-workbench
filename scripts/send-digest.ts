/**
 * send-digest.ts — the morning-digest SENDER. A thin shell around the tested
 * brain in src/lib/digest.ts: read blob → buildDigest per person → email.
 *
 * Runs on the office Mac via launchd (com.ironshield.digest, 6:30 AM — after
 * the 5:30 permit scan and 6:00 SharePoint sync so the digest reports on
 * FRESH data). Zero Claude usage — it's a plain script, like the scanner.
 *
 *   npx tsx scripts/send-digest.ts           # DRY RUN: prints every email, sends nothing
 *   npx tsx scripts/send-digest.ts --send    # actually send (what launchd runs)
 *
 * READ-ONLY by design: this job never writes the blob (the cloud-write
 * invariant in docs/BRAINS.md doesn't even come into play).
 *
 * Config: scanner/digest.config.json (recipients + from address).
 * Credentials: scanner/.env (SUPABASE_*, GRAPH_* — same file the other jobs use).
 *
 * ⚠ ONE-TIME SETUP the first --send needs (else it exits with a clear error):
 * the Graph app registration must gain the **Mail.Send APPLICATION permission
 * with admin consent** (it has only Sites.ReadWrite.All today):
 *   1. entra.microsoft.com → App registrations → the scanner/sync app
 *      (client id = GRAPH_CLIENT_ID in scanner/.env)
 *   2. API permissions → Add a permission → Microsoft Graph →
 *      Application permissions → Mail.Send → Add
 *   3. Click "Grant admin consent for <tenant>" (you're the admin)
 *   Optional hardening: an ApplicationAccessPolicy can scope the app to only
 *   send as office@ — ask for it if the broad grant bothers you.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { WorkbenchState } from '../src/types'
import { buildDigest, renderDigestHtml, renderDigestText } from '../src/lib/digest'

const SEND = process.argv.includes('--send')

// ---- config + env (both live in scanner/, next to the other Mac jobs) -----
const here = new URL('.', import.meta.url)
const env = readFileSync(new URL('../scanner/.env', here), 'utf8')
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()

interface DigestConfig {
  /** Mailbox the digest is sent AS (and saved to its Sent Items). */
  from: string
  recipients: Array<{ name: string; email: string; enabled: boolean }>
}
const config: DigestConfig = JSON.parse(
  readFileSync(new URL('../scanner/digest.config.json', here), 'utf8'),
)

const SUPABASE_URL = get('SUPABASE_URL')
const SUPABASE_KEY = get('SUPABASE_SERVICE_KEY')
const TENANT = get('GRAPH_TENANT_ID')
const CLIENT_ID = get('GRAPH_CLIENT_ID')
const CLIENT_SECRET = get('GRAPH_CLIENT_SECRET')
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_KEY, TENANT, CLIENT_ID, CLIENT_SECRET })) {
  if (!v) {
    console.error(`Missing ${k} in scanner/.env`)
    process.exit(1)
  }
}

// ---- Graph token (client credentials, same flow as sync-sharepoint.mjs) ---
async function graphToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`token: ${res.status} ${j.error}: ${j.error_description?.split('\n')[0]}`)
  // Fail EARLY and clearly if the one-time Mail.Send grant hasn't happened yet.
  const roles: string[] = JSON.parse(Buffer.from(j.access_token.split('.')[1], 'base64url').toString()).roles ?? []
  if (SEND && !roles.includes('Mail.Send')) {
    console.error(
      `The Graph app has no Mail.Send permission (granted roles: ${roles.join(', ') || 'none'}).\n` +
        `Do the one-time grant described at the top of scripts/send-digest.ts, then retry.`,
    )
    process.exit(78) // EX_CONFIG — "configured wrong", same convention as mailclip
  }
  return j.access_token
}

async function sendMail(token: string, to: { name: string; email: string }, subject: string, text: string, html: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.from)}/sendMail`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      saveToSentItems: true,
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to.email, name: to.name } }],
      },
    }),
  })
  if (!res.ok) throw new Error(`sendMail → ${to.email}: ${res.status} ${await res.text()}`)
  void text // (plain-text render is used by the dry run; Graph gets the HTML body)
}

async function main() {
  // 1) Read the blob — READ ONLY, never write.
  const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false } })
  const { data, error } = await sb.from('workbench').select('data').eq('id', 'main').single()
  if (error || !data?.data) {
    console.error(`Could not read the workbench blob: ${error?.message ?? 'empty row'}`)
    process.exit(1)
  }
  const state = data.data as WorkbenchState

  // 2) Build + deliver one digest per enabled recipient.
  const active = config.recipients.filter((r) => r.enabled)
  if (active.length === 0) {
    console.error('No enabled recipients in scanner/digest.config.json — nothing to do.')
    process.exit(1)
  }
  const token = SEND ? await graphToken() : ''
  for (const r of active) {
    const digest = buildDigest(state, r.name)
    if (SEND) {
      await sendMail(token, r, digest.subject, renderDigestText(digest), renderDigestHtml(digest))
      console.log(`sent → ${r.name} <${r.email}> · ${digest.subject}`)
    } else {
      console.log(`\n━━━ DRY RUN — would send to ${r.name} <${r.email}> ━━━`)
      console.log(`Subject: ${digest.subject}\n`)
      console.log(renderDigestText(digest))
    }
  }
  if (!SEND) console.log('\n(Nothing sent. Pass --send to email for real.)')
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
