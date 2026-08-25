#!/usr/bin/env node
/**
 * fetch-legals.mjs — fill src/data/legal.ts with every parcel's legal
 * description, straight from Marion County's public records.
 *
 * Two public sources, chained:
 *   1. Marion County GIS (gis.marionfl.org) — parcel → ALT_Key
 *   2. Property Appraiser record card (pa.marion.fl.us/PRC.aspx?key=ALT_Key)
 *      — the FULL legal description ("SEC 35 TWP 15 RGE 18 PLAT BOOK F ...
 *      BLK 24 LOT 34")
 *
 * We compact that into the form the SECO application uses
 * ("Sec 35 / Twp 15 / Rge 18 · Blk 24 · Lot 34"); anything that doesn't
 * parse cleanly keeps its full raw text (verbose but accurate beats tidy
 * but wrong on a legal document).
 *
 * Usage:  node scripts/fetch-legals.mjs            # preview only
 *         node scripts/fetch-legals.mjs --write    # regenerate src/data/legal.ts
 *
 * Re-run with --write whenever new projects (parcels) are added.
 * Read-only against county systems; ~1 polite request per parcel.
 *
 * WHERE THE PARCELS COME FROM (Aug 2026): the roster's real source of truth
 * is the CLOUD blob — houses added in the app never touch data/projects.ts.
 * So this script now reads the LIVE roster from Supabase when scanner/.env
 * is present (Adam's Mac), and falls back to scanning data/projects.ts
 * (seed roster) otherwise. Cloud read is read-only; nothing is written back.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WRITE = process.argv.includes('--write')

const GIS = 'https://gis.marionfl.org/public/rest/services/General/Parcels/MapServer/0/query'
const PRC = 'https://www.pa.marion.fl.us/PRC.aspx?key='

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The seed roster's parcels (data/projects.ts) — the offline fallback. */
function seedParcels() {
  const src = readFileSync(join(ROOT, 'src/data/projects.ts'), 'utf8')
  const out = new Set()
  for (const m of src.matchAll(/parcel:\s*["']([^"']+)["']/g)) {
    const p = m[1].trim()
    if (p && !/tbd/i.test(p)) out.add(p)
  }
  return out
}

/** The LIVE roster's parcels from the cloud blob (read-only), when
 *  scanner/.env creds are available — null otherwise. */
async function cloudParcels() {
  const envPath = join(ROOT, 'scanner/.env')
  if (!existsSync(envPath)) return null
  const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/workbench?id=eq.main&select=data`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`cloud roster read failed: HTTP ${res.status}`)
  const rows = await res.json()
  const roster = rows?.[0]?.data?.roster
  if (!Array.isArray(roster)) return null
  const out = new Set()
  for (const r of roster) {
    const p = String(r?.parcel ?? '').trim()
    if (p && !/tbd/i.test(p)) out.add(p)
  }
  return out
}

/** All unique parcels: live cloud roster when reachable (union'd with the
 *  seed, so a seed-only parcel never drops out), seed alone otherwise. */
async function rosterParcels() {
  const seed = seedParcels()
  try {
    const cloud = await cloudParcels()
    if (cloud) {
      console.log(`(live cloud roster: ${cloud.size} parcels · seed file: ${seed.size})`)
      for (const p of seed) cloud.add(p)
      return [...cloud].sort()
    }
  } catch (e) {
    console.log(`(cloud roster unavailable — ${e.message}; using the seed file)`)
  }
  return [...seed].sort()
}

/** Parcel → ALT_Key for a batch of parcels, via the county GIS layer. */
async function altKeys(parcels) {
  const where = `PARCEL IN (${parcels.map((p) => `'${p}'`).join(',')})`
  const url = `${GIS}?${new URLSearchParams({
    where,
    outFields: 'PARCEL,ALT_Key',
    returnGeometry: 'false',
    f: 'json',
  })}`
  const d = await (await fetch(url)).json()
  const map = new Map()
  for (const f of d.features ?? []) map.set(f.attributes.PARCEL, f.attributes.ALT_Key)
  return map
}

/** Pull the legal description AND the owner block off a record card page.
 *  (The owner feeds the Notice of Commencement's section 3a — see
 *  data/paProperty.ts; the card reads "Property Information <OWNER NAME>
 *  <MAILING ADDRESS> Taxes / Assessments:".) */
async function legalFromPrc(altKey) {
  const html = await (await fetch(PRC + altKey)).text()
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
  // The card reads: "Property Description <LEGAL> Land Data"
  const m = text.match(/Property Description\s+(.+?)\s+Land Data/i)
  const o = text.match(/Property Information\s+(.+?)\s+Taxes \/ Assessments:/i)
  return { legal: m ? m[1].trim() : null, owner: o ? o[1].trim() : null }
}

/**
 * Compact a full legal into the application form's style:
 *   "SEC 35 TWP 15 RGE 18 PLAT BOOK F PAGE 136 RAINBOW ... BLK 24 LOT 34"
 *   → "Sec 35 / Twp 15 / Rge 18 · Blk 24 · Lot 34"
 * Falls back to the raw text when the lot/block part is irregular
 * (metes-and-bounds, partial lots, …) — accuracy beats tidiness.
 */
function compact(raw) {
  // "Parent Parcel: 1328-017-009" is PRC metadata, not part of the legal.
  raw = raw.replace(/\s*Parent Parcel:.*$/i, '').trim()
  const str = raw.match(/SEC\s+(\w+)\s+TWP\s+(\w+)\s+RGE\s+(\w+)/i)
  if (!str) return raw
  const head = `Sec ${str[1]} / Twp ${str[2]} / Rge ${str[3]}`
  const blkAt = raw.toUpperCase().lastIndexOf(' BLK ')
  if (blkAt !== -1) {
    const tail = raw.slice(blkAt + 1).trim() // "BLK 24 LOT 34" / "BLK Q LOTS 11.12"
    const simple = tail.match(/^BLK\s+(\S+)\s+LOTS?\s+([\d\s&.,]+)$/i)
    if (simple) {
      // The cards separate multiple lots with periods ("11.12") — write them
      // the way the applications do: "11 & 12" / "74, 75 & 76".
      const nums = simple[2].split(/[\s&.,]+/).filter(Boolean)
      const lots =
        nums.length === 1
          ? nums[0]
          : `${nums.slice(0, -1).join(', ')} & ${nums[nums.length - 1]}`
      return `${head} · Blk ${simple[1]} · Lot${nums.length > 1 ? 's' : ''} ${lots}`
    }
    return `${head} · ${tail}` // irregular tail (partial lots, AKA, …) — keep verbatim
  }
  // No block (acreage / unplatted): keep everything after the Sec/Twp/Rge.
  const rest = raw.slice(str.index + str[0].length).trim()
  return rest ? `${head} · ${rest}` : head
}

const parcels = await rosterParcels()
console.log(`Roster parcels: ${parcels.length}`)

const keys = await altKeys(parcels)
console.log(`ALT_Keys found: ${keys.size}`)

const results = new Map() // parcel → { compact, raw }
const misses = []
for (const p of parcels) {
  const key = keys.get(p)
  if (!key) {
    misses.push([p, 'not found in county GIS'])
    continue
  }
  try {
    const { legal: raw, owner } = await legalFromPrc(key)
    if (!raw) misses.push([p, `PRC ${key}: no Property Description block`])
    else results.set(p, { compact: compact(raw), raw, owner })
  } catch (e) {
    misses.push([p, `PRC ${key}: ${e.message}`])
  }
  await sleep(250) // be polite to the county's server
}

console.log(`\nLegals fetched: ${results.size}/${parcels.length}`)
for (const [p, r] of results) console.log(`  ${p}  →  ${r.compact}`)
if (misses.length) {
  console.log(`\n⚠ Missing (${misses.length}) — keep manual lookups for these:`)
  for (const [p, why] of misses) console.log(`  ${p}: ${why}`)
}

if (!WRITE) {
  console.log('\n(preview only — run with --write to regenerate src/data/legal.ts)')
  process.exit(0)
}

const stamp = new Date().toISOString().slice(0, 10)
const lines = [...results.entries()]
  .map(([p, r]) => `  '${p}': '${r.compact.replace(/'/g, "\\'")}',`)
  .join('\n')

