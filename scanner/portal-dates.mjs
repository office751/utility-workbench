/**
 * portal-dates.mjs — pure helpers for reading each permit's SUMMARY dates
 * (status / issue date / EXPIRE date) off the county portal, and deciding
 * when an expiration date has CHANGED (extension approved, re-issue, etc.).
 *
 * Kept separate from scan.mjs so the logic can be sanity-checked with plain
 * node (no Playwright, no Supabase) — same reason the app keeps its brains
 * in src/lib/.
 */
import fs from 'node:fs'

/** '11/02/2026' (portal format) → '2026-11-02' (the app's ISO format). Returns
 *  '' for anything that isn't a clean M/D/YYYY date — never guesses. */
export function isoFromUs(us) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((us || '').trim())
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : ''
}

/**
 * Parse the permit LANDING page's label/value summary out of its visible text.
 * The portal renders each field as a label line ("Expire Date:") followed by a
 * value line ("11/02/2026") — EXCEPT empty fields, where the next line is
 * simply the NEXT label (e.g. "Assigned To:" straight into "Expire Date:").
 * So a value only counts if the following line isn't itself a label.
 *
 * Returns { status, issued, expires, found } — dates in ISO, '' when the
 * field is empty/unparseable; `found` is true when the "Expire Date:" label
 * itself rendered (the page really showed us the summary panel).
 */
export function parseSummary(text) {
  // filter(Boolean) matters: the real page puts BLANK lines between a label
  // and its value, so without it every value reads as '' (cost a debug pass).
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const grab = (label) => {
    const i = lines.findIndex((l) => l.toLowerCase() === `${label.toLowerCase()}:`)
    if (i < 0 || i + 1 >= lines.length) return ''
    const v = lines[i + 1]
    return /:$/.test(v) ? '' : v // next line is another label → field is empty
  }
  return {
    status: grab('Status'),
    issued: isoFromUs(grab('Issue Date')),
    expires: isoFromUs(grab('Expire Date')),
    found: lines.some((l) => /^expire date:$/i.test(l)),
  }
}

/**
 * The BAKED snapshot the app ships with (src/data/permitDates.ts), parsed with
 * a regex so this plain-node scanner can use it as the day-one comparison
 * baseline — before blob.portalDates has its first recording, a change vs the
 * June 2026 snapshot is still a change worth flagging. Any read/parse failure
 * returns {} (no baseline → record quietly, never crash the scan).
 */
export function readBakedDates(fileUrl) {
  try {
    const src = fs.readFileSync(fileUrl, 'utf8')
    const out = {}
    const re = /'([^']+)':\s*\{\s*status:\s*'([^']*)',\s*issued:\s*'([^']*)',\s*expires:\s*'([^']*)'\s*\}/g
    let m
    while ((m = re.exec(src))) out[m[1]] = { status: m[2], issued: m[3], expires: m[4] }
    return out
  } catch {
    return {}
  }
}

/**
 * Has the expiration date genuinely CHANGED? Only when we knew a date before
 * AND read a (different) date now — a first sighting or an unparseable read is
 * never a "change" (the never-guess rule). Returns null, or {from, to}.
 */
export function expiryChange(prevExpires, newExpires) {
  if (!prevExpires || !newExpires || prevExpires === newExpires) return null
  return { from: prevExpires, to: newExpires }
}
