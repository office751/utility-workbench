// Oct 2026: make the Runbook Template trainable for a new office manager who
// owns EVERYTHING, permitting included. Three changes to the template board:
//   1. a plain-English Tip on every step (shows under the step in the Runbook tab)
//   2. the missing in-house permitting steps (subs, review, approved, NOC)
//   3. two Duke-only electric steps (Applies to = "Duke") from Duke's checklist
// and renumbers Order 1..N so the flat list reads top to bottom.
// Idempotent: rows are matched by Step Key; a key that already exists is
// updated, a missing one is created. Dry run by default — add --write.
// Writes are batched (many mutations per API call) to stay under Monday's
// daily call limit.
import { mondayQuery } from './monday.mjs'

const TEMPLATE = 18430320313
const TCOL = { stage: 'color_mm71eac2', order: 'numeric_mm71jmpr', applies: 'dropdown_mm71c4gw', tip: 'long_text_mm71yc3e', key: 'text_mm71pvdw' }
const GROUP = { Permit: 'group_mm71qbs7', Electric: 'group_mm7173kk', Water: 'group_mm71n7h', Septic: 'group_mm7132ed', Closing: 'group_mm71amt0' }
const dry = !process.argv.includes('--write')

// [key, stage, label (only used when the row is NEW), applies (NEW rows only), tip]
// Existing rows keep their name + Applies to (Adam edits those on the board).
const STEPS = [
  ['chouse', 'Permit', '', '', 'Pick the model that fits the lot (a 100×100 lot leaves about 84×50 to build on after 25/25/8/8 setbacks). Plan sets: Directory → Operations/Plans. Put the model in the Model column.'],
  ['siteplan', 'Permit', '', '', 'Show the house, driveway, well, septic tank + drainfield and setbacks. Keep the PDF — the county AND Duke (for Duke lots) both want it.'],
  ['subs', 'Permit', 'Subs lined up for the application (Electric, HVAC, Plumbing, Roofing)', 'All lots', 'Add each sub on EnerGov by Contact ID: Electrical = Iron Shield Electric (21298) · Mechanical = Iron Shield Heating & Air (22089) · Plumbing = Iron Shield Plumbing (23046) · Roofing = Southern Pro Roofing (21603). Filings ride William Stiles\'s license (CGC1533513).'],
  ['submitted', 'Permit', '', '', 'Apply on Marion County EnerGov as Iron Shield Construction LLC. Copy the permit # into the Permit column as soon as it\'s assigned. The impact-fee rate locks in on the date of the first complete application.'],
  ['review', 'Permit', 'County review — watch the portal, answer any corrections', 'All lots', 'Check the portal every 2–3 days. If plans are rejected: read each review comment, get the plans fixed, resubmit with a short response letter. Questions → Building Safety 352-438-2400.'],
  ['approved', 'Permit', 'Permit approved — permit + impact fees paid', 'All lots', 'Pay on the portal. Impact fees are the big one (roughly $9–10k for a typical house; detached ADUs over 1,000 s.f. pay transportation only). Building permit fees are only a few hundred dollars (square-foot fees are 50% off through Sep 30 2027).'],
  ['issued', 'Permit', '', '', 'Click "Mark permit issued" — it fills Permit Issued + sets the status. Then fill Permit Expires; the board warns 30 days before it lapses.'],
  ['noc', 'Permit', 'Notice of Commencement recorded + copy posted on site', 'All lots', 'Lodestar → Permit tab → 🖨 NOC. Owner = the deeded owner on the Property Appraiser; lender = N/A. Owner signs in front of a notary, record it with the Clerk, post a copy at the job. Needed before the first inspection.'],

  ['verify', 'Electric', '', '', 'Check the county GIS electric-service map — never assume. The SECO/Duke line runs about a mile east of the Marion Oaks west edge. Set the Electric Co. column.'],
  ['submit', 'Electric', '', '', 'SECO: the button drafts the application email (sign + date the packet). Duke: apply on the Builder Portal, then answer the WO# email with the load form + site plan. Ocala Electric (city limits): load form → Engineering 352-351-6600.'],
  ['deposit', 'Electric', '', '', 'Pay any deposit / CIAC invoice the utility sends — they won\'t design or schedule until it\'s paid.'],
  ['engineer', 'Electric', '', '', 'Write the engineer\'s name in the Engineer column. The UTILITY decides the meter side (LH/RH) — ask the engineer, don\'t guess.'],
  ['dukepaper', 'Electric', 'Easement / damage-liability paperwork signed by owner & returned (if Duke sent any)', 'Duke', 'Easements need the DEEDED owner + 2 witnesses + a notary. The damage-liability waiver the builder can sign. Duke won\'t schedule line work until these are back.'],
  ['rough', 'Electric', '', '', 'When rough plumbing passes, let the utility know (SECO: email; Duke: it unlocks scheduling).'],
  ['canup', 'Electric', 'Meter can up (911 address RIVETED, no stickers) + path cleared + private lines marked — engineer notified', 'Duke', 'Email the Duke engineer photos of the can and the cleared path. This is what gets the house on Duke\'s line-work schedule — send it the day the can goes up.'],
  ['fieldsched', 'Electric', '', '', 'Utility schedules the line work. Make sure the path is clear and nothing is parked on it.'],
  ['fielddone', 'Electric', '', '', 'Line work finished — tick it and move to the meter.'],
  ['meternotify', 'Electric', '', '', 'SECO: email the photos — green tag, downpipe, sweep, straps, clear path. Duke: call the Builder Hotline 1-866-372-4663 yourself (the county doesn\'t always).'],
  ['meter', 'Electric', '', '', 'Meter goes in after the county electrical inspection passes.'],
  ['power', 'Electric', '', '', 'Power is on — electric is finished until closing.'],

  ['wdrilled', 'Water', '', '', 'Well driller installs the well + pump. Then tell Vicki the well is in (septic step below).'],
  ['cavail', 'Water', '', '', 'Email Marion County Utilities (Dawn Cook) with the parcel # to confirm water is available. Bahia Oaks area is Southwest Ocala Utility instead (352-245-3475).'],
  ['capply', 'Water', '', '', 'Submit MCU\'s new-service application with the permit #.'],
  ['cwmagree', 'Water', '', '', 'If the main doesn\'t reach the lot, MCU quotes a main extension — sign the agreement and pay before they build it.'],
  ['cwmbuilt', 'Water', '', '', 'MCU (or their contractor) builds the extension. Nothing to send — just follow up.'],
  ['ctap', 'Water', '', '', 'Pay the tap / meter fees; MCU sets the meter.'],
  ['cconn', 'Water', '', '', 'Plumber connects the house to the meter. Then tell Vicki the water line is hooked up.'],

  ['seval', 'Septic', '', '', 'Order the soil test from Craig Davis (Rapid Septic Consulting) — the button drafts the email.'],
  ['sapplied', 'Septic', '', '', 'Georges Plumbing (Vicki Kirby, 352-406-1524) applies for the septic construction permit.'],
  ['sissued', 'Septic', '', '', 'Put the septic permit # (42-SC-…) in the Septic Permit column.'],
  ['scounty', 'Septic', '', '', 'The applicant on the county septic permit is the PROPERTY OWNER, not Iron Shield.'],
  ['snrb', 'Septic', '', '', 'Lodestar → Septic tab → 🖨 INRB notice. Owner signs in front of a notary, record it with the Clerk, email the recorded copy to Vicki.'],
  ['sinstalled', 'Septic', '', '', 'Georges installs the tank + drainfield.'],
  ['snwell', 'Septic', '', '', 'Vicki needs three heads-ups before she can schedule the final: well in, water line hooked up, sod down. This is #1.'],
  ['snwater', 'Septic', '', '', 'Heads-up #2 to Vicki.'],
  ['snsod', 'Septic', '', '', 'Heads-up #3 to Vicki — after this she schedules the final.'],
  ['sapproved', 'Septic', '', '', 'Final septic approval — the C.O. can\'t happen without it.'],
  ['sweravail', 'Septic', '', '', 'Sewer lot = NO septic permit. Email MCU with the parcel # to confirm sewer is available.'],
  ['swerapply', 'Septic', '', '', 'Submit MCU\'s sewer service application.'],
  ['swertap', 'Septic', '', '', 'Pay the sewer tap / connection fees.'],
  ['swerconn', 'Septic', '', '', 'Plumber connects the house to the sewer.'],

  ['contract', 'Closing', '', '', 'Enter the Closing Date on the board — that switches on these closing steps and the shut-off alarm.'],
  ['cdate', 'Closing', '', '', 'Confirm the date with the title company; fix the Closing Date column if it moves.'],
  ['walkthrough', 'Closing', '', '', 'Schedule the buyer walkthrough; punch-list anything they find.'],
  ['estop', 'Closing', '', '', 'Electric must be stopped / transferred no later than 2 business days after closing — schedule it now.'],
  ['wstop', 'Closing', '', '', 'City-water lots only in practice — a well has no account to disconnect. Needs the MCU form + the recorded deed.'],
  ['xfer', 'Closing', '', '', 'Confirm the utility actually stopped / transferred the account.'],
  ['handoff', 'Closing', '', '', 'Keys, warranty paperwork and the selections sheet go to the buyer.'],
  ['deedclosed', 'Closing', '', '', 'Deed recorded — move the house to Completed Jobs.'],
]

