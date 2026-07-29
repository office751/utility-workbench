/**
 * cabinets.ts — FGT Cabinetry config for the 📐 Models cabinet-layout editor.
 *
 * Three things live here (pure config, no React):
 *   1. FGT_SKUS — the catalog for the SKU picker, read off the FGT spec book
 *      (Takeoffs/Cabinets/"FGT Spec Book .pdf", July 2026). Free text is
 *      always allowed; this only powers autocomplete.
 *   2. CABINET_KIND_LABELS — display names for segment kinds.
 *   3. DEFAULT_CABINET_LAYOUTS — per-model starting layouts. Independence is
 *      seeded with the field-verified Surf Blvd kitchen (22047 SW Surf Blvd,
 *      rev F3, July 2026). Read-through: a model shows its default until the
 *      first in-app edit copies it into the blob (ModelState.cabinets) —
 *      same pattern as the model spec facts.
 *
 * Fit math + BOM rules live in src/lib/cabinets.ts (see docs/BRAINS.md).
 */
import type { CabinetLayout, CabinetRun, CabinetSegment, ModelState } from '../types'

export const CABINET_KIND_LABELS: Record<CabinetSegment['kind'], string> = {
  cab: 'Cabinet',
  sink: 'Sink base',
  corner: 'Corner unit',
  appl: 'Appliance',
  open: 'Opening / window',
  fill: 'Filler / scribe',
}

/** FGT catalog for autocomplete — bases, sinks, corners, walls, bridges, tall. */
export const FGT_SKUS: string[] = [
  // single-door / standard bases
  'B09', 'B12', 'B15', 'B18', 'B21', 'B24', 'B27', 'B30', 'B33', 'B36',
  // trash pull-outs (solid wood tray, 2 bins + hardware)
  'B18-TR', 'B21-TR',
  // drawer bases
  '2DB30', '2DB36', '3DB12', '3DB15', '3DB18', '3DB21', '3DB24', '3DB30', '3DB36',
  // sink bases (+ farm/corner sink, base microwave)
  'SB24', 'SB27', 'SB30', 'SB33', 'SB36', 'FSB36', 'DSB36', 'BMC30',
  // corner solutions
  'BBC36', 'BBC42', 'LS33', 'LS36',
  // wall cabinets — 1-door
  'W0930', 'W1230', 'W1530', 'W1830', 'W2130',
  'W0936', 'W1236', 'W1536', 'W1836', 'W2136',
  'W0942', 'W1242', 'W1542', 'W1842', 'W2142',
  // wall cabinets — 2-door
  'W2430', 'W2730', 'W3030', 'W3330', 'W3630',
  'W2436', 'W2736', 'W3036', 'W3336', 'W3636',
  'W2442', 'W2742', 'W3042', 'W3342', 'W3642',
  // bridges (12″ deep) + deep bridges (24″ deep, over-fridge)
  'W2418', 'W2424', 'W3012', 'W3015', 'W3018', 'W3021', 'W3024',
  'W3612', 'W3615', 'W3618', 'W3624',
  'W301224', 'W361224', 'W361824', 'W362124', 'W362424',
  // wall diagonal corners + wall end shelves
  'WDC2430', 'WDC2436', 'WDC2442', 'WDC2736',
  'WES0930', 'WES0936', 'WES0942', 'WES1230', 'WES1236', 'WES1242',
  // oven / pantry / specialty
  'OC3384D', 'OC3390D', 'OC3396D', 'WR3015', 'WR3018', 'MC3018',
  'VUP1884', 'UP1884', 'UP2484', 'UP2490', 'UP2496',
]

/* ------------------------------------------------------------------ */
/* Default layouts.                                                    */
/* Stable ids ('ind-…') so re-seeding after a delete stays idempotent. */
/* ------------------------------------------------------------------ */

const s = (
  id: string,
  kind: CabinetSegment['kind'],
  sku: string,
  width: number,
  note?: string,
  count?: boolean,
): CabinetSegment => ({
  id,
  kind,
  sku,
  width,
  ...(note ? { note } : {}),
  ...(count === false ? { count: false } : {}),
})

