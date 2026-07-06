/**
 * send-mail.ts — tiny generic mailer for the Mac automation jobs.
 * Sends a plain-text file as an email from office@ via Microsoft Graph
 * (same GRAPH_* app credentials in scanner/.env as the SharePoint sync).
 *
 *   npx tsx scripts/send-mail.ts --to adam@x.com --subject "Hi" --file report.md
 *
 * Needs the same one-time Mail.Send admin grant as scripts/send-digest.ts
 * (instructions in that file's header). Exits 78 (EX_CONFIG) until granted.
 */
import { readFileSync } from 'node:fs'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const TO = arg('to')
const SUBJECT = arg('subject')
const FILE = arg('file')
if (!TO || !SUBJECT || !FILE) {
  console.error('Usage: npx tsx scripts/send-mail.ts --to <email> --subject <s> --file <path>')
  process.exit(2)
}

const here = new URL('.', import.meta.url)
const env = readFileSync(new URL('../scanner/.env', here), 'utf8')
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const FROM: string = JSON.parse(
  readFileSync(new URL('../scanner/digest.config.json', here), 'utf8'),
).from

async function main() {
  const res = await fetch(`https://login.microsoftonline.com/${get('GRAPH_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: get('GRAPH_CLIENT_ID')!,
      client_secret: get('GRAPH_CLIENT_SECRET')!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`token: ${res.status} ${j.error_description?.split('\n')[0]}`)
  const roles: string[] = JSON.parse(Buffer.from(j.access_token.split('.')[1], 'base64url').toString()).roles ?? []
  if (!roles.includes('Mail.Send')) {
    console.error('Graph app lacks Mail.Send — do the one-time grant in scripts/send-digest.ts, then retry.')
    process.exit(78)
  }
  const send = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(FROM)}/sendMail`, {
    method: 'POST',
    headers: { authorization: `Bearer ${j.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      saveToSentItems: true,
      message: {
        subject: SUBJECT,
        body: { contentType: 'Text', content: readFileSync(FILE!, 'utf8') },
        toRecipients: [{ emailAddress: { address: TO } }],
      },
    }),
  })
  if (!send.ok) throw new Error(`sendMail: ${send.status} ${await send.text()}`)
  console.log(`sent → ${TO} · ${SUBJECT}`)
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
