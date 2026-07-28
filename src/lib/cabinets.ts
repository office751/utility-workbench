/**
 * cabinets.ts — the fit math for FGT cabinet layouts (📐 Models tab).
 *
 * A layout is a set of RUNS (a wall, or an island row); each run has a wall
 * LENGTH and an ordered list of SEGMENTS (cabinets, appliance openings,
 * fillers). The one job of this module: tell the truth about whether the
 * boxes physically fit the wall, and roll the cabinets up into a BOM.
 *
 * Born from a real ordering near-miss (July 2026, Surf Blvd kitchen): a
 * hand-tallied range wall left only 35½″ for a 36″ refrigerator and the
 * error survived two revisions. Sum-vs-length is checked here, in one
 * place, with tests — never re-tallied by hand in a component.
 *
 * Rules (see docs/BRAINS.md → cabinets.ts):
 *  - Fit tolerance is ±1/100″: floating-point dust never flags a run.
 *  - OVER is the emergency (boxes can't compress); UNDER is informational
 *    (open wall — might be deliberate, might be a forgotten filler).
 *  - The BOM counts kinds cab/sink/corner only, and skips `count === false`
 *    (a corner unit appears in BOTH runs it touches but is ONE cabinet —
 *    exactly one appearance should carry count).
 *  - skuWidth: an FGT code's first two digits are its width in inches
 *    (B21→21, W3042→30, W362424→36, LS33→33, B09→9). Non-cabinet labels
 *    (RANGE, FRIDGE) have no digits → null, caller keeps the typed width.
 */
import type { CabinetLayout, CabinetRun, CabinetSegment } from '../types'

/** Kinds that represent a real cabinet box (BOM-countable). */
const BOX_KINDS = new Set<CabinetSegment['kind']>(['cab', 'sink', 'corner'])

/** Width encoded in an FGT SKU (first two digits), or null if none. */
export function skuWidth(sku: string): number | null {
  const m = String(sku ?? '')
    .toUpperCase()
    .match(/(\d{2,})/)
  if (!m) return null
  const w = parseInt(m[1].slice(0, 2), 10)
  return w > 0 ? w : null
}

export interface RunFit {
  /** Total inches of all segments. */
  sum: number
  /** sum − length: negative = open wall remains, positive = doesn't fit. */
  diff: number
  status: 'fit' | 'under' | 'over'
}

/** Does this run's cabinetry fit its wall? (±0.01″ tolerance = "exact".) */
export function runFit(run: CabinetRun): RunFit {
  const sum = run.items.reduce((a, it) => a + (Number(it.width) || 0), 0)
  const diff = +(sum - (Number(run.length) || 0)).toFixed(3)
  const status = Math.abs(diff) < 0.01 ? 'fit' : diff > 0 ? 'over' : 'under'
  return { sum: +sum.toFixed(3), diff, status }
}

export interface BomLine {
  sku: string
  qty: number
  /** Names of the runs this SKU appears in (deduped, layout order). */
  runs: string[]
}

/**
 * Roll a layout up into an order list: cabinet boxes only, corner units'
 * `count:false` twins skipped, grouped by (uppercased, trimmed) SKU,
 * alphabetical. Appliances, openings and fillers never appear.
 */
export function layoutBom(layout: CabinetLayout): BomLine[] {
  const map = new Map<string, { qty: number; runs: string[] }>()
  for (const run of layout.runs) {
    for (const it of run.items) {
      if (!BOX_KINDS.has(it.kind)) continue
      if (it.count === false) continue
      const sku = it.sku.trim().toUpperCase()
      if (!sku) continue
      let e = map.get(sku)
      if (!e) map.set(sku, (e = { qty: 0, runs: [] }))
      e.qty++
      if (!e.runs.includes(run.name)) e.runs.push(run.name)
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sku, e]) => ({ sku, qty: e.qty, runs: e.runs }))
}

/** Total BOM-counted cabinets in a layout. */
export function layoutCount(layout: CabinetLayout): number {
  return layoutBom(layout).reduce((a, l) => a + l.qty, 0)
}

/**
 * What a corner unit actually looks like from above, by FGT code family:
 * WDC* = wall diagonal corner (pentagon with a 45° door face), LS* = lazy
 * susan (L-shaped pie-cut, turntables + bi-fold), everything else (BBC
 * blind corners, unknown codes) = plain rectangle — a blind corner IS a
 * rectangle in plan. Drawing-only; never affects fit math or the BOM.
 */
export function cornerShape(sku: string): 'diag' | 'lazy' | 'rect' {
  const s = String(sku ?? '')
    .toUpperCase()
    .trim()
  if (s.startsWith('WDC')) return 'diag'
  if (s.startsWith('LS')) return 'lazy'
  return 'rect'
}

/**
 * Tape-measure positions readout for a run: "LS33 0–33 · B09 33–42 · …".
 * The installer's cut sheet — every segment's start–end along the wall.
 */
export function positionsLine(run: CabinetRun): string {
  let at = 0
  return run.items
    .map((it) => {
      const a = at
      at = +(at + (Number(it.width) || 0)).toFixed(3)
      return `${it.sku} ${fmtIn(a).replace('″', '')}–${fmtIn(at).replace('″', '')}`
    })
    .join(' · ')
}

/**
 * Effective cabinet depth for the plan view: the run's own depth wins;
 * otherwise UPPER runs are 12″ (wall cabinets) and everything else 24″
 * (base cabinets). Drawing-only — never affects fit math.
 */
export function effDepth(run: CabinetRun): number {
  if (Number(run.depth) > 0) return Number(run.depth)
  return /upper/i.test(run.group) ? 12 : 24
}

/**
 * Which wall a run draws on when the owner hasn't said: ISLAND-group runs
 * float ('island'); otherwise the FIRST wall run of the layout takes the
 * top wall and the SECOND takes the left (the standard L), further walls
 * default 'top' again — at that point the owner should set sides by hand.
 * `wallIndex` = this run's position counting only non-island runs.
 */
export function inferSide(run: CabinetRun, wallIndex: number): NonNullable<CabinetRun['side']> {
  if (run.side) return run.side
  if (/island/i.test(run.group)) return 'island'
  return wallIndex === 1 ? 'left' : 'top'
}

const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞']

/**
 * Display inches the way a tape measure reads: 38.5 → 38½″, 2.5 → 2½″,
 * 9 → 9″. Rounds to the nearest ⅛″ for DISPLAY ONLY — stored widths keep
 * their exact decimals.
 */
export function fmtIn(w: number): string {
  if (!Number.isFinite(w)) return '?'
  const neg = w < 0 ? '−' : ''
  const abs = Math.abs(w)
  let whole = Math.floor(abs)
  let e = Math.round((abs - whole) * 8)
  if (e === 8) {
    whole += 1
    e = 0
  }
  const frac = EIGHTHS[e]
  return `${neg}${whole || !frac ? whole : ''}${frac}″`
}
