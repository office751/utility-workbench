import { describe, it, expect } from 'vitest'
import {
  sqlQuote,
  parcelQueryUrl,
  geocodeUrl,
  territoryUrl,
  seamUrl,
  parseParcelCentroid,
  parseGeocode,
  parseProviders,
  providerCode,
  waterProviderCode,
  isLocatableAddress,
  MIN_GEOCODE_SCORE,
  SEAM_METERS,
  TERRITORY_MAP_URLS,
} from './territoryLookup'

/* Real response shapes captured from the live county services July 2026
   (trimmed to the fields the parsers read). */

const PARCEL_JSON = {
  features: [
    {
      attributes: { PARCEL: '8011-1368-27', SITUS_1: '14845 SW 77TH AVE', NAME: 'IRON SHIELD CONSTRUCTION LLC' },
      geometry: { x: -82.2473, y: 29.0071 },
    },
  ],
}

const GEOCODE_JSON = {
  candidates: [
    {
      address: '14845 SW 77TH AVE, OCALA, FL, 34473',
      score: 100,
      location: { x: -82.2473, y: 29.00707 },
    },
  ],
}

describe('providerCode() — county layer name → app utility code', () => {
  it('maps the three built-ins (any spelling the county uses)', () => {
    expect(providerCode('Duke Energy')).toBe('DUKE')
    expect(providerCode('SECO Energy')).toBe('SECO')
    expect(providerCode('Sumter Electric Cooperative, Inc.')).toBe('SECO')
    expect(providerCode('Clay Electric Cooperative')).toBe('CLAY')
  })

  it('refuses to guess for providers we have no automation for', () => {
    // Fail open: report the name, never invent a code — these are real Marion
    // County providers the app treats as contact-only.
    expect(providerCode('Ocala Electric Utility')).toBeNull()
    expect(providerCode('Central Florida Electric Cooperative')).toBeNull()
    expect(providerCode('')).toBeNull()
  })
})

describe('waterProviderCode() — county water layer name → waterCompanyId', () => {
  it("maps only the built-in default (the 'MCU' sentinel)", () => {
    expect(waterProviderCode('Marion County Utilities')).toBe('MCU')
  })

  it('never guesses for the private companies — roster-match or report-only', () => {
    expect(waterProviderCode('Sunshine Utilities')).toBeNull()
    expect(waterProviderCode('FGUA/Aqua Utilities')).toBeNull()
    expect(waterProviderCode('City of Belleview')).toBeNull()
    expect(waterProviderCode('')).toBeNull()
  })
})

describe('URL builders', () => {
  // URLSearchParams encodes quotes/commas — decode before asserting so the
  // tests read like the query the server actually sees.
  const decoded = (url: string) => decodeURIComponent(url.replace(/\+/g, ' '))

  it('parcel query uses the county dash format verbatim', () => {
    const url = parcelQueryUrl('8011-1368-27')
    expect(url).toContain('ParcelCentroids')
    expect(decoded(url)).toContain("PARCEL='8011-1368-27'")
    expect(url).toContain('outSR=4326')
  })

  it("a stray apostrophe can't break (or rewrite) the where clause", () => {
    expect(sqlQuote("O'Brien")).toBe("'O''Brien'")
    expect(decoded(parcelQueryUrl("80'11"))).toContain("PARCEL='80''11'")
  })

  it('geocode query is street-only single line against the county locator', () => {
    const url = geocodeUrl(' 14845 SW 77TH AVE ')
    expect(url).toContain('MarionCountyAddressLocator')
    expect(url).toContain('SingleLine=14845+SW+77TH+AVE')
  })

  it('territory query point-intersects; seam query widens by exactly a mile', () => {
    const t = territoryUrl(-82.2473, 29.0071)
    expect(t).toContain('Electric_Service_Areas')
    expect(t).toContain(encodeURIComponent('-82.2473,29.0071'))
    expect(t).not.toContain('distance=')
    const s = seamUrl(-82.2473, 29.0071)
    expect(s).toContain(`distance=${SEAM_METERS}`)
    expect(SEAM_METERS).toBe(1609) // one mile — the "you're near the seam" radius
  })

  it("water queries hit the Utility Service Areas layer, filtered to WATER='Yes'", () => {
    // The water layer mixes water & sewer rows — an unfiltered query would
    // let a sewer-only polygon masquerade as a water answer.
    const t = territoryUrl(-82.2473, 29.0071, 'water')
    expect(t).toContain('Utility_Service_Areas')
    expect(decoded(t)).toContain("WATER='Yes'")
    expect(decoded(seamUrl(-82.2473, 29.0071, 'water'))).toContain("WATER='Yes'")
    // …and the electric layer never gets the water filter.
    expect(decoded(territoryUrl(-82.2473, 29.0071))).not.toContain('WATER')
  })

  it('each kind links to its own county map for the human fallback', () => {
    expect(TERRITORY_MAP_URLS.electric).toContain('electric-service-areas')
    expect(TERRITORY_MAP_URLS.water).toContain('utility-service-areas')
  })
})

describe('parseParcelCentroid()', () => {
  it('reads the live county shape (situs comes along for sanity display)', () => {
    expect(parseParcelCentroid(PARCEL_JSON)).toEqual({
      lon: -82.2473,
      lat: 29.0071,
      matched: '14845 SW 77TH AVE',
    })
  })

  it('unknown parcel (empty features) → null, never a fake point', () => {
    expect(parseParcelCentroid({ features: [] })).toBeNull()
    expect(parseParcelCentroid({})).toBeNull()
    expect(parseParcelCentroid({ error: { code: 400 } })).toBeNull()
  })
})

describe('parseGeocode()', () => {
  it('accepts a confident county match', () => {
    expect(parseGeocode(GEOCODE_JSON)).toEqual({
      lon: -82.2473,
      lat: 29.00707,
      matched: '14845 SW 77TH AVE, OCALA, FL, 34473',
    })
  })

  it(`rejects weak matches (score < ${MIN_GEOCODE_SCORE}) — a wrong rooftop would verify the wrong utility`, () => {
    const weak = {
      candidates: [{ address: 'SW 77TH AVE', score: 79, location: { x: -82.2, y: 29.0 } }],
    }
    expect(parseGeocode(weak)).toBeNull()
    expect(parseGeocode({ candidates: [] })).toBeNull()
  })
})

describe('parseProviders()', () => {
  it('dedupes and drops blanks, preserving layer order', () => {
    const json = {
      features: [
        { attributes: { NAME: 'SECO Energy' } },
        { attributes: { NAME: 'Duke Energy' } },
        { attributes: { NAME: 'SECO Energy' } },
        { attributes: { NAME: '' } },
      ],
    }
    expect(parseProviders(json)).toEqual(['SECO Energy', 'Duke Energy'])
    expect(parseProviders({})).toEqual([])
  })
})

describe('isLocatableAddress() — the geocode fallback gate', () => {
  it('TBD / blank addresses are not sent to the geocoder', () => {
    expect(isLocatableAddress('TBD SW 140th St')).toBe(false)
    expect(isLocatableAddress('tbd')).toBe(false)
    expect(isLocatableAddress('   ')).toBe(false)
    expect(isLocatableAddress('14845 SW 77th Ave')).toBe(true)
  })
})
