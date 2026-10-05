// Start the Runbook on every active house (Pre-Permitting + Permitting +
// Active - Under Construction groups) — creates the template's subitems per
// house using the same Applies-to rules as the Runbook view.
//
// Oct 2026 v2 (for training a new office manager):
//   • BACKFILL: steps already finished are created ALREADY TICKED, so the
//     Runbook's "next step" is the real next step — not "Confirm house model"
//     on a house that has power. Sources, most to least trusted:
//       1. Lodestar's own checkmarks (blob projects[id].steps / closingSteps),
//          matched by Parcel ID (address breaks ties — ADU pairs share a parcel)
//       2. Monday columns: Permit # filled → application steps done;
//          Permit Status Issued/C.O. or a Permit Issued date → whole permit stage done
//       3. Inference: within one stage, a done step means the steps above it are
//          done too — EXCEPT the recorded-paperwork steps (INRB, NOC), which only
//          count when actually ticked (NOC also counts once rough plumbing passed
//          or the house is under construction on an issued permit — inspections
//          can't happen without it).
//     Existing subitems get ticked the same way. NEVER unticks anything.
//   • BATCHED: 10 mutations per API call — Monday's daily limit counts
//     calls, and the v1 one-call-per-step rollout ran out after 20 houses.
//   • Duke houses get the template rows tagged "Duke".
//
// Idempotent. Dry run by default — add --write.
import { mondayQuery, loadEnv } from './monday.mjs'

const CJL = 18429393869, TEMPLATE = 18430320313, SUB_BOARD = 18429428473
const GROUPS = ['group_mm70nwy1', 'topics', 'group_mm70ah30'] // Pre-Permitting, Permitting, Active - Under Construction
const COL = { water: 'color_mm6t99zg', septic: 'color_mm6txs82', inrb: 'color_mm6t6n', electricCo: 'color_mm6t88t4', parcel: 'text_mm6ts07h', permit: 'text_mm6tm77m', permitStatus: 'color_mm6tnewf', permitIssued: 'date_mm70mqzh' }
const TCOL = { stage: 'color_mm71eac2', order: 'numeric_mm71jmpr', applies: 'dropdown_mm71c4gw', key: 'text_mm71pvdw' }
const SUB = { stage: 'color_mm70zk6q', key: 'text_mm70crak', order: 'numeric_mm70fn0g', done: 'boolean_mm705k0p', doneOn: 'date_mm70bxfv' }
const dry = !process.argv.includes('--write')
const ACTIVE = 'group_mm70ah30' // Active - Under Construction
const PROTECTED = new Set(['snrb', 'noc']) // never inferred from later steps
const APPLICATION = ['chouse', 'siteplan', 'subs', 'submitted'] // done once a permit # exists
const PAST_ROUGH = ['rough', 'canup', 'fieldsched', 'fielddone', 'meternotify', 'meter', 'power'] // ⇒ NOC was recorded

// ---- template ----
const t = (await mondayQuery(`{ boards(ids:[${TEMPLATE}]) { items_page(limit:200) { items { name column_values { id text } } } } }`)).boards[0].items_page.items
  .map((i) => { const cv = Object.fromEntries(i.column_values.map((c) => [c.id, c.text ?? ''])); return { label: i.name, key: cv[TCOL.key].trim(), stage: cv[TCOL.stage].trim(), order: Number(cv[TCOL.order]) || 0, applies: cv[TCOL.applies].split(',').map((x) => x.trim()).filter(Boolean) } })
  .filter((r) => r.key).sort((a, b) => a.order - b.order)
console.log('template steps:', t.length)

function profile(cv) {
  const water = cv[COL.water], septic = cv[COL.septic], inrb = cv[COL.inrb]
  const set = new Set(['All lots'])
  if (/^duke/i.test(cv[COL.electricCo])) set.add('Duke')
  if (/wm|main ext/i.test(water)) { set.add('City water'); set.add('City water + main extension') } else if (/city|fgua/i.test(water)) set.add('City water'); else if (/well/i.test(water)) set.add('Well')
  if (/sewer/i.test(septic)) set.add('Sewer'); else { set.add('Septic'); if (inrb && !/atu|n\/?a/i.test(inrb)) set.add('Septic — INRB only') }
  return set
}

// ---- Lodestar blob (read-only) ----
const env = loadEnv()
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }
const blob = (await (await fetch(`${env.SUPABASE_URL}/rest/v1/workbench?id=eq.main&select=data`, { headers: H })).json())?.[0]?.data
if (!blob?.roster || !blob?.projects) { console.error('Could not read the Lodestar blob — aborting (backfill would be blank).'); process.exit(1) }
const normParcel = (s) => String(s || '').replace(/[^0-9a-z]/gi, '').toLowerCase()
const normAddr = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z ]/g, '').split(/\s+/).slice(0, 3).join(' ')
function lodestarFor(name, parcel) {
  const p = normParcel(parcel)
  let hits = p ? blob.roster.filter((r) => normParcel(r.parcel) === p) : []
  if (hits.length !== 1) hits = blob.roster.filter((r) => normAddr(r.address) === normAddr(name))
  return hits.length === 1 ? blob.projects[hits[0].id] : null
}
/** key → ISO date ('' when unknown) for every step Lodestar has ticked. */
function lodestarDone(ps) {
  const out = {}
  if (!ps) return out
  const add = (bucket) => { for (const [k, v] of Object.entries(bucket || {})) if (v?.done) out[k] = (v.doneAt || '').slice(0, 10) }
  for (const s of Object.values(ps.steps || {})) add(s)
  add(ps.closingSteps)
  if (ps.transferred) out.xfer ??= ''
  return out
}

