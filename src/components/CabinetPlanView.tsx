/**
 * CabinetPlanView.tsx — the top-down plan the cabinet INSTALLER gets.
 *
 * Assembles a layout's runs into a bird's-eye drawing: wall runs draw along
 * their `side` of the room (top/left/right/bottom, owner-set per run, walls
 * meeting at the top-left corner like a standard L), island rows float
 * side-by-side in the open floor. Two sheets render when both exist:
 * BASE + ISLAND on one, UPPERS on the other — same convention as a kitchen
 * shop drawing.
 *
 * Deliberate choices:
 *  - The drawing is "paper": fixed light colors on a white sheet, identical
 *    on screen, in dark mode, and out of the printer. Colors mirror the
 *    editor strips (blue boxes / ochre corners / dashed appliances).
 *  - Geometry is TO SCALE off the run data (widths, depths, wall lengths).
 *    The island's distance from the walls is schematic — the installer
 *    locates it from the floor plan, so the aisle carries no dimension.
 *  - 🖨 Print builds a standalone sheet: plans + per-run tape-measure
 *    positions + the BOM + layout notes. Everything is inlined (SVG markup,
 *    styles) so the about:blank window needs no app assets.
 */
import { useRef } from 'react'
import type { CabinetLayout, CabinetRun, CabinetSegment } from '../types'
import { effDepth, fmtIn, inferSide, layoutBom, positionsLine, runFit } from '../lib/cabinets'

/* Paper palette — literal values on purpose (see header). */
const INK = '#2a2723'
const C = {
  cab: { fill: '#d8e6f2', stroke: '#2d5d8a', text: '#1d4568' },
  sink: { fill: '#c4d9ec', stroke: '#2d5d8a', text: '#1d4568' },
  corner: { fill: '#fff4e5', stroke: '#d9920a', text: '#8a5a00' },
  appl: { fill: '#ffffff', stroke: '#8a8378', text: '#6f685c' },
  open: { fill: 'none', stroke: '#8a8378', text: '#6f685c' },
  fill: { fill: '#eef3f8', stroke: '#2d5d8a', text: '#1d4568' },
} as const

const WT = 9 // wall band thickness, px
const PAD = 54 // sheet margin, px
const AISLE = 40 // schematic island offset from walls, inches

type Side = NonNullable<CabinetRun['side']>

interface PlacedSeg {
  x: number
  y: number
  w: number
  h: number
  it: CabinetSegment
  vertical: boolean
}
interface PlacedRun {
  run: CabinetRun
  segs: PlacedSeg[]
  label: { x: number; y: number; rot: boolean; text: string; over: boolean }
}

