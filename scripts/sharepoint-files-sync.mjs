/**
 * sharepoint-files-sync.mjs — ONE-TIME backfill: per-project SharePoint
 * folders → the Workbench's project Files boxes.
 *
 * Adam: "take all the project files from sharepoint and upload them to their
 * associated project … use the link that's on the sharepoint list that takes
 * you to where the documents are located."
 *
 * Inputs:
 *   /tmp/sp-paths.json — { "<permit>": "<server-relative folder path>" }
 *     (each project's sharing link resolved through Adam's signed-in Chrome —
 *      the links are the source of truth; folder names follow no convention)
 *
 * The server-relative path maps to the locally-synced OneDrive copy:
 *   /sites/ProcesstoBuildingaHouse/Shared Documents/<X>
 *   → ~/Library/CloudStorage/OneDrive-ironshieldconstruction.com/Construction Projects/<X>
 *
 * Modes:
 *   node sharepoint-files-sync.mjs            → DRY RUN: per-project inventory
 *                                               (file counts + MB), nothing uploaded
 *   node sharepoint-files-sync.mjs --upload   → upload + write doc pointers
 *
 * Safety (scanner-style):
 *   - blob backed up to scanner/backups/ before any write
 *   - de-dupes by file NAME against existing project docs (never re-uploads
 *     something the Files box already shows)
 *   - skips junk (.DS_Store etc.), zero-byte files, and files > 100 MB
 *   - bucket uploads are additive; pointers appended, never replaced
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const SCANNER_ENV = new URL('../scanner/.env', import.meta.url)
const env = Object.fromEntries(
  fs.readFileSync(SCANNER_ENV, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const SB_URL = env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY
const ONEDRIVE_ROOT = '/Users/Construction/Library/CloudStorage/OneDrive-ironshieldconstruction.com/Construction Projects'
const SP_PREFIX = '/sites/ProcesstoBuildingaHouse/Shared Documents/'
const doUpload = process.argv.includes('--upload')

const JUNK = /^(\.DS_Store|Thumbs\.db|desktop\.ini|~\$)/i
const MAX_BYTES = 100 * 1024 * 1024

/** Server-relative SharePoint path → local synced folder (or null). */
function toLocal(spPath) {
  const decoded = decodeURIComponent(spPath)
  if (!decoded.startsWith(SP_PREFIX)) return null
  return path.join(ONEDRIVE_ROOT, decoded.slice(SP_PREFIX.length))
}

/** Every real file under `dir`, recursive, with relative display names. */
function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (JUNK.test(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full, base))
    else {
      const size = fs.statSync(full).size
      if (size === 0 || size > MAX_BYTES) continue
      out.push({ full, name: path.relative(base, full).replaceAll('/', ' — '), size })
    }
  }
  return out
}

const safeName = (n) => n.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file'
const mb = (b) => (b / 1048576).toFixed(1)

const spPaths = JSON.parse(fs.readFileSync('/tmp/sp-paths.json', 'utf8'))
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } })
const { data, error } = await sb.from('workbench').select('data').eq('id', 'main').maybeSingle()
if (error || !data?.data?.roster) throw new Error('could not read workbench: ' + (error?.message ?? 'no data'))
const blob = data.data
const originalJson = JSON.stringify(blob)

const plan = []
let totalFiles = 0, totalBytes = 0
for (const p of blob.roster) {
  const sp = spPaths[p.permit]
  if (!sp) continue
  const local = toLocal(sp)
  if (!local) { plan.push({ p, err: 'unmapped path: ' + sp }); continue }
  if (!fs.existsSync(local)) { plan.push({ p, err: 'not synced locally: ' + local }); continue }
  const have = new Set(((blob.projects[p.id] ?? {}).docs ?? []).map((d) => d.name))
  const files = listFiles(local).filter((f) => !have.has(f.name))
  if (!files.length) { plan.push({ p, files: [], note: 'nothing new' }); continue }
  totalFiles += files.length
  totalBytes += files.reduce((s, f) => s + f.size, 0)
  plan.push({ p, local, files })
}

console.log(`\nSharePoint → Files sync ${doUpload ? '(UPLOADING)' : '(DRY RUN)'}\n`)
for (const item of plan) {
  const tag = `#${item.p.id} ${item.p.address}`
  if (item.err) console.log(`  ⚠ ${tag} — ${item.err}`)
  else if (!item.files.length) console.log(`  · ${tag} — nothing new`)
  else console.log(`  + ${tag} — ${item.files.length} files, ${mb(item.files.reduce((s, f) => s + f.size, 0))} MB`)
}
console.log(`\nTOTAL: ${totalFiles} files · ${mb(totalBytes)} MB across ${plan.filter((x) => x.files?.length).length} projects\n`)

if (!doUpload) {
  console.log('(dry run — re-run with --upload to apply)')
  process.exit(0)
}

// ---- upload + pointer write (scanner-style safety) ----
fs.mkdirSync(new URL('../scanner/backups/', import.meta.url), { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(new URL(`../scanner/backups/workbench-${stamp}.json`, import.meta.url), originalJson)

// SFR/ADU pairs share a SharePoint folder — upload each FILE once and give
// every project that uses the folder its own POINTER to the same bytes
// (cuts ~550 MB of duplication across the nine shared-folder pairs).
const uploadedByFile = new Map() // local full path -> storage path
let uploaded = 0, reused = 0, failed = 0
for (const item of plan) {
  if (!item.files?.length) continue
  const ps = (blob.projects[item.p.id] ??= { steps: { electric: {}, water: {}, septic: {}, permit: {}, materials: {} }, notes: { electric: '', water: '', septic: '', permit: '', materials: '' } })
  ps.docs ??= []
  for (const f of item.files) {
    try {
      let storagePath = uploadedByFile.get(f.full)
      if (!storagePath) {
        storagePath = `${item.p.id}/${crypto.randomUUID()}/${safeName(path.basename(f.full))}`
        const bytes = fs.readFileSync(f.full)
        const { error: uerr } = await sb.storage.from('project-files').upload(storagePath, bytes, { upsert: false })
        if (uerr) throw uerr
        uploadedByFile.set(f.full, storagePath)
        uploaded++
        process.stdout.write(`  ↑ #${item.p.id} ${f.name} (${mb(f.size)} MB)\n`)
      } else {
        reused++
      }
      ps.docs.push({ name: f.name, addedAt: new Date().toLocaleDateString(), path: storagePath, size: f.size })
    } catch (e) {
      failed++
      console.warn(`  ✗ #${item.p.id} ${f.name}: ${e.message}`)
    }
  }
}

const { error: werr } = await sb.from('workbench').upsert({ id: 'main', data: blob, updated_at: new Date().toISOString() })
if (werr) throw new Error('pointer write failed: ' + werr.message)
console.log(`\n✓ ${uploaded} uploaded, ${reused} shared-folder pointers reused, ${failed} failed. Backup: scanner/backups/workbench-${stamp}.json\n`)
