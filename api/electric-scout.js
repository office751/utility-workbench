/**
 * api/electric-scout.js — the ⚡ button behind a Monday row.
 *
 * Flip a row's "Electric Scout" cell on the Construction Job List and Monday
 * POSTs here; we locate the lot in Marion County GIS, and if the answer is
 * unambiguous we write it straight into the row's "Electric Co." cell and
 * leave an update saying where the answer came from. Near a territorial seam
 * we deliberately DON'T write — the county polygons are good but not
 * survey-grade, and a wrong power company means a wrong application.
 *
 * Setup (see docs/electric-scout.md):
 *   Vercel env  MONDAY_API_TOKEN   — a Monday personal API token
 *   Vercel env  SCOUT_SECRET       — any long random string
 *   Monday      an automation that sends a webhook to
 *               https://<app>/api/electric-scout?key=<SCOUT_SECRET>
 *
 * The secret rides in the query string because Monday's built-in webhook
 * recipe can't set headers. It is checked in constant time, and the endpoint
 * does nothing except look up public GIS data and write one board cell.
 */
import { scoutElectric, metresToFeet } from './_gis.js'
import { timingSafeEqual } from 'node:crypto'

const BOARD_ID = 18429393869            // Construction Job List
const ELECTRIC_COL = 'color_mm6t88t4'   // "Electric Co." (status)
const PARCEL_COL_TITLE = 'Parcel ID'

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

async function monday(query, variables = {}) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.MONDAY_API_TOKEN,
      'API-Version': '2025-01',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error('Monday API: ' + JSON.stringify(json.errors))
  return json.data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})

  // Monday verifies a new webhook by posting a challenge it wants echoed back.
  // This happens before any secret is configured, so answer it first.
  if (body.challenge) return res.status(200).json({ challenge: body.challenge })

  if (!process.env.SCOUT_SECRET || !eq(req.query?.key ?? '', process.env.SCOUT_SECRET)) {
    return res.status(401).json({ error: 'bad key' })
  }
  if (!process.env.MONDAY_API_TOKEN) {
    return res.status(500).json({ error: 'MONDAY_API_TOKEN is not set on the server' })
  }

  const itemId = body?.event?.pulseId
  if (!itemId) return res.status(400).json({ error: 'no pulseId in payload' })

  try {
    const data = await monday(
      `query ($id: [ID!]) { items (ids: $id) { id name column_values { text column { id title } } } }`,
      { id: [String(itemId)] })
    const item = data.items?.[0]
    if (!item) return res.status(404).json({ error: `item ${itemId} not found` })

    const parcel = (item.column_values.find((c) => c.column.title === PARCEL_COL_TITLE)?.text || '').trim()
    const already = (item.column_values.find((c) => c.column.id === ELECTRIC_COL)?.text || '').trim()

    const r = await scoutElectric({ parcel, address: item.name })

    let note, wrote = false
    if (!r.ok) {
      note = `⚡ Electric scout: couldn't answer — ${r.why}. Check the county map by hand.`
    } else {
      const label = r.code ?? r.provider
      const where = r.seamUnknown
        ? 'the seam check came back short, so treat this as unconfirmed'
        : r.seam
          ? `nearest other provider (${r.seam.join('/')}) is about ${metresToFeet(r.seamAt)} ft away`
          : 'no other provider within a mile'
      if (already && already !== label) {
        note = `⚡ Electric scout: county GIS says **${label}** (via ${r.via}; ${where}), but this row already says **${already}** — left alone, worth reconciling.`
      } else if (r.close) {
        note = `⚡ Electric scout: county GIS says **${label}** (via ${r.via}), but ${where} — too close to a boundary to fill in automatically. Confirm before applying.`
      } else {
        await monday(
          `mutation ($v: String!) { change_simple_column_value (board_id: ${BOARD_ID}, item_id: ${item.id}, column_id: "${ELECTRIC_COL}", value: $v, create_labels_if_missing: true) { id } }`,
          { v: label })
        wrote = true
        note = `⚡ Electric scout: **${label}** — via ${r.via}, ${where}. Written to Electric Co.`
      }
    }

    await monday(
      `mutation ($b: String!) { create_update (item_id: ${item.id}, body: $b) { id } }`,
      { b: note })
    return res.status(200).json({ ok: true, item: item.id, parcel, wrote, note })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
}