const INDEPENDENCE_KITCHEN: CabinetLayout = {
  id: 'ind-kitchen',
  name: 'Kitchen',
  notes:
    'Field-verified at 22047 SW Surf Blvd (rev F3, Jul 2026). Pantry closet (2668 bifold) sits behind the ≈3\'-0" end wall beside the fridge — no cabinets in it. Field-confirmed Jul 26 2026: corner→window = 62" (window 62–104). Sink base 66–102 sits 1" right of window center — forced minimum, accepted. Island seating row = 12"-deep wall boxes on a site-built 4½" platform. Uppers run flush to the 8\' ceiling — flat scribe trim, not crown. Corner turntables: add LS33KIT (2 per kit).',
  runs: [
    {
      id: 'ind-k-sinkbase',
      group: 'BASE',
      side: 'top',
      depth: 24,
      name: 'Sink wall — base',
      length: 142,
      items: [
        s('ind-k-sb1', 'corner', 'LS33', 33, 'lazy susan + LS33KIT'),
        s('ind-k-sb2', 'cab', 'B09', 9),
        s('ind-k-sb3', 'appl', 'DW', 24, 'dishwasher'),
        s('ind-k-sb4', 'sink', 'SB36', 36, 'dbl bowl + G/D; center 84" = 1" right of window center (83") — forced by LS33+B09+DW, invisible'),
        s('ind-k-sb5', 'cab', 'B36', 36, 'end stacks with upper at 138"'),
        s('ind-k-sb6', 'fill', 'filler', 4, 'matched with upper filler'),
      ],
    },
    {
      id: 'ind-k-rangebase',
      endWall: true,
      group: 'BASE',
      side: 'left',
      depth: 24,
      name: 'Range wall — base',
      length: 158.5,
      items: [
        s('ind-k-rb1', 'corner', 'LS33', 33, 'shared corner — counted on sink wall', false),
        s('ind-k-rb2', 'cab', 'B21', 21, 'swap to B21-TR for trash pull-out'),
        s('ind-k-rb3', 'appl', 'RANGE', 30),
        s('ind-k-rb4', 'cab', 'B36', 36, 'landing between range & fridge'),
        s('ind-k-rb5', 'appl', 'FRIDGE', 38.5, '36" fridge + 2½" door spacer at end wall; pantry beyond'),
      ],
    },
    {
      id: 'ind-k-sinkupper',
      group: 'UPPER',
      side: 'top',
      depth: 12,
      name: 'Sink wall — uppers',
      length: 142,
      items: [
        s('ind-k-su1', 'corner', 'WDC2442', 24, 'wall diagonal corner'),
        s('ind-k-su2', 'cab', 'W2442', 24),
        s('ind-k-su3', 'cab', 'W1242', 12, 'ends 60" — 2" clear of window edge at 62"'),
        s('ind-k-su4', 'open', 'WINDOW', 45, 'window @ 62–104 (3636) + trim clearance — no cabinet over sink'),
        s('ind-k-su5', 'cab', 'W3342', 33, 'end stacks over base B36'),
        s('ind-k-su6', 'fill', 'filler', 4, 'matched with base filler'),
      ],
    },
    {
      id: 'ind-k-rangeupper',
      endWall: true,
      group: 'UPPER',
      side: 'left',
      depth: 12,
      name: 'Range wall — uppers',
      length: 158.5,
      items: [
        s('ind-k-ru1', 'corner', 'WDC2442', 24, 'shared corner — counted on sink wall', false),
        s('ind-k-ru2', 'cab', 'W3042', 30),
        s('ind-k-ru3', 'cab', 'W3030', 30, 'bridge over OTR microwave, bottom 66" AFF'),
        s('ind-k-ru4', 'cab', 'W3642', 36),
        s('ind-k-ru5', 'cab', 'W362424', 36, 'over fridge, 24" deep'),
        s('ind-k-ru6', 'fill', 'filler', 2.5, 'end wall — doubles as fridge door spacer'),
      ],
    },
    {
      id: 'ind-k-islwork',
      group: 'ISLAND',
      side: 'island',
      depth: 24,
      name: 'Island — working row (24" deep)',
      length: 96,
      items: [
        s('ind-k-iw1', 'cab', 'B33', 33),
        s('ind-k-iw2', 'cab', 'B33', 33),
        s('ind-k-iw3', 'sink', 'SB30', 30, 'prep sink toward great room'),
      ],
    },
    {
      id: 'ind-k-islseat',
      group: 'ISLAND',
      side: 'island',
      depth: 12,
      name: 'Island — seating row (12" deep)',
      length: 96,
      items: [
        s('ind-k-is1', 'cab', 'W3630', 36, 'wall box on 4½" platform'),
        s('ind-k-is2', 'cab', 'W3630', 36, 'wall box on 4½" platform'),
        s('ind-k-is3', 'cab', 'W2430', 24, 'wall box on 4½" platform'),
      ],
    },
  ],
}

export const DEFAULT_CABINET_LAYOUTS: Record<string, CabinetLayout[]> = {
  Independence: [INDEPENDENCE_KITCHEN],
}

/**
 * The layouts to SHOW for a model: the blob's saved layouts once any edit has
 * been made, else the code default, else none. (Read-through / copy-on-write —
 * the editor always writes the whole array via setModelInfo.)
 */
export function cabinetLayoutsFor(
  modelK: string,
  models: Record<string, ModelState> | undefined,
): CabinetLayout[] {
  return models?.[modelK]?.cabinets ?? DEFAULT_CABINET_LAYOUTS[modelK] ?? []
}

/** Non-cabinet quick-add presets for the editor's "+ appliance" etc. buttons. */
export const SEGMENT_PRESETS: Record<string, { kind: CabinetSegment['kind']; sku: string; width: number }> = {
  cab: { kind: 'cab', sku: 'B24', width: 24 },
  appl: { kind: 'appl', sku: 'APPLIANCE', width: 30 },
  open: { kind: 'open', sku: 'OPENING', width: 36 },
  fill: { kind: 'fill', sku: 'filler', width: 3 },
}

export type { CabinetRun }
