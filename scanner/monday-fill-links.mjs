// Step 1 (Sep 2026): fill the four Link columns on the Construction Job List.
// County Map from Parcel ID; Permit Portal / Project Docs from the board's text
// column, else Lodestar's per-permit maps (src/data/sharepoint.ts), else the
// project's typed override; Stop Electric Service by Electric Co. Idempotent.
import { readFileSync } from 'node:fs'
import { mondayQuery, CJL_BOARD_ID } from './monday.mjs'
const S = process.argv[2]
const items = JSON.parse(readFileSync(`${S}/monday-items.json`, 'utf8'))
const blob = JSON.parse(readFileSync(`${S}/blob-slice.json`, 'utf8'))
const created = JSON.parse(readFileSync(`${S}/monday-created.json`, 'utf8'))
const sp = readFileSync(new URL('../src/data/sharepoint.ts', import.meta.url), 'utf8')
const parseMap = (name) => { const m = sp.match(new RegExp(`export const ${name}[^{]*\\{([\\s\\S]*?)\\n\\}`)); const o = {}; for (const l of (m?.[1]||'').matchAll(/"([^"]+)":\s*"([^"]+)"/g)) o[l[1]] = l[2]; return o }
const PORTALS = parseMap('PERMIT_PORTALS'), FOLDERS = parseMap('PROJECT_FOLDERS')
const VIEWER = 'https://experience.arcgis.com/experience/fdebe26ee2fb40758e399cc5447c5809/page/2D-Parcel-Viewer'
const mapUrl = (parcel) => { const pid = parcel.trim(); if (!pid) return ''; const sel = `where:widget_28_output_45699390791734507~dataSource_5-192a100c52f-layer-122:PARCEL='${pid}'`; return `${VIEWER}#data_s=${encodeURIComponent(sel)}&zoom_to_selection=true` }
const STOP = { SECO: 'https://secoenergy.com/form/stop-service-form', DUKE: 'https://www.duke-energy.com/my-account/stop-service' }
const byParcel = Object.fromEntries(blob.roster.map(p => [p.parcel.trim(), p]))
const link = (url, text) => url ? { url, text } : null
let n = 0, stats = { map: 0, portal: 0, docs: 0, stop: 0 }
for (const it of items) {
  const proj = byParcel[it.parcel.trim()]; const ps = proj ? blob.projects[proj.id] : null
  const portal = /^http/.test(it.portalText) ? it.portalText : (ps?.permitUrl || PORTALS[it.permit.trim()] || '')
  const docs = /^http/.test(it.docsText) ? it.docsText : (ps?.sharepointUrl || FOLDERS[it.permit.trim()] || '')
  const stop = STOP[it.electric.trim().toUpperCase()] || ''
  const vals = {}
  const m = link(mapUrl(it.parcel), 'County map'); if (m) { vals[created.cols['County Map']] = m; stats.map++ }
  const p = link(portal, it.permit.trim() || 'Permit portal'); if (p) { vals[created.cols['Permit Portal Link']] = p; stats.portal++ }
  const d = link(docs, 'Project folder'); if (d) { vals[created.cols['Project Docs Link']] = d; stats.docs++ }
  const s = link(stop, `Stop ${it.electric.trim()} service`); if (s) { vals[created.cols['Stop Electric Service']] = s; stats.stop++ }
  if (!Object.keys(vals).length) continue
  await mondayQuery(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id:$b, item_id:$i, column_values:$v) { id } }`, { b: String(CJL_BOARD_ID), i: it.id, v: JSON.stringify(vals) })
  n++
}
console.log('updated items', n, JSON.stringify(stats))
