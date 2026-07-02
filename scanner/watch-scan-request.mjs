/**
 * watch-scan-request.mjs — the Mac half of the app's 🔄 "Scan now" button.
 *
 * The button (🏠 Today) stamps `scanMeta.requestedAt` into the workbench blob.
 * launchd runs this script every 2 minutes (com.ironshield.scanwatcher); when
 * it sees a request NEWER than the last completed scan (and fresher than 30
 * minutes), it runs `node scan.mjs --write`. That run's own completion stamp
 * (`scanMeta.lastScanAt`) is what flips the app back to "portal scan ✓" on
 * every device — this script never writes the blob itself.
 *
 * Cost when idle: one small HTTP read per tick, no output. Guards:
 *   • request older than 30 min = stale (the Mac was probably off/asleep) →
 *     ignored; the app's pending state expires on the same 30-minute clock,
 *     so both sides always agree and the button re-offers itself.
 *   • pgrep + a pid lockfile → never two scans at once (covers the 5:30
 *     nightly, a second watcher tick, and manual runs). If a scan is already
 *     running, its completion stamp serves the request anyway.
 *
 * Try it by hand:
 *   node watch-scan-request.mjs --check   # print the decision, run nothing
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import fs from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'

const checkOnly = process.argv.includes('--check')
const LOCK = new URL('./.scan.lock', import.meta.url)
const say = (m) => console.log(`${new Date().toISOString()} ${m}`)

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { data, error } = await sb.from('workbench').select('data').eq('id', 'main').maybeSingle()
if (error) {
  say(`blob read failed: ${error.message}`)
  process.exit(1)
}

const meta = data?.data?.scanMeta
if (!meta?.requestedAt) process.exit(0) // nothing asked — the usual quiet tick

const req = Date.parse(meta.requestedAt)
const last = meta.lastScanAt ? Date.parse(meta.lastScanAt) : 0
const ageMin = Math.round((Date.now() - req) / 60_000)

if (Number.isNaN(req) || req <= last) process.exit(0) // malformed, or already served
if (ageMin > 30) {
  say(`request from ${ageMin} min ago is stale — ignoring (Mac was off? press the button again)`)
  process.exit(0)
}

// Is a scan already running (nightly job, another tick, a manual run)?
let running = false
try {
  execSync("pgrep -f 'scan\\.mjs --write'", { stdio: 'ignore' })
  running = true
} catch {
  /* pgrep found nothing — good to go */
}
if (running) {
  say('a scan is already running — its completion stamp will serve this request')
  process.exit(0)
}

// Lockfile with our pid: a second tick during a long scan bails out above via
// pgrep, but the lock also catches the tiny window before scan.mjs spawns.
try {
  const pid = Number(fs.readFileSync(LOCK, 'utf8'))
  process.kill(pid, 0) // throws if that pid is gone
  say(`another watcher (pid ${pid}) holds the lock`)
  process.exit(0)
} catch {
  fs.rmSync(LOCK, { force: true }) // no lock, or a stale one from a dead run
}

if (checkOnly) {
  say(`WOULD RUN: request from ${ageMin} min ago is newer than the last scan → node scan.mjs --write`)
  process.exit(0)
}

fs.writeFileSync(LOCK, String(process.pid))
say(`request from ${ageMin} min ago — starting scan.mjs --write`)
const r = spawnSync(process.execPath, ['scan.mjs', '--write'], {
  cwd: new URL('.', import.meta.url).pathname,
  stdio: 'inherit', // scan output lands in this job's launchd log (scan-watch.log)
})
fs.rmSync(LOCK, { force: true })
say(`scan finished with exit ${r.status}`)
process.exit(r.status ?? 0)