/** Everything one sheet needs, in px (already scaled). */
function buildSheet(runs: CabinetRun[], withIsland: CabinetRun[]) {
  // Walls present on this sheet, with the longest run per side sizing the room.
  let wallIdx = 0
  const bySide = new Map<Side, CabinetRun[]>()
  for (const r of runs) {
    const side = inferSide(r, wallIdx)
    if (side !== 'island') wallIdx++
    const list = bySide.get(side) ?? []
    list.push(r)
    bySide.set(side, list)
  }
  const islands = [...(bySide.get('island') ?? []), ...withIsland]
  bySide.delete('island')

  const lenOf = (s: Side) => Math.max(0, ...(bySide.get(s) ?? []).map((r) => r.length))
  const depthOf = (s: Side) => Math.max(0, ...(bySide.get(s) ?? []).map(effDepth))
  const islW = islands.reduce((a, r) => a + effDepth(r), 0)
  const islL = Math.max(0, ...islands.map((r) => r.length))

  // Room extents in inches (interior).
  const xIn = Math.max(lenOf('top'), lenOf('bottom'), depthOf('left') + AISLE + islW + 20, 60)
  const yIn = Math.max(lenOf('left'), lenOf('right'), depthOf('top') + AISLE + islL + 20, 60)
  const k = Math.min(660 / xIn, 730 / yIn, 4.2)

  const placed: PlacedRun[] = []
  const place = (r: CabinetRun, side: Side) => {
    const d = effDepth(r) * k
    const segs: PlacedSeg[] = []
    let at = 0
    for (const it of r.items) {
      const w = (Number(it.width) || 0) * k
      if (side === 'top') segs.push({ x: at, y: 0, w, h: d, it, vertical: false })
      else if (side === 'bottom') segs.push({ x: at, y: yIn * k - d, w, h: d, it, vertical: false })
      else if (side === 'left') segs.push({ x: 0, y: at, w: d, h: w, it, vertical: true })
      else segs.push({ x: xIn * k - d, y: at, w: d, h: w, it, vertical: true })
      at += w
    }
    const over = runFit(r).status === 'over'
    const text = `${r.name} · ${fmtIn(r.length)}${over ? '  ⚠ OVER' : ''}`
    const label =
      side === 'top'
        ? { x: (r.length * k) / 2, y: -WT - 8, rot: false, text, over }
        : side === 'bottom'
          ? { x: (r.length * k) / 2, y: yIn * k + WT + 16, rot: false, text, over }
          : side === 'left'
            ? { x: -WT - 8, y: (r.length * k) / 2, rot: true, text, over }
            : { x: xIn * k + WT + 14, y: (r.length * k) / 2, rot: true, text, over }
    placed.push({ run: r, segs, label })
  }
  for (const [side, list] of bySide) for (const r of list) place(r, side)

  // Island block: rows side-by-side in run order, schematic position.
  const ix0 = (depthOf('left') + AISLE) * k
  const iy0 = (depthOf('top') + AISLE) * k
  let ix = ix0
  for (const r of islands) {
    const d = effDepth(r) * k
    const segs: PlacedSeg[] = []
    let at = 0
    for (const it of r.items) {
      const w = (Number(it.width) || 0) * k
      segs.push({ x: ix, y: iy0 + at, w: d, h: w, it, vertical: true })
      at += w
    }
    const over = runFit(r).status === 'over'
    placed.push({
      run: r,
      segs,
      label: {
        x: ix + d / 2,
        y: iy0 + r.length * k + 16,
        rot: false,
        text: `${fmtIn(r.length)}${over ? ' ⚠' : ''}`,
        over,
      },
    })
    ix += d
  }
  const islandCaption =
    islands.length > 0 ? { x: ix0 + (ix - ix0) / 2, y: iy0 - 10, names: 'ISLAND' } : null

  const walls = [...bySide.keys()].map((side) =>
    side === 'top'
      ? { x: -WT, y: -WT, w: xIn * k + 2 * WT, h: WT }
      : side === 'bottom'
        ? { x: -WT, y: yIn * k, w: xIn * k + 2 * WT, h: WT }
        : side === 'left'
          ? { x: -WT, y: -WT, w: WT, h: yIn * k + 2 * WT }
          : { x: xIn * k, y: -WT, w: WT, h: yIn * k + 2 * WT },
  )
  return { w: xIn * k + 2 * PAD, h: yIn * k + 2 * PAD, walls, placed, islandCaption }
}

function Sheet({ title, runs, islands }: { title: string; runs: CabinetRun[]; islands: CabinetRun[] }) {
  const g = buildSheet(runs, islands)
  return (
    <div className="cab-plan-sheet">
      <div className="cab-plan-title">{title}</div>
      <svg
        className="cab-plan-svg"
        viewBox={`0 0 ${g.w} ${g.h}`}
        role="img"
        aria-label={`${title} — top-down cabinet plan`}
      >
        <rect x="0" y="0" width={g.w} height={g.h} fill="#ffffff" />
        <g transform={`translate(${PAD} ${PAD})`}>
          {g.walls.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={INK} />
          ))}
          {g.placed.map(({ run, segs, label }) => (
            <g key={run.id}>
              {segs.map(({ x, y, w, h, it, vertical }) => {
                const c = C[it.kind]
                const dashed = it.kind === 'appl' || it.kind === 'open'
                // Full "SKU · w″" needs ~60px along the run; short segments get
                // the SKU alone; slivers (fillers) stay blank — the positions
                // readout and tooltips still carry them.
                const along = vertical ? h : w
                const label =
                  along > 62 && Math.min(w, h) > 16
                    ? `${it.sku} · ${fmtIn(Number(it.width) || 0)}`
                    : along > 26 && Math.min(w, h) > 14
                      ? it.sku
                      : null
                return (
                  <g key={it.id}>
                    <rect
                      x={x}
                      y={y}
                      width={Math.max(w, 1)}
                      height={Math.max(h, 1)}
                      fill={it.kind === 'fill' ? 'url(#cabhatch)' : c.fill}
                      stroke={c.stroke}
                      strokeWidth={1.3}
                      strokeDasharray={dashed ? '5 3' : undefined}
                    />
                    {label && (
                      <text
                        x={x + w / 2}
                        y={y + h / 2}
                        fill={c.text}
                        fontSize={10.5}
                        fontFamily="ui-monospace, Menlo, monospace"
                        fontWeight={700}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={vertical ? `rotate(-90 ${x + w / 2} ${y + h / 2})` : undefined}
                      >
                        {label}
                      </text>
                    )}
                  </g>
                )
              })}
              <text
                x={label.x}
                y={label.y}
                fill={label.over ? '#c0492f' : '#2d5d8a'}
                fontSize={11.5}
                fontFamily="ui-monospace, Menlo, monospace"
                fontWeight={700}
                textAnchor="middle"
                transform={label.rot ? `rotate(-90 ${label.x} ${label.y})` : undefined}
              >
                {label.text}
              </text>
            </g>
          ))}
          {g.islandCaption && (
            <text
              x={g.islandCaption.x}
              y={g.islandCaption.y}
              fill="#6f685c"
              fontSize={10.5}
              fontFamily="ui-monospace, Menlo, monospace"
              textAnchor="middle"
            >
              {g.islandCaption.names} · position per floor plan
            </text>
          )}
        </g>
        <defs>
          <pattern id="cabhatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#eef3f8" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#2d5d8a" strokeWidth="1.6" />
          </pattern>
        </defs>
      </svg>
    </div>
  )
}