// ---- active houses ----
const cols = Object.values(COL).map((c) => `"${c}"`).join(',')
const itemFields = `id name column_values(ids:[${cols}]) { id text } subitems { id column_values(ids:["${SUB.key}","${SUB.done}"]) { id text value } }`
const houses = []
for (const g of GROUPS) {
  let cursor = null
  do {
    const q = cursor ? `{ next_items_page(limit:50, cursor:"${cursor}") { cursor items { ${itemFields} } } }`
                     : `{ boards(ids:[${CJL}]) { groups(ids:["${g}"]) { items_page(limit:50) { cursor items { ${itemFields} } } } } }`
    const d = await mondayQuery(q); const p = cursor ? d.next_items_page : d.boards[0].groups[0].items_page
    houses.push(...p.items.map((it) => ({ ...it, group: g }))); cursor = p.cursor
  } while (cursor)
}
console.log('active houses:', houses.length)

// ---- plan ----
const muts = []
let creates = 0, ticks = 0, matched = 0
for (const h of houses) {
  const cv = Object.fromEntries(h.column_values.map((c) => [c.id, c.text ?? '']))
  const prof = profile(cv)
  const steps = t.filter((r) => !r.applies.length || r.applies.some((a) => prof.has(a)))
  const ps = lodestarFor(h.name, cv[COL.parcel]); if (ps) matched++
  const done = lodestarDone(ps) // key → date
  const mark = (k) => { if (!(k in done)) done[k] = '' }
  if (cv[COL.permit].trim()) APPLICATION.forEach(mark)
  if (/issued|c\.o\./i.test(cv[COL.permitStatus]) || cv[COL.permitIssued] || 'issued' in done) steps.filter((s) => s.stage === 'Permit' && s.key !== 'noc').forEach((s) => mark(s.key))
  if (PAST_ROUGH.some((k) => k in done)) mark('noc')
  // Building has started (Active group) on an issued permit ⇒ the NOC was recorded.
  if (h.group === ACTIVE && 'issued' in done) mark('noc')
  // within-stage inference: anything above a done step (same stage) is done too
  for (const stage of new Set(steps.map((s) => s.stage))) {
    const ss = steps.filter((s) => s.stage === stage)
    const last = ss.map((s) => s.key in done).lastIndexOf(true)
    ss.slice(0, Math.max(last, 0)).forEach((s) => { if (!PROTECTED.has(s.key)) mark(s.key) })
  }

  const have = new Map() // key → { id, done }
  for (const s of h.subitems || []) {
    const sv = Object.fromEntries(s.column_values.map((c) => [c.id, c]))
    const key = (sv[SUB.key]?.text || '').trim(); if (!key) continue
    let isDone = false; try { const c = JSON.parse(sv[SUB.done]?.value || '{}').checked; isDone = c === true || c === 'true' } catch {}
    have.set(key, { id: s.id, done: isDone })
  }
  const doneVals = (k) => ({ [SUB.done]: { checked: 'true' }, ...(done[k] ? { [SUB.doneOn]: { date: done[k] } } : {}) })
  let c = 0, u = 0
  for (const r of steps) {
    const ex = have.get(r.key)
    if (!ex) {
      const vals = { [SUB.key]: r.key, [SUB.order]: String(r.order), ...(r.stage ? { [SUB.stage]: { label: r.stage } } : {}), ...(r.key in done ? doneVals(r.key) : {}) }
      muts.push(`create_subitem(parent_item_id:${h.id}, item_name:${JSON.stringify(r.label)}, column_values:${JSON.stringify(JSON.stringify(vals))}) { id }`); c++
    } else if (!ex.done && r.key in done) {
      muts.push(`change_multiple_column_values(board_id:${SUB_BOARD}, item_id:${ex.id}, column_values:${JSON.stringify(JSON.stringify(doneVals(r.key)))}) { id }`); u++
    }
  }
  creates += c; ticks += u
  const next = steps.find((s) => !(s.key in done) && s.stage !== 'Closing')
  if (c || u) console.log(`${h.name}${ps ? '' : ' (no Lodestar match)'}: +${c} steps, tick ${u} → next: ${next ? next.label.slice(0, 60) : '(closing only)'}`)
}
console.log({ houses: houses.length, lodestarMatched: matched, creates, ticks, apiCalls: Math.ceil(muts.length / 10), mode: dry ? 'DRY RUN (add --write)' : 'WRITE' })
if (dry) process.exit(0)
// 10 per call (20 timed out at Monday's gateway). No in-place retry on
// purpose: a timed-out call may still have gone through, so retrying it could
// double-create. On any error just RE-RUN the script — it re-plans from what's
// actually on the board, so nothing is ever created twice.
const SIZE = 10
for (let i = 0; i < muts.length; i += SIZE) {
  const batch = muts.slice(i, i + SIZE).map((m, j) => `m${j}: ${m}`).join('\n')
  try { await mondayQuery(`mutation { ${batch} }`) } catch (e) {
    console.error(`stopped at batch ${i / SIZE + 1} — re-run the script to continue:`, String(e).slice(0, 200)); process.exit(1)
  }
  if ((i / SIZE) % 20 === 0) console.log(`batch ${i / SIZE + 1}/${Math.ceil(muts.length / SIZE)}`)
}
console.log('done — created', creates, 'ticked', ticks)
