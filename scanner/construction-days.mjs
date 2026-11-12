#!/usr/bin/env node
/**
 * Construction Days sync (Nov 2026).
 *
 * The "Construction Days" view on the Monday Construction Job List shows, for
 * every house under construction, its day of construction (calendar days from
 * the permit issue date) and four milestone checks (day 35 lintel, 70 drywall,
 * 105 flooring, 140 CO). The DAY COUNT and the green/yellow/red status are
 * Monday formula columns, so they roll forward every day with no job at all.
 *
 * This script only keeps the county-sourced cells fresh:
 *   Permit Issued            <- the county's live issue date for the permit
 *   Lintel Passed            <- first Approved "Lintel or Tie Beam" inspection. Only filled when blank.
 *   Power Release Passed     <- first Approved power release inspection, whichever comes first:
 *                               "(TUG) Preliminary Power Release" or the full "Power Release".
 *                               Adam decided Nov 12 2026 they count as the SAME milestone (one date).
 *   CO Date                  <- when the county's LIVE status is Certificate of Occupancy:
 *                               the county's Finalize date. Only filled when blank.
 *   Last Approved Inspection <- most recent Approved inspection + its date
 *   Progress                 <- passed inspections / (passed + still required), in %
 *
 * Drywall Finished and Flooring Installed are NOT county inspections. People can
 * type those dates on the board; when a cell is BLANK this script fills it from
 * the date of the house's drywall / flooring-install bill in QuickBooks (read-only,
 * via qbo-trade-bills.py). A typed date is never overwritten.
 *
 * The county inspection lists are public (no login, no browser).
 *
 *   node construction-days.mjs           preview, changes nothing
 *   node construction-days.mjs --write   write the changed cells to Monday
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CJL_BOARD_ID, CJL, loadHouses, setColumns, normPermit } from './monday.mjs'

const WRITE = process.argv.includes('--write')

// Columns created Nov 11 2026 for the Construction Days view.
const COL = {
  issued: 'date_mm90c9rf',
  lintel: 'date_mm90jq4e',
  drywall: 'date_mm90yvc9', // typed by a person, or filled from the QuickBooks bill date when blank
  flooring: 'date_mm90r05m', // typed by a person, or filled from the QuickBooks bill date when blank
  co: 'date_mm90wnh2',
  lastApproved: 'text_mm9071a4',
  progress: 'numeric_mm90kwde',
  power: 'date_mm90tv45', // first Approved power release, TUG or full (one milestone)
}

const EG = 'https://selfservice.marionfl.org/energov_prod/selfservice/api/energov/'
const EG_HEADERS = {
  'content-type': 'application/json',
  tenantId: '1',
  tenantName: 'Marion County EnerGov_Prod',
  'Tyler-TenantUrl': 'home',
}

const readJson = (name) => {
  const url = new URL(name, import.meta.url)
  return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : {}
}
const caseIds = readJson('permit-portals.json') // permit # -> county CaseId
const portalDates = readJson('.portal-dates.json') // permit # -> { status, issued, expires }

/** County timestamps are UTC; the office thinks in Eastern time. */
const etDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '')
/** "Lintel or Tie Beam - 1 & 2 Residential Family" -> "Lintel or Tie Beam" */
const shortName = (n) => String(n || '').replace(/\s+/g, ' ').replace(/\s*-\s*1\s*&\s*2\b.*$/i, '').trim()

async function inspectionList(caseId, existing) {
  const res = await fetch(EG + 'entity/inspections/search/search', {
    method: 'POST',
    headers: EG_HEADERS,
    body: JSON.stringify({
      PageNumber: 1, PageSize: 200, SortField: '', IsSortedInAscendingOrder: true, ModuleId: 1,
      EntityId: caseId, IsExistingInspection: existing, IsOptionalInspection: false, IsFailed: false,
    }),
  })
  if (!res.ok) throw new Error(`county portal ${res.status}`)
  const body = await res.json()
  // A house with nothing left to inspect (it has its C.O.) gets Result:null + StatusCode 204.
  // That is an EMPTY list, not an error. (Until Nov 12 2026 this threw and the whole house was skipped.)
  if (body.Result == null && body.StatusCode === 204) return []
  if (!Array.isArray(body.Result)) throw new Error('county portal returned no list')
  return body.Result
}

/** The permit's live county record (public, no login): status, issue date, finalize (C.O.) date. */
async function livePermit(caseId) {
  const res = await fetch(EG + 'permits/' + caseId, { headers: EG_HEADERS })
  if (!res.ok) return null
  const p = (await res.json()).Result
  return p ? { status: p.PermitStatus || '', issued: etDate(p.IssueDate), finalized: etDate(p.FinalizeDate) } : null
}

