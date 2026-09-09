/**
 * mondayClient.ts — the thin bridge to Monday.com for the Runbook item view.
 *
 * Inside Monday the page runs in an iframe and the SDK signs every API call
 * with the viewing user's session ("seamless auth") — no token in code.
 * For LOCAL testing (npm run dev) there is no iframe, so we fall back to a
 * personal token in .env.local (VITE_MONDAY_TOKEN, git-ignored) and take the
 * item id from the URL: #/monday-runbook?item=12345.
 */
// The package's shipped .ts typings don't compile under our strict tsconfig
// (verbatimModuleSyntax / erasableSyntaxOnly), so tsconfig.app.json maps
// 'monday-sdk-js' to our own tiny typing (monday-sdk.d.ts) for type-checking;
// Vite still bundles the real package.
import mondaySdk from 'monday-sdk-js'

/** The handful of SDK calls we use; the package's own typings lag its API. */
interface MondaySdkLike {
  setToken(token: string): void
  setApiVersion(version: string): void
  get(kind: string, params?: Record<string, unknown>): Promise<unknown>
  api(query: string, options?: { variables?: Record<string, unknown> }): Promise<unknown>
}
export const monday = mondaySdk() as unknown as MondaySdkLike
// Pin the API version: the embedded SDK defaults to an older schema where our
// queries (ID-typed item ids, BoardRelationValue.linked_item_ids) don't validate.
monday.setApiVersion('2025-01')

/** Are we embedded inside Monday (iframe) or opened directly in a tab? */
export function inIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

const devToken = (import.meta.env.VITE_MONDAY_TOKEN as string | undefined) || ''
if (devToken && !inIframe()) monday.setToken(devToken)

/** The item this view is open on: Monday's context in the iframe, ?item= locally. */
export async function getItemId(): Promise<number | null> {
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const fromUrl = q.get('item')
  if (fromUrl) return Number(fromUrl)
  try {
    const res = (await monday.get('context')) as { data?: { itemId?: number } }
    return res?.data?.itemId ?? null
  } catch {
    return null
  }
}

/** Run one GraphQL query/mutation; throws on GraphQL errors so callers can't miss them. */
export async function api<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const r = (await monday.api(query, { variables })) as { data?: T; errors?: { message: string; extensions?: unknown }[]; error_message?: string }
  if (r.error_message) throw new Error(r.error_message)
  if (r.errors?.length) {
    // Monday's daily API budget is account-wide; when it's spent, every call fails
    // until the reset. Say so plainly instead of the generic "validation errors".
    const limit = r.errors.find((e) => /DAILY_LIMIT|RATE_LIMIT|limit exceeded/i.test(e.message + JSON.stringify(e.extensions ?? {})))
    if (limit) {
      const secs = Number((limit.extensions as { retry_in_seconds?: number } | undefined)?.retry_in_seconds ?? 0)
      const when = secs ? ` Try again after ${new Date(Date.now() + secs * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ''
      throw new Error(`Monday's daily API limit for this account is used up for today, so the Runbook can't load or save.${when}`)
    }
    throw new Error(r.errors.map((e) => e.message + (e.extensions ? ' ' + JSON.stringify(e.extensions) : '')).join('; '))
  }
  return r.data as T
}
