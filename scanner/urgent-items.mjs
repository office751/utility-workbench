// Urgent items for the Claude Code "Iron Shield urgent" panel (Oct 2026).
// Read-only: pulls the Construction Job List from Monday and prints JSON with
//   - permits whose Permit Expires date is past or within 30 days
//   - houses whose Closing Date falls in the next 7 days (or slipped up to 3 days ago)
// Dead Lots are skipped; Completed Jobs are skipped for permits (C.O. done,
// expiry no longer matters) but kept for closings.
// Usage: node urgent-items.mjs            → JSON on stdout
//        node urgent-items.mjs --pretty   → same, indented, for a human
import { loadHouses, CJL } from './monday.mjs'

const PERMIT_WINDOW_DAYS = 30
const CLOSING_AHEAD_DAYS = 7
const CLOSING_BEHIND_DAYS = 3
const CLOSING_DATE = 'date_mm706a54' // "Closing Date" on the CJL board

// Whole days from today (local) to a YYYY-MM-DD date; negative = in the past.
function daysUntil(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const then = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((then - today) / 86_400_000)
}

const houses = await loadHouses()
const permits = []
const closings = []

for (const h of houses) {
  if (h.groupId === CJL.groups.dead) continue

  const expires = h.cv[CJL.permitExpires]
  if (expires && h.groupId !== CJL.groups.completed) {
    const days = daysUntil(expires)
    if (days <= PERMIT_WINDOW_DAYS) permits.push({ id: h.id, address: h.address, permit: h.permit, date: expires, days })
  }

  const closing = h.cv[CLOSING_DATE]
  if (closing) {
    const days = daysUntil(closing)
    // permit rides along so the panel's "Check inspections" button can name it
    if (days >= -CLOSING_BEHIND_DAYS && days <= CLOSING_AHEAD_DAYS) closings.push({ id: h.id, address: h.address, permit: h.permit, date: closing, days })
  }
}

permits.sort((a, b) => a.days - b.days)
closings.sort((a, b) => a.days - b.days)

const out = { generatedAt: new Date().toISOString(), permits, closings }
console.log(process.argv.includes('--pretty') ? JSON.stringify(out, null, 2) : JSON.stringify(out))
