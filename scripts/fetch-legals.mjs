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
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WRITE = process.argv.includes('--write')

const GIS = 'https://gis.marionfl.org/public/rest/services/General/Parcels/MapServer/0/query'
const PRC = 'https://www.pa.marion.fl.us/PRC.aspx?key='

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** All unique parcels in the roster (source of truth: data/projects.ts). */
function rosterParcels() {
  const src = readFileSync(join(ROOT, 'src/data/projects.ts'), 'utf8')
  const out = new Set()
  for (const m of src.matchAll(/parcel:\s*["']([^"']+)["']/g)) {
    const p = m[1].trim()
    if (p && !/tbd/i.test(p)) out.add(p)
  }
  return [...out].sort()
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

/** Pull the legal description text off a property record card page. */
async function legalFromPrc(altKey) {
  const html = await (await fetch(PRC + altKey)).text()
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
  // The card reads: "Property Description <LEGAL> Land Data"
  const m = text.match(/Property Description\s+(.+?)\s+Land Data/i)
  return m ? m[1].trim() : null
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

const parcels = rosterParcels()
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
    const raw = await legalFromPrc(key)
    if (!raw) misses.push([p, `PRC ${key}: no Property Description block`])
    else results.set(p, { compact: compact(raw), raw })
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
console.log(`\n✏️  Wrote src/data/legal.ts (${results.size} parcels)`)