/**
 * Public county permit search (no login). Used for permits the logged-in permit
 * scan doesn't list (e.g. applied for under another account), so every county
 * permit number still resolves to its CaseId + issue date.
 */
async function countySearch(permit) {
  const crit = (o = {}) => ({ PageNumber: 0, PageSize: 0, SortBy: null, SortAscending: false, ...o })
  const res = await fetch(EG + 'search/search', {
    method: 'POST',
    headers: EG_HEADERS,
    body: JSON.stringify({
      Keyword: permit, ExactMatch: true, SearchModule: 1, FilterModule: 2, SearchMainAddress: false,
      PlanCriteria: crit(), PermitCriteria: crit({ PermitNumber: permit, PageNumber: 1, PageSize: 10, SortBy: 'relevance' }),
      InspectionCriteria: crit(), CodeCaseCriteria: crit(), RequestCriteria: crit(), BusinessLicenseCriteria: crit(),
      ProfessionalLicenseCriteria: crit(), LicenseCriteria: crit(), ProjectCriteria: crit(),
      ExcludeCases: null, HiddenInspectionTypeIDs: null, PageNumber: 1, PageSize: 10, SortBy: 'relevance', SortAscending: false,
    }),
  })
  if (!res.ok) return null
  const hit = ((await res.json()).Result?.EntityResults || []).find((x) => normPermit(x.CaseNumber) === permit)
  return hit ? { caseId: hit.CaseId, issued: (hit.IssueDate || '').slice(0, 10), status: hit.CaseStatus || '' } : null
}

/** Work out the county-sourced cells for one permit. */
async function countyFacts(caseId) {
  const [existing, required] = await Promise.all([inspectionList(caseId, true), inspectionList(caseId, false)])
  const passed = new Map() // inspection name -> date it (last) passed
  const open = new Set() // requested / failed / still required, not passed
  const firstPass = new Map() // inspection name -> EARLIEST date it passed (a milestone counts from its first pass)
  for (const i of existing) {
    const name = shortName(i.InspectionType)
    const status = String(i.InspectionStatus || '')
    if (/cancel/i.test(status)) continue
    if (/^approved/i.test(status)) {
      const when = etDate(i.ActualDate || i.ScheduledStartDate || i.RequestedDate)
      if (!passed.has(name) || when > passed.get(name)) passed.set(name, when)
      if (when && (!firstPass.has(name) || when < firstPass.get(name))) firstPass.set(name, when)
    } else open.add(name)
  }
  for (const i of required) open.add(shortName(i.InspectionType))
  for (const name of passed.keys()) open.delete(name)

  const byDate = [...passed.entries()].filter(([, d]) => d).sort((a, b) => a[1].localeCompare(b[1]))
  const last = byDate[byDate.length - 1]
  const earliest = (re) => [...firstPass.entries()].filter(([n]) => re.test(n)).map(([, d]) => d).sort()[0] || ''
  const total = passed.size + open.size
  return {
    lintel: earliest(/lintel|tie beam/i),
    // One power date: the earliest of "(TUG) Preliminary Power Release" or the full "Power Release - 1&2 Res Fam".
    // (/power release/ does NOT match the separate "Electrical Service/Tug" inspection, which is not a release.)
    power: earliest(/power release/i),
    lastDate: last ? last[1] : '',
    lastApproved: last ? `${last[0]} (${Number(last[1].slice(5, 7))}/${Number(last[1].slice(8, 10))}/${last[1].slice(0, 4)})` : '',
    progress: total ? Math.round((100 * passed.size) / total) : null,
    passed: passed.size,
    total,
  }
}

/**
 * Drywall / flooring-install bill lines from QuickBooks (read-only). If QuickBooks
 * can't be reached the county part of the sync still runs; we just say so.
 */
