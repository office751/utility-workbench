// Generator: reads the Construction Job List CSV and writes src/data/sharepoint.ts
// with two lookups keyed by PERMIT NUMBER:
//   PERMIT_PORTALS  — county permit-portal URL per permit
//   PROJECT_FOLDERS — SharePoint project-docs folder URL per permit
import { readFileSync, writeFileSync } from 'node:fs'

const [, , csvPath, outPath] = process.argv
const text = readFileSync(csvPath, 'utf8')

// --- a minimal but correct CSV parser (handles quotes, commas & newlines in quotes) ---
function parseCSV(str) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (inQuotes) {
      if (c === '"') {
        if (str[i + 1] === '"') { field += '"'; i++ } // escaped quote
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const rows = parseCSV(text)
const header = rows[0]
const col = (name) => header.indexOf(name)
const iPermit = col('Permit%23')
const iPortal = col('Permit Portal')
const iDocs = col('Project Docs')

const SP_HOST = 'https://netorg13901770.sharepoint.com'

// Strip " (SFR)" / " (ADU)" etc. and trim → the clean key that matches the roster's permit.
const cleanPermit = (s) => (s || '').replace(/\s*\(.*?\)\s*/g, '').trim()

const portals = {}, folders = {}
for (let r = 1; r < rows.length; r++) {
  const row = rows[r]
  if (!row || !row[iPermit]) continue
  const permit = cleanPermit(row[iPermit])
  if (!permit) continue

  const portal = (row[iPortal] || '').trim()
  if (portal) portals[permit] = portal

  let docs = (row[iDocs] || '').trim()
  if (docs) {
    // The export stores docs links relative ("/:f:/s/..."); add the host back.
    if (docs.startsWith('/')) docs = SP_HOST + docs
    folders[permit] = docs
  }
}

const entries = (obj) =>
  Object.keys(obj).map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(obj[k])},`).join('\n')

const out = `/**
 * sharepoint.ts — per-permit links, AUTO-GENERATED from the exported
 * "Construction Job List" CSV.
 * Regenerate: node scripts/gen-sharepoint.mjs "<exported csv>" src/data/sharepoint.ts
 *
 * Both maps are keyed by PERMIT NUMBER (unique per project, so SFR/ADU pairs
 * that share a parcel still get the right links). They act as DEFAULTS — a
 * URL typed into the app (ps.permitUrl / ps.sharepointUrl) overrides them,
 * same override pattern as engineer / water source.
 */

/** County permit-portal page, per permit number. */
export const PERMIT_PORTALS: Record<string, string> = {
${entries(portals)}
}

/** SharePoint project-docs folder, per permit number. */
export const PROJECT_FOLDERS: Record<string, string> = {
${entries(folders)}
}
`
writeFileSync(outPath, out)
console.log(`Wrote ${Object.keys(portals).length} portal links, ${Object.keys(folders).length} folder links`)
