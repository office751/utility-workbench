/**
 * selections.ts — PURE CONFIG for the homeowner Selections tab.
 *
 * This is the in-app twin of the printed "Client Selections & Finishes" form.
 * It lists every design decision the client makes, grouped into Interior and
 * Exterior, with the common options shown as a dropdown. The client can always
 * type their own answer in the write-in box too (that's stored on the choice's
 * `writeIn`, see SelectionChoice in types.ts).
 *
 * Want to add/rename a category or change its options? Edit ONLY this file —
 * the Selections tab and the export/email both read from here, so the rest of
 * the UI follows automatically. (Same "add an entry, UI follows" convention as
 * data/orders.ts and data/vendors.ts.)
 *
 * NOTE: a category's `id` is the stable storage key — it's saved into each
 * project's selections. Rename a LABEL freely, but DON'T change an `id` once
 * clients have saved choices under it, or those saved choices orphan.
 */
import type {
  ModelSelectionTweaks,
  ProjectSelections,
  SelectionCategory,
  SelectionSection,
  SelectionsCatalog,
} from '../types'

// The catalog/section/category types now live in types.ts (so WorkbenchState can
// reference them). Re-export for convenience — existing imports keep working.
export type { SelectionCategory, SelectionSection } from '../types'

/* ------------------------------------------------------------------ */
/* INTERIOR — mirrors Section 1 of the printed form                    */
/* ------------------------------------------------------------------ */
const INTERIOR: SelectionCategory[] = [
  { id: 'wallPaint', label: 'Interior Wall Paint — Color', hint: 'Brand & color name',
    options: ['Agreeable Gray (SW 7029)', 'Repose Gray (SW 7015)', 'White Dove (BM OC-17)', 'Accessible Beige (SW 7036)', 'Pure White (SW 7005)'] },
  { id: 'paintSheen', label: 'Paint Sheen (walls)', options: ['Flat', 'Eggshell', 'Satin', 'Semi-gloss'] },
  { id: 'trimCeiling', label: 'Trim & Ceiling Paint', hint: 'Brand & color name',
    options: ['Pure White (SW 7005)', 'Extra White (SW 7006)', 'Match walls'] },
  { id: 'accentWall', label: 'Accent Wall(s)', hint: 'Room & color', options: ['None', 'Yes — see note'] },

  { id: 'floorMain', label: 'Flooring — Main Living Areas', hint: 'Color / style',
    options: ['Luxury Vinyl Plank (LVP)', 'Tile', 'Engineered Hardwood', 'Laminate', 'Carpet'] },
  { id: 'floorBedrooms', label: 'Flooring — Bedrooms', hint: 'Color / style',
    options: ['Carpet', 'LVP', 'Match main areas'] },
  { id: 'floorWet', label: 'Flooring — Baths & Laundry', hint: 'Color / style', options: ['Tile', 'LVP'] },

  { id: 'tileWalls', label: 'Shower / Bath Tile — Walls', hint: 'Brand, color, size', options: [] },
  { id: 'tileFloor', label: 'Shower / Bath Tile — Floor & Niche', hint: 'Brand, color, size', options: [] },
  { id: 'grout', label: 'Grout Color', options: ['White', 'Gray', 'Greige', 'Charcoal'] },

  { id: 'counterKitchen', label: 'Kitchen Countertops', hint: 'Color / pattern',
    options: ['Quartz', 'Granite', 'Marble', 'Laminate', 'Butcher Block'] },
  { id: 'counterBath', label: 'Bathroom Vanity Tops', hint: 'Color / pattern',
    options: ['Quartz', 'Granite', 'Cultured Marble', 'Match kitchen'] },
  { id: 'counterEdge', label: 'Countertop Edge', options: ['Straight / Eased', 'Beveled', 'Bullnose', 'Ogee'] },

  { id: 'cabStyle', label: 'Cabinet Door Style', hint: 'Other style', options: ['Shaker', 'Flat / Slab', 'Raised Panel'] },
  { id: 'cabColor', label: 'Cabinet Color / Finish', hint: 'Color / finish',
    options: ['White', 'Light Gray', 'Navy', 'Natural Wood', 'Two-tone — see note'] },

  { id: 'hardware', label: 'Cabinet & Door Hardware Finish (hinges, knobs, pulls, handles)',
    options: ['Matte Black', 'Brushed Nickel', 'Chrome', 'Champagne Bronze', 'Oil-Rubbed Bronze'] },

  { id: 'doorStyle', label: 'Interior Door Style', hint: 'Other style', options: ['2-Panel', '5-Panel / Shaker', 'Smooth Flush'] },
  { id: 'doorHandles', label: 'Interior Door Handles', hint: 'Finish', options: ['Lever', 'Round Knob'] },

  { id: 'plumbingFinish', label: 'Plumbing Fixture Finish (faucets, shower trim)',
    options: ['Matte Black', 'Brushed Nickel', 'Chrome', 'Brushed Gold'] },
  { id: 'kitchenFaucet', label: 'Kitchen Faucet', hint: 'Brand / model / style', options: [] },
  { id: 'toilets', label: 'Toilets', options: ['Standard Height', 'Comfort Height (elongated)'] },

  { id: 'lightingFinish', label: 'Lighting Fixture Finish', hint: 'Style / notes',
    options: ['Matte Black', 'Brushed Nickel', 'Bronze', 'Brushed Gold'] },
  { id: 'ceilingFans', label: 'Ceiling Fans', hint: 'Rooms / finish', options: ['None', 'Yes — see note'] },

  { id: 'appliances', label: 'Appliance Finish', hint: 'Brand / package',
    options: ['Stainless Steel', 'Black Stainless', 'White', 'Black'] },

  { id: 'baseboard', label: 'Baseboard Style', options: ['3 1/4 in.', '5 1/4 in.', 'Other — see note'] },
  { id: 'crown', label: 'Crown Molding', hint: 'Rooms', options: ['None', 'Yes — see note'] },
]