let tradeBills = []
try {
  const out = execFileSync('python3', [fileURLToPath(new URL('qbo-trade-bills.py', import.meta.url))], { encoding: 'utf8', timeout: 240_000, maxBuffer: 64 * 1024 * 1024 })
  tradeBills = JSON.parse(out)
} catch (e) {
  console.log(`  ⚠ QuickBooks could not be read (${String(e.message).split('\n')[0]}) — drywall / flooring dates left as is\n`)
}
// Material suppliers and tile setters are NOT the flooring install.
const NOT_INSTALL = /pelican|floor & decor|lowe|home depot|briggs|ferguson|lamka/i
const isDrywall = (b) => /drywall/i.test(b.vendor) && b.amount >= 1000 // the drywall sub, not a $30 patch panel
const isFlooring = (b) => !NOT_INSTALL.test(b.vendor) && /floor|carpet/i.test(`${b.vendor} ${b.text}`) && (/install|labor/i.test(b.text) || /flooring|carpet/i.test(b.vendor)) && b.amount >= 500
/** Earliest matching bill date for this house, matched on house number + street name in the bill line's customer. */
function billDate(address, test) {
  const m = /^(\d+)\s+(?:(?:SW|SE|NW|NE|N|S|E|W)\s+)?(\S+)/i.exec(address)
  if (!m) return ''
  const re = new RegExp(`(?:^|[:\\s])${m[1]}\\s+(?:(?:SW|SE|NW|NE|N|S|E|W)\\s+)?${m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  return tradeBills.filter((b) => re.test(b.customer) && test(b)).map((b) => b.date).sort()[0] || ''
}

const houses = (await loadHouses()).filter((h) => h.groupId === CJL.groups.active)
console.log(`${houses.length} houses under construction${WRITE ? '' : '  (preview — add --write to save)'}\n`)

let changed = 0
const noPermitDate = []
for (const h of houses) {
  const permit = normPermit(h.permit)
  let caseId = caseIds[permit]
  let portal = portalDates[permit] || {}
  // Not in the permit scan's files? Ask the county's public search (county permit formats only).
  if ((!caseId || !portal.issued) && /^(BLDR-\d{2}-\d{2}-\d{5}|20\d{8})$/.test(permit)) {
    const found = await countySearch(permit).catch(() => null)
    if (found) {
      caseId ||= found.caseId
      portal = { ...portal, issued: portal.issued || found.issued, status: portal.status || found.status }
    }
  }
  // The county's live record beats the permit scan's saved file (which is only as fresh as the last scan).
  const live = caseId ? await livePermit(caseId).catch(() => null) : null
  if (live) portal = { ...portal, issued: live.issued || portal.issued, status: live.status || portal.status, finalized: live.finalized }
  const want = {}

  if (portal.issued && h.cv[COL.issued] !== portal.issued) want[COL.issued] = { date: portal.issued }
  if (!portal.issued && !h.cv[COL.issued]) noPermitDate.push(`${h.address} (${h.permit || 'no permit #'})`)

  let facts = null
  if (caseId) {
    try {
      facts = await countyFacts(caseId)
    } catch (e) {
      console.log(`  ⚠ ${h.address}: ${e.message} — left as is`)
    }
  }
  if (facts) {
    // Hand-typed dates win: Lintel and CO are only filled when the cell is blank.
    if (facts.lintel && !h.cv[COL.lintel]) want[COL.lintel] = { date: facts.lintel }
    const coDate = portal.finalized || facts.lastDate
    if (/certificate of occupancy/i.test(portal.status || '') && !h.cv[COL.co] && coDate) want[COL.co] = { date: coDate }
    // The power release date always mirrors the county (null clears a date the county no longer shows).
    if ((h.cv[COL.power] || '') !== facts.power) want[COL.power] = facts.power ? { date: facts.power } : null
    if (facts.lastApproved && h.cv[COL.lastApproved] !== facts.lastApproved) want[COL.lastApproved] = facts.lastApproved
    if (facts.progress !== null && Number(h.cv[COL.progress] || -1) !== facts.progress) want[COL.progress] = String(facts.progress)
  }

  // QuickBooks: only ever fill a BLANK drywall / flooring date.
  if (!h.cv[COL.drywall]) { const d = billDate(h.address, isDrywall); if (d) want[COL.drywall] = { date: d } }
  if (!h.cv[COL.flooring]) { const d = billDate(h.address, isFlooring); if (d) want[COL.flooring] = { date: d } }

  const issued = portal.issued || h.cv[COL.issued]
  const day = issued ? Math.round((Date.parse(etDate(new Date().toISOString())) - Date.parse(issued)) / 86_400_000) + 1 : null
  console.log(
    `${h.address.padEnd(30)} day ${String(day ?? '?').padStart(3)}  ${facts ? `${String(facts.progress).padStart(3)}% (${facts.passed}/${facts.total})  last: ${facts.lastApproved || '—'}` : 'no county record'}` +
      (Object.keys(want).length ? `   → ${Object.entries(want).map(([k, v]) => `${Object.keys(COL).find((n) => COL[n] === k)}=${v?.date ?? v}`).join(', ')}` : ''),
  )
  if (Object.keys(want).length) {
    changed++
    if (WRITE) await setColumns(CJL_BOARD_ID, h.id, want)
  }
}

console.log(`\n${changed} house(s) ${WRITE ? 'updated' : 'would be updated'}.`)
if (noPermitDate.length) console.log(`\nNo permit issue date on file — type "Permit Issued" on the board for:\n  ${noPermitDate.join('\n  ')}`)
