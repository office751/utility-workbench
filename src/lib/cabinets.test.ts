/**
 * cabinets.test.ts — the cabinet fit-math brain (lib/cabinets.ts). Rules in
 * docs/BRAINS.md ("cabinets"): ±0.01″ fit tolerance, OVER is the emergency,
 * BOM counts boxes only and skips a corner's count:false twin, skuWidth =
 * first two digits of the FGT code. Seeded against the field-verified
 * Independence kitchen (Surf Blvd rev F3) so the shipped default can never
 * silently drift out of fit.
 */
import { describe, expect, it } from 'vitest'
import type { CabinetLayout, CabinetRun } from '../types'
import { DEFAULT_CABINET_LAYOUTS, cabinetLayoutsFor } from '../data/cabinets'
import {
  cornerShape,
  effDepth,
  fmtIn,
  inferSide,
  layoutBom,
  layoutCount,
  runFit,
  skuWidth,
} from './cabinets'

const run = (length: number, widths: number[]): CabinetRun => ({
  id: 'r',
  group: 'BASE',
  name: 'wall',
  length,
  items: widths.map((w, i) => ({ id: 'i' + i, kind: 'cab', sku: 'B' + w, width: w })),
})

describe('skuWidth', () => {
  it('reads the first two digits of an FGT code', () => {
    expect(skuWidth('B21')).toBe(21)
    expect(skuWidth('W3042')).toBe(30)
    expect(skuWidth('W362424')).toBe(36) // 36w × 24t × 24d over-fridge box
    expect(skuWidth('LS33')).toBe(33)
    expect(skuWidth('WDC2442')).toBe(24)
    expect(skuWidth('B21-TR')).toBe(21)
    expect(skuWidth('B09')).toBe(9)
  })
  it('returns null when there is no width to read (labels, blanks)', () => {
    expect(skuWidth('RANGE')).toBeNull()
    expect(skuWidth('filler')).toBeNull()
    expect(skuWidth('')).toBeNull()
  })
})

describe('runFit', () => {
  it('exact fit within a hundredth of an inch', () => {
    expect(runFit(run(142, [33, 9, 24, 36, 36, 4])).status).toBe('fit')
    expect(runFit(run(96, [33, 33, 30])).status).toBe('fit')
  })
  it('handles half-inch walls (158½) without float dust', () => {
    const f = runFit(run(158.5, [33, 21, 30, 36, 38.5]))
    expect(f.status).toBe('fit')
    expect(f.diff).toBe(0)
  })
  it('flags OVER when boxes exceed the wall — the rev-E fridge bug', () => {
    // 33+24+30+36+36 = 159 on a 158.5 wall: does not fit.
    const f = runFit(run(158.5, [33, 24, 30, 36, 36]))
    expect(f.status).toBe('over')
    expect(f.diff).toBe(0.5)
  })
  it('reports UNDER with the open inches', () => {
    const f = runFit(run(120, [36, 36]))
    expect(f.status).toBe('under')
    expect(f.diff).toBe(-48)
  })
  it('treats a garbage width as 0, never NaN', () => {
    const r = run(36, [36])
    r.items[0].width = Number('oops')
    expect(runFit(r).sum).toBe(0)
    expect(runFit(r).status).toBe('under')
  })
})

describe('layoutBom', () => {
  const L: CabinetLayout = {
    id: 'l',
    name: 'Kitchen',
    runs: [
      {
        id: 'a',
        group: 'BASE',
        name: 'Wall A',
        length: 60,
        items: [
          { id: '1', kind: 'corner', sku: 'LS33', width: 33 },
          { id: '2', kind: 'appl', sku: 'RANGE', width: 30 },
          { id: '3', kind: 'cab', sku: 'b21', width: 21 },
        ],
      },
      {
        id: 'b',
        group: 'BASE',
        name: 'Wall B',
        length: 60,
        items: [
          { id: '4', kind: 'corner', sku: 'LS33', width: 33, count: false },
          { id: '5', kind: 'cab', sku: 'B21', width: 21 },
          { id: '6', kind: 'fill', sku: 'filler', width: 3 },
        ],
      },
    ],
  }
  it('counts boxes only, skips count:false corner twins, merges case', () => {
    const bom = layoutBom(L)
    expect(bom).toEqual([
      { sku: 'B21', qty: 2, runs: ['Wall A', 'Wall B'] },
      { sku: 'LS33', qty: 1, runs: ['Wall A'] },
    ])
    expect(layoutCount(L)).toBe(3)
  })
  it('never counts appliances, openings, or fillers', () => {
    expect(layoutBom(L).find((l) => l.sku === 'RANGE' || l.sku === 'FILLER')).toBeUndefined()
  })
})