interface Props {
  layout: CabinetLayout
  /** Header line for the printed sheet, e.g. "Model Independence". */
  printTitle: string
}

function CabinetPlanView({ layout, printTitle }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)

  const uppers = layout.runs.filter((r) => /upper/i.test(r.group))
  const islands = layout.runs.filter((r, i) => inferSide(r, i) === 'island')
  const baseWalls = layout.runs.filter((r) => !uppers.includes(r) && !islands.includes(r))
  if (layout.runs.length === 0) return null

  /** The installer sheet: plans + tape-measure positions + BOM + notes. */
  const print = () => {
    const svgs = [...(wrapRef.current?.querySelectorAll('svg.cab-plan-svg') ?? [])]
    const titles = [...(wrapRef.current?.querySelectorAll('.cab-plan-title') ?? [])]
    const plansHtml = svgs
      .map((s, i) => `<h2>${titles[i]?.textContent ?? ''}</h2>${s.outerHTML}`)
      .join('')
    const positions = layout.runs
      .map((r) => `<p><b>${r.name} — ${fmtIn(r.length)}</b><br><code>${positionsLine(r)}</code></p>`)
      .join('')
    const bom = layoutBom(layout)
      .map((l) => `<tr><td><code>${l.sku}</code></td><td>×${l.qty}</td><td>${l.runs.join(', ')}</td></tr>`)
      .join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${printTitle} — ${layout.name} — cabinet plan</title>
<style>
  body{font:14px/1.5 -apple-system,'Segoe UI',sans-serif;color:#2a2723;margin:28px;max-width:900px}
  h1{font-size:20px;margin:0} .sub{color:#6f685c;margin:2px 0 18px}
  h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#6f685c;margin:22px 0 6px}
  svg{width:100%;height:auto;border:1px solid #ddd;border-radius:6px}
  code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px}
  table{border-collapse:collapse}td{padding:3px 16px 3px 0;border-bottom:1px solid #eee}
  p{margin:6px 0}.notes{white-space:pre-wrap;background:#faf8f4;border:1px solid #e3ded6;border-radius:6px;padding:10px 12px}
  @media print{svg{break-inside:avoid}}
</style></head><body>
<h1>${printTitle} — ${layout.name}</h1>
<p class="sub">FGT cabinet plan · Iron Shield Construction · printed ${new Date().toLocaleDateString()}</p>
${plansHtml}
<h2>Positions (from each run's left/top end)</h2>${positions}
<h2>Bill of materials</h2><table>${bom}</table>
${layout.notes ? `<h2>Notes</h2><div class="notes">${layout.notes}</div>` : ''}
<script>window.onload=()=>window.print()</script>
</body></html>`)
    w.document.close()
  }

  return (
    <div ref={wrapRef} className="cab-plan">
      <div className="cab-plan-bar">
        <span className="tpl-preview-h">Top-down plan</span>
        <button className="mini" onClick={print}>
          🖨 Print for installer
        </button>
      </div>
      <div className="cab-plan-sheets">
        {(baseWalls.length > 0 || islands.length > 0) && (
          <Sheet title={uppers.length ? 'Base cabinets + island' : 'Plan'} runs={baseWalls} islands={islands} />
        )}
        {uppers.length > 0 && <Sheet title="Upper cabinets" runs={uppers} islands={[]} />}
      </div>
    </div>
  )
}

export default CabinetPlanView
