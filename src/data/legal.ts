/**
 * legal.ts — parcel → legal description (Lot/Block/Sec/Twp/Rge), needed on the
 * SECO application. Pulled from the Marion Property Appraiser (pa.marion.fl.us).
 *
 * Only a handful are on file so far; any parcel not listed gets a
 * "[look up …]" placeholder in the generated application so it can't be sent
 * blank by accident. A future one-shot script can generate this whole map from
 * a property-appraiser CSV export.
 */
export const LEGAL: Record<string, string> = {
  '1801-024-034': 'Sec 35 / Twp 15 / Rge 18 · Blk 24 · Lot 34',
  '1802-001-031': 'Sec 34 / Twp 15 / Rge 18 · Blk 1 · Lot 31',
  '1802-002-039': 'Sec 34 / Twp 15 / Rge 18 · Blk 2 · Lot 39',
  '1802-008-009': 'Sec 34 / Twp 15 / Rge 18 · Blk 8 · Lot 9',
  '1328-017-011': 'Sec 24 / Twp 14 / Rge 21 · Blk Q · Lots 11 & 12',
}

export const LEGAL_PLACEHOLDER = '[look up Lot/Block/Sec/Twp/Rge on pa.marion.fl.us]'

export function legalFor(parcel: string): string {
  return LEGAL[parcel] ?? LEGAL_PLACEHOLDER
}