/* ------------------------------------------------------------------ */
/* EXTERIOR — mirrors Section 2 of the printed form                    */
/* ------------------------------------------------------------------ */
const EXTERIOR: SelectionCategory[] = [
  { id: 'roof', label: 'Roof Shingle Color', hint: 'Brand / style',
    options: ['Weathered Wood', 'Charcoal', 'Driftwood', 'Barkwood', 'Pewter Gray'] },
  { id: 'sidingType', label: 'Siding Type', hint: 'Other / mix',
    options: ['Vinyl', 'Fiber Cement (Hardie)', 'Stucco', 'Brick', 'Board & Batten'] },
  { id: 'bodyColor', label: 'Siding / Body Color', hint: 'Brand & color', options: [] },
  { id: 'trimColor', label: 'Exterior Trim Color', hint: 'Brand & color', options: [] },
  { id: 'accentColor', label: 'Accent / Shutter Color', hint: 'Brand & color', options: ['None', 'See note'] },

  { id: 'frontDoorColor', label: 'Front Door Color', hint: 'Color', options: ['Black', 'White', 'Stained Wood', 'Accent color — see note'] },
  { id: 'frontDoorHardware', label: 'Front Door Hardware', hint: 'Style / notes', options: ['Matte Black', 'Satin Nickel', 'Bronze', 'Brass / Gold'] },

  { id: 'garageStyle', label: 'Garage Door Style', hint: 'Other style', options: ['Raised Panel', 'Carriage', 'Flush', 'Modern'] },
  { id: 'garageColor', label: 'Garage Door Color', hint: 'Color', options: ['White', 'Match body', 'Match trim', 'Other — see note'] },
  { id: 'garageWindows', label: 'Garage Door Windows', options: ['No', 'Yes'] },

  { id: 'gutters', label: 'Gutters & Downspouts', hint: 'Color', options: ['White', 'Match trim', 'Bronze', 'Black'] },
  { id: 'extLighting', label: 'Exterior Lighting Finish', hint: 'Style / notes', options: ['Matte Black', 'Bronze', 'Satin Nickel'] },
  { id: 'driveway', label: 'Driveway / Walkway', hint: 'Color / pattern', options: ['Broom-finish Concrete', 'Stamped Concrete', 'Pavers'] },
]

/** The whole catalog — two sections, each with its categories. */
export const SELECTION_SECTIONS: SelectionSection[] = [
  { id: 'interior', label: 'Interior Selections', icon: 'palette', categories: INTERIOR },
  { id: 'exterior', label: 'Exterior Selections', icon: 'home', categories: EXTERIOR },
]

/** A blank, safe default — used as the fallback everywhere a project might not
 *  have selections yet (the hundreds of houses saved before this feature). */
export function defaultSelections(): ProjectSelections {
  return { interior: {}, exterior: {} }
}

/** A fresh copy of the default catalog (deep-cloned so edits never mutate the
 *  module constant). Seeded into the cloud blob on first run; after that the
 *  blob owns it (edited in Settings → Selections setup). */
export function defaultCatalog(): SelectionsCatalog {
  return {
    sections: JSON.parse(JSON.stringify(SELECTION_SECTIONS)) as SelectionSection[],
    perModel: {},
  }
}

/**
 * The EFFECTIVE sections for one project's model — what the Selections tab and
 * the export actually render. Drops globally-hidden and per-model-hidden
 * categories, and swaps in any per-model option-list overrides.
 */
export function resolveSelectionSections(
  catalog: SelectionsCatalog | undefined,
  modelK: string,
): SelectionSection[] {
  const cat = catalog ?? defaultCatalog()
  const tweaks: ModelSelectionTweaks | undefined = cat.perModel?.[modelK]
  const hidden = new Set(tweaks?.hidden ?? [])
  return cat.sections.map((sec) => ({
    ...sec,
    categories: sec.categories
      .filter((c) => !c.hidden && !hidden.has(c.id))
      .map((c) => {
        const ov = tweaks?.options?.[c.id]
        return ov && ov.length ? { ...c, options: ov } : c
      }),
  }))
}
