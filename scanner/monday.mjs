// Monday.com API helper for the scanner scripts (Sep 2026).
// Reads MONDAY_API_TOKEN from scanner/.env (key match is case-insensitive,
// because the line was hand-typed) and exposes one function: mondayQuery().
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

export const CJL_BOARD_ID = 18429393869
export const REGISTER_BOARD_ID = 18429392799