const file = `/**
 * legal.ts — parcel → legal description (Lot/Block/Sec/Twp/Rge), needed on the
 * SECO application.
 *
 * GENERATED by \`node scripts/fetch-legals.mjs --write\` on ${stamp}
 * from the Marion County Property Appraiser's public record cards
 * (pa.marion.fl.us). Re-run after adding projects. Parcels the county
 * doesn't return fall back to the "[look up …]" placeholder so an
 * application can never go out with a silently-blank legal.
 */
export const LEGAL: Record<string, string> = {
${lines}
}

export const LEGAL_PLACEHOLDER = '[look up Lot/Block/Sec/Twp/Rge on pa.marion.fl.us]'

export function legalFor(parcel: string): string {
  return LEGAL[parcel] ?? LEGAL_PLACEHOLDER
}
`
writeFileSync(join(ROOT, 'src/data/legal.ts'), file)

// ---- second generated file: the raw (FULL) legal + the deeded owner, for
// the Notice of Commencement (lib/nocForm.ts). Kept separate from legal.ts
// so the SECO flow stays byte-identical.
const rawLines = [...results.entries()]
  // "Parent Parcel: …" is PRC metadata, not part of the legal (compact()
  // strips it too) — it must never land on a recorded document.
  .map(([p, r]) => `  '${p}': '${r.raw.replace(/\s*Parent Parcel:.*$/i, '').trim().replace(/'/g, "\\'")}',`)
  .join('\n')
const ownerLines = [...results.entries()]
  .filter(([, r]) => r.owner)
  .map(([p, r]) => `  '${p}': '${r.owner.replace(/'/g, "\\'")}',`)
  .join('\n')

const file2 = `/**
 * paProperty.ts — parcel → the county Property Appraiser's FULL legal
 * description and the current DEEDED OWNER (name + mailing address, one
 * string, exactly as the record card shows it).
 *
 * GENERATED by \`node scripts/fetch-legals.mjs --write\` on ${stamp}
 * (same pass that builds legal.ts). Re-run after adding projects — and
 * remember the PA record can LAG a recent deed by weeks, so the NOC form
 * keeps these editable and asks you to double-check.
 */
export const PA_RAW_LEGAL: Record<string, string> = {
${rawLines}
}

export const PA_OWNER: Record<string, string> = {
${ownerLines}
}
`
writeFileSync(join(ROOT, 'src/data/paProperty.ts'), file2)
console.log('Wrote src/data/legal.ts and src/data/paProperty.ts')
console.log(`\n✏️  Wrote src/data/legal.ts (${results.size} parcels)`)
