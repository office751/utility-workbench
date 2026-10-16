// Monday.com API helper for the scanner scripts (Sep 2026).
// Reads MONDAY_API_TOKEN from scanner/.env (key match is case-insensitive,
// because the line was hand-typed) and exposes mondayQuery() plus the small
// set of board/column ids + helpers the Mac-side jobs share (Oct 2026: Monday
// is the system of record, so Scan Josh and the permit scanner write here).
// Never logs the token.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export function loadEnv() {
  const out = {}
  for (const line of readFileSync(join(here, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) out[m[1].toUpperCase()] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

export function mondayToken() {
  const t = loadEnv().MONDAY_API_TOKEN
  if (!t) throw new Error('MONDAY_API_TOKEN missing from scanner/.env')
  return t
}

/** Run one GraphQL query against api.monday.com. Throws on GraphQL errors. */
export async function mondayQuery(query, variables = {}) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: mondayToken(),
      'API-Version': '2025-01',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error('Monday API: ' + JSON.stringify(json.errors))
  return json.data
}

// ---- boards + columns (Properties workspace) --------------------------------
// Ids were created in the UI / seed scripts in Sep 2026. If a board is ever
// rebuilt, re-derive these from `boards { columns { id title } }` — titles are
// what a human sees, ids are what the API wants.
export const CJL_BOARD_ID = 18429393869 // Construction Job List — one row per house
export const REGISTER_BOARD_ID = 18429392799 // Property Register
export const ORDERS_BOARD_ID = 18430202808 // one row per material order, linked to its house
export const INSPECTIONS_BOARD_ID = 18430202819 // county inspection results + permit holds
export const VENDORS_BOARD_ID = 18430202825

/** Construction Job List columns the scanner jobs read or write. */
export const CJL = {
  parcel: 'text_mm6ts07h',
  permit: 'text_mm6tm77m',
  permitStatus: 'color_mm6tnewf',
  subdivision: 'text_mm6t5yrb',
  electricStage: 'text_mm6tr20j',
  notes: 'text_mm6tv3k1',
  groups: { prePermitting: 'group_mm70nwy1', permitting: 'topics', active: 'group_mm70ah30', completed: 'group_mm70nbzb', dead: 'group_mm7043rk' },
}

export const ORDERS = {
  group: 'topics', // "Open orders"
  status: 'color_mm701zqk', // To order / Ordered / Delivered / Installed
  orderedOn: 'date_mm70rkdh',
  neededBy: 'date_mm70n9f6',
  leadTime: 'numeric_mm70gahn',
  note: 'text_mm7040ca',
  lodestarId: 'text_mm70fkeq', // any stable id — Scan Josh uses "josh:<message guid>"
  property: 'board_relation_mm70370j',
  vendor: 'board_relation_mm70hdtx',
}

export const INSPECTIONS = {
  group: 'topics', // "Results"
  result: 'color_mm70jfrg', // Failed / Partial / Passed / Other (+ Hold, added by scan.mjs)
  date: 'date_mm70hvr8',
  sourceKey: 'text_mm70rtbj', // the scanner's stable key, e.g. portal:<permit>:rej:<desc>
  dismissed: 'boolean_mm70z1f6',
  property: 'board_relation_mm70800f',
}

export const VENDORS = {
  orderCategories: 'text_mm70z513', // comma list, e.g. "Trusses, Framing package"
}

// ---- helpers -----------------------------------------------------------------
/** Permit numbers compare without the "(SFR)"/"(ADU)" suffix or spaces. */
export const normPermit = (s) => String(s ?? '').replace(/\(.*?\)/g, '').replace(/\s+/g, '').toUpperCase()

/**
 * Every house on the Construction Job List, flattened to the fields the jobs
 * match on. One API call. `cv` keeps every column's text in case a caller
 * needs more.
 */
export async function loadHouses() {
  const d = await mondayQuery(`query { boards(ids:[${CJL_BOARD_ID}]) { items_page(limit:500) { items {
    id name group { id title } column_values { id text } } } } }`)
  return d.boards[0].items_page.items.map((it) => {
    const cv = Object.fromEntries(it.column_values.map((c) => [c.id, (c.text ?? '').trim()]))
    return {
      id: it.id,
      address: it.name.replace(/\s+/g, ' ').trim(),
      group: it.group.title,
      groupId: it.group.id,
      parcel: cv[CJL.parcel] || '',
      permit: cv[CJL.permit] || '',
      subdivision: cv[CJL.subdivision] || '',
      cv,
    }
  })
}

/** Every item on a board with the given columns' text — paginated, so boards
 *  past 500 rows still come back whole. */
export async function loadBoardItems(boardId, columnIds) {
  const cols = JSON.stringify(columnIds)
  const items = []
  let cursor = null
  do {
    const page = cursor
      ? `next_items_page(limit:500, cursor:"${cursor}")`
      : `boards(ids:[${boardId}]) { items_page(limit:500)`
    // Connect-boards columns read back text=null/value=null; the linked ids
    // only come through the BoardRelationValue fragment → cv["<col>:ids"].
    const fields = `id name column_values(ids:${cols}) { id text ... on BoardRelationValue { linked_item_ids } }`
    const q = cursor
      ? `query { ${page} { cursor items { ${fields} } } }`
      : `query { ${page} { cursor items { ${fields} } } } }`
    const d = await mondayQuery(q)
    const pg = cursor ? d.next_items_page : d.boards[0].items_page
    for (const it of pg.items) {
      const cv = {}
      for (const c of it.column_values) {
        cv[c.id] = (c.text ?? '').trim()
        if (c.linked_item_ids) cv[c.id + ':ids'] = c.linked_item_ids.map(String)
      }
      items.push({ id: it.id, name: it.name, cv })
    }
    cursor = pg.cursor
  } while (cursor)
  return items
}

export async function createItem(boardId, groupId, name, columnValues) {
  const d = await mondayQuery(
    `mutation ($b: ID!, $g: String!, $n: String!, $v: JSON!) { create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$v, create_labels_if_missing:true) { id } }`,
    { b: String(boardId), g: groupId, n: name.slice(0, 255), v: JSON.stringify(columnValues) },
  )
  return d.create_item.id
}

export async function setColumns(boardId, itemId, columnValues) {
  await mondayQuery(
    `mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id:$b, item_id:$i, column_values:$v, create_labels_if_missing:true) { id } }`,
    { b: String(boardId), i: String(itemId), v: JSON.stringify(columnValues) },
  )
}

export async function deleteItem(itemId) {
  await mondayQuery(`mutation { delete_item(item_id:${itemId}) { id } }`)
}

/** Post a comment ("update") on an item — shows in the item's Updates tab and
 *  the inbox of everyone following it. */
export async function createUpdate(itemId, body) {
  const d = await mondayQuery(`mutation ($i: ID!, $b: String!) { create_update(item_id:$i, body:$b) { id } }`, { i: String(itemId), b: body })
  return d.create_update.id
}

/** Bodies of the latest updates on each item, keyed by item id — used to
 *  de-dupe before posting (a marker like "[josh:<guid>]" inside the body). */
export async function loadUpdates(itemIds, limit = 100) {
  const out = {}
  const ids = [...new Set(itemIds.map(String))]
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25)
    const d = await mondayQuery(`query { items(ids:[${chunk.join(',')}]) { id updates(limit:${limit}) { id body text_body } } }`)
    for (const it of d.items) out[it.id] = it.updates.map((u) => u.text_body || u.body || '')
  }
  return out
}