describe('the shipped Independence default (Surf Blvd rev F3)', () => {
  const kitchen = DEFAULT_CABINET_LAYOUTS.Independence[0]
  it('runs fit their walls — sink wall deliberately 4″ shy of the slider', () => {
    // The 142″ sink wall ends at the back sliding door: cabinets stop at
    // 138″ with finished end panels (never a filler into a door casing),
    // so BOTH sink-wall runs read exactly 4″ under. Everything else exact.
    for (const r of kitchen.runs) {
      const f = runFit(r)
      if (r.id === 'ind-k-sinkbase' || r.id === 'ind-k-sinkupper') {
        expect({ run: r.name, status: f.status, diff: f.diff }).toEqual({
          run: r.name,
          status: 'under',
          diff: -4,
        })
      } else {
        expect({ run: r.name, status: f.status }).toEqual({ run: r.name, status: 'fit' })
      }
    }
  })
  it('BOM = 20 cabinets with shared corners counted once', () => {
    expect(layoutCount(kitchen)).toBe(20)
    const bom = layoutBom(kitchen)
    expect(bom.find((l) => l.sku === 'LS33')?.qty).toBe(1)
    expect(bom.find((l) => l.sku === 'WDC2442')?.qty).toBe(1)
    expect(bom.find((l) => l.sku === 'B36')?.qty).toBe(2)
    expect(bom.find((l) => l.sku === 'W3630')?.qty).toBe(2)
  })
  it('read-through: default until the blob has an edit, then the blob wins', () => {
    expect(cabinetLayoutsFor('Independence', undefined)).toHaveLength(1)
    expect(cabinetLayoutsFor('Independence', { Independence: {} })).toHaveLength(1)
    expect(
      cabinetLayoutsFor('Independence', { Independence: { cabinets: [] } }),
    ).toHaveLength(0) // deliberate delete sticks — blob owns it after first write
    expect(cabinetLayoutsFor('A', undefined)).toEqual([])
  })
})

describe('cornerShape', () => {
  it('WDC codes draw as diagonal corners, LS as lazy susans, rest as rects', () => {
    expect(cornerShape('WDC2442')).toBe('diag')
    expect(cornerShape('wdc2736')).toBe('diag')
    expect(cornerShape('LS33')).toBe('lazy')
    expect(cornerShape('LS36')).toBe('lazy')
    expect(cornerShape('BBC42')).toBe('rect') // a blind corner IS a rectangle
    expect(cornerShape('B36')).toBe('rect')
    expect(cornerShape('')).toBe('rect')
  })
})

describe('plan-view defaults (effDepth / inferSide)', () => {
  const r = (group: string, side?: CabinetRun['side'], depth?: number): CabinetRun => ({
    id: 'r',
    group,
    name: 'x',
    length: 96,
    items: [],
    ...(side ? { side } : {}),
    ...(depth ? { depth } : {}),
  })
  it('depth: own value wins, else UPPER=12, else 24', () => {
    expect(effDepth(r('BASE'))).toBe(24)
    expect(effDepth(r('UPPER'))).toBe(12)
    expect(effDepth(r('ISLAND', 'island', 12))).toBe(12)
    expect(effDepth(r('UPPER', undefined, 24))).toBe(24) // over-fridge deep run
  })
  it('side: explicit wins; island group floats; walls go top, left, top…', () => {
    expect(inferSide(r('BASE', 'right'), 0)).toBe('right')
    expect(inferSide(r('ISLAND'), 0)).toBe('island')
    expect(inferSide(r('BASE'), 0)).toBe('top')
    expect(inferSide(r('BASE'), 1)).toBe('left')
    expect(inferSide(r('UPPER'), 0)).toBe('top')
  })
})

describe('fmtIn', () => {
  it('reads like a tape measure', () => {
    expect(fmtIn(38.5)).toBe('38½″')
    expect(fmtIn(2.5)).toBe('2½″')
    expect(fmtIn(9)).toBe('9″')
    expect(fmtIn(0.5)).toBe('½″')
    expect(fmtIn(3.125)).toBe('3⅛″')
    expect(fmtIn(0)).toBe('0″')
  })
})
