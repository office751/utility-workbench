/**
 * orders.ts (lib) — pure logic for material orders, no UI.
 *
 * The star here is parseQuickAdd: it turns a free-text capture (a pasted
 * message from Josh, or shorthand you typed) into "which project + which
 * items," so adding an order is faster than placing it.
 */
import type { OrderItem, Project, ProjectState } from '../types'
import { CATEGORY_KEYWORDS } from '../data/orders'

/** A project's orders (never undefined). */
export function ordersOf(ps: ProjectState): OrderItem[] {
  return ps.orders ?? []
}

/** How many orders are still "to order" (the action count). */
export function toOrderCount(ps: ProjectState): number {
  return ordersOf(ps).filter((o) => o.status === 'toOrder').length
}

/** A one-line summary for the sidebar/row, e.g. "2 to order" / "all set". */
export function ordersSummary(ps: ProjectState): string {
  const orders = ordersOf(ps)
  if (orders.length === 0) return 'no orders yet'
  const toOrder = toOrderCount(ps)
  if (toOrder > 0) return `${toOrder} to order`
  const installed = orders.filter((o) => o.status === 'installed').length
  if (installed === orders.length) return 'all installed ✓'
  return 'all ordered'
}

/** Materials "needs action" = something still needs ordering. */
export function materialsNeedsAction(ps: ProjectState): boolean {
  return toOrderCount(ps) > 0
}

/** Done = there are orders and every one is installed. */
export function isMaterialsDone(ps: ProjectState): boolean {
  const orders = ordersOf(ps)
  return orders.length > 0 && orders.every((o) => o.status === 'installed')
}

/* ---------------- Quick-Add parsing ---------------- */

// Words in addresses/subdivisions that don't help identify a project.
const STOPWORDS = new Set([
  'sw', 'se', 'ne', 'nw', 'n', 's', 'e', 'w', 'st', 'rd', 'dr', 'ave', 'blvd',
  'ln', 'ct', 'ter', 'pl', 'cir', 'run', 'pass', 'way', 'loop', 'unit', 'sec',
  'model', 'the', 'of', 'fl', 'tbd', 'estates', 'park', 'subdivision',
])

/** Split text into lowercase word/number tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** The identifying tokens for a project (house number + street/subdivision words). */
function projectTokens(p: Project): string[] {
  return tokenize(`${p.address} ${p.subdivision}`).filter(
    (t) => t.length >= 2 && !STOPWORDS.has(t),
  )
}

export interface QuickAddParse {
  /** Project candidates, best match first (only those with a score > 0). */
  matches: Project[]
  /** Whether the top match clearly beats the rest (safe to auto-pick). */
  confident: boolean
  /** Categories detected in the text. */
  categories: string[]
}

/**
 * Parse a capture string against the roster.
 *  - project: score each project by how many of its identifying tokens appear
 *    in the text; numbers (house #) count double — they're very distinctive.
 *  - categories: any CATEGORY_KEYWORDS substring present in the text.
 */
export function parseQuickAdd(text: string, projects: Project[]): QuickAddParse {
  const lower = text.toLowerCase()
  const textTokens = new Set(tokenize(text))

  // categories: keyword substring match (so "trusses" hits "truss")
  const categories = [
    ...new Set(
      Object.entries(CATEGORY_KEYWORDS)
        .filter(([kw]) => lower.includes(kw))
        .map(([, cat]) => cat),
    ),
  ]

  // score projects
  const scored = projects
    .map((p) => {
      let score = 0
      for (const tok of projectTokens(p)) {
        if (textTokens.has(tok)) score += /^\d+$/.test(tok) ? 2 : 1
      }
      return { p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  const matches = scored.map((x) => x.p)
  // "confident" = exactly one match, or the top score strictly beats #2
  const confident =
    scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)

  return { matches, confident, categories }
}