const d = await mondayQuery(`{ boards(ids:[${TEMPLATE}]) { items_page(limit:200) { items { id name column_values(ids:["${TCOL.key}"]) { text } } } } }`)
const byKey = Object.fromEntries(d.boards[0].items_page.items.map((i) => [(i.column_values[0].text || '').trim(), i]))
const known = new Set(STEPS.map((s) => s[0]))
const orphans = Object.keys(byKey).filter((k) => k && !known.has(k))
if (orphans.length) console.log('⚠ template rows not in this script (left untouched, sorted last):', orphans)

const muts = []
STEPS.forEach(([key, stage, label, applies, tip], i) => {
  const order = i + 1
  const row = byKey[key]
  if (row) {
    const v = { [TCOL.order]: String(order), [TCOL.tip]: { text: tip } }
    muts.push(`u${i}: change_multiple_column_values(board_id:${TEMPLATE}, item_id:${row.id}, column_values:${JSON.stringify(JSON.stringify(v))}, create_labels_if_missing:true) { id }`)
  } else {
    const v = { [TCOL.order]: String(order), [TCOL.tip]: { text: tip }, [TCOL.key]: key, [TCOL.stage]: { label: stage }, [TCOL.applies]: { labels: [applies] } }
    console.log('NEW', order, key, '→', label)
    muts.push(`c${i}: create_item(board_id:${TEMPLATE}, group_id:"${GROUP[stage]}", item_name:${JSON.stringify(label)}, column_values:${JSON.stringify(JSON.stringify(v))}, create_labels_if_missing:true) { id }`)
  }
})
console.log({ rows: STEPS.length, mutations: muts.length, mode: dry ? 'DRY RUN (add --write)' : 'WRITE' })
if (dry) process.exit(0)
for (let i = 0; i < muts.length; i += 20) {
  await mondayQuery(`mutation { ${muts.slice(i, i + 20).join('\n')} }`)
  console.log('batch done', i / 20 + 1)
}
