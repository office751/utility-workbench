/**
 * directions.ts — turn-by-turn driving directions from the NEAREST MAIN ROAD
 * to a project address, computed from OpenStreetMap data. Built for Duke's
 * Builder Portal "Directions" box (300-char limit), which wants exactly
 * this: how a line crew gets from the closest named highway to the lot.
 *
 * Recipe (all free, public, CORS-enabled APIs — no keys):
 *   1. Geocode the address with Nominatim (falls back to the street's
 *      centroid when the house number isn't mapped yet — normal for new
 *      construction).
 *   2. Ask Overpass for the nearest "main road" (OSM highway = trunk/
 *      primary/secondary/tertiary) within ~6 km and snap to its closest
 *      point.
 *   3. Route main-road point → house with OSRM and compress the steps into
 *      "From X (ref), turn east onto Y. Go ~0.4 mi, turn left onto Z…".
 *
 * Every step is best-effort: any failure returns null and the caller falls
 * back to the lot/parcel description. Light use only (a few calls per
 * application) — fine for the public Nominatim/Overpass/OSRM rate limits.
 *
 * Pure logic — no React. Uses fetch, so it needs a browser or Node 18+.
 */

interface Point { lat: number; lon: number }

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const OSRM = 'https://router.project-osrm.org'

/** Nominatim's usage policy wants an identifiable User-Agent. Node honors
 *  this header; browsers silently drop it and send their own UA + Referer,
 *  which the policy also accepts for light client-side use. */
const UA = { 'User-Agent': 'IronShieldWorkbench/1.0 (office@ironshieldconstruction.com)' }

/** Expand the lazy abbreviations used in the roster so geocoders match and
 *  OSM's fully-spelled street names ("Southwest 79th Terrace Road") compare
 *  equal to roster spellings ("SW 79th Terrace Rd"). */
function expandAddress(address: string): string {
  return address
    .replace(/\bSW\b/g, 'Southwest')
    .replace(/\bSE\b/g, 'Southeast')
    .replace(/\bNW\b/g, 'Northwest')
    .replace(/\bNE\b/g, 'Northeast')
    .replace(/\bDr\b/gi, 'Drive')
    .replace(/\bCir\b/gi, 'Circle')
    .replace(/\bRd\b/gi, 'Road')
    .replace(/\bCt\b/gi, 'Court')
    .replace(/\bLn\b/gi, 'Lane')
    .replace(/\bAve\b/gi, 'Avenue')
    .replace(/\bPl\b/gi, 'Place')
    .replace(/\bSt\b/gi, 'Street')
    .replace(/\bTer\b/gi, 'Terrace')
    .replace(/\bBlvd\b/gi, 'Boulevard')
}

/**
 * Strip roster placeholders so the geocoder sees a REAL street name:
 *   "TBD NW 65th St (SFR)" → "NW 65th St"
 * New-construction lots sit in the roster as "TBD <street> (SFR|ADU)" until a
 * house number is assigned. Fed raw to Nominatim that never resolves (the
 * literal "TBD … (SFR)" has no match), which used to kill the whole pipeline.
 * We drop a leading "TBD" and any trailing "(…)" tag; a real house number (if
 * present) is left for geocode() to handle.
 */
function cleanAddress(address: string): string {
  return address
    .replace(/^\s*TBD\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim()
}

/**
 * Geocode the house, degrading gracefully for new construction:
 *   1. full address (house # is usually NOT mapped yet for our builds)
 *   2. street + city
 *   3. street + county — spec-home subdivisions are often unincorporated,
 *      so OSM files them under "Marion County", not the mailing city.
 * Nominatim allows 1 request/second — pace the retries.
 */
async function geocode(address: string, city: string, zip: string, county: string): Promise<Point | null> {
  const full = expandAddress(cleanAddress(address))
  const street = full.replace(/^[0-9]+\s+/, '')
  const queries = [
    `${full}, ${city}, FL ${zip}`,
    `${street}, ${city}, FL`,
    `${street}, ${county} County, FL`,
  ]
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100)) // rate-limit pause
    const res = await fetch(`${NOMINATIM}/search?format=json&limit=1&q=${encodeURIComponent(queries[i])}`, { headers: UA })
    if (!res.ok) continue
    const hits = (await res.json()) as { lat: string; lon: string }[]
    if (hits[0]) return { lat: +hits[0].lat, lon: +hits[0].lon }
  }
  return null
}

/**
 * The closest point ON a main road, with its name. "Main road" means a REAL
 * highway first — trunk/primary/secondary, the roads a Duke crew would call
 * main (e.g. SE 58th Ave / Baseline Rd, FL-35). Only when none exists within
 * ~6 km do we settle for a tertiary collector.
 */
async function nearestMainRoad(house: Point): Promise<{ point: Point; name: string; ref: string } | null> {
  for (const classes of ['trunk|primary|secondary', 'tertiary']) {
    const data = `[out:json][timeout:20];way["highway"~"^(${classes})$"]["name"](around:6000,${house.lat},${house.lon});out geom tags;`
    const res = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(data), headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...UA } })
    if (!res.ok) continue
    const json = await res.json()
    let best: { d: number; point: Point; name: string; ref: string } | null = null
    for (const el of json.elements ?? []) {
      const name = el.tags?.name
      if (!name) continue
      for (const g of el.geometry ?? []) {
        // crude meters-per-degree flat-earth distance — fine at this scale
        const d = Math.hypot((house.lat - g.lat) * 111000, (house.lon - g.lon) * 96000)
        if (!best || d < best.d) best = { d, point: g, name, ref: el.tags?.ref ?? '' }
      }
    }
    if (best) return { point: best.point, name: best.name, ref: best.ref }
  }
  return null
}

/**
 * The nearest CROSS STREET to the lot — the closest named road of ANY class
 * (residential included) within ~700 m whose name isn't the destination's own
 * street. This is the literal "Nearest Cross Street or Intersection" Duke
 * requires, and it needs ONLY a geocode (not the flakier main-road routing) —
 * so the required field gets filled even when turn-by-turn comes up empty.
 */
async function nearestCrossStreet(house: Point, destStreet: string): Promise<string | null> {
  const data = `[out:json][timeout:20];way["highway"]["name"](around:700,${house.lat},${house.lon});out geom tags;`
  const res = await fetch(OVERPASS, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(data),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...UA },
  })
  if (!res.ok) return null
  const json = await res.json()
  let best: { d: number; name: string } | null = null
  for (const el of json.elements ?? []) {
    const name = el.tags?.name
    if (!name || name.toLowerCase() === destStreet) continue // skip the lot's own street
    for (const g of el.geometry ?? []) {
      const d = Math.hypot((house.lat - g.lat) * 111000, (house.lon - g.lon) * 96000)
      if (!best || d < best.d) best = { d, name }
    }
  }
  return best?.name ?? null
}

/** "0.4 mi" / "350 ft" from meters. */
function dist(m: number): string {
  return m < 160 ? `${Math.round(m / 3.048) * 10} ft` : `~${(m / 1609.34).toFixed(1)} mi`
}

const TURN_WORD: Record<string, string> = {
  left: 'turn left onto', right: 'turn right onto',
  'slight left': 'bear left onto', 'slight right': 'bear right onto',
  'sharp left': 'turn sharp left onto', 'sharp right': 'turn sharp right onto',
  straight: 'continue onto', uturn: 'U-turn onto',
}

/**
 * Directions + nearest cross street for a project address.
 *
 * Returns null ONLY when the address can't be geocoded at all (nothing we can
 * do — caller uses the lot/parcel fallback). Otherwise returns an object where
 * each field is best-effort:
 *   • firstStreet — the nearest cross street (geocode-only, so it survives a
 *     routing failure). This fills Duke's REQUIRED field.
 *   • text/mainRoad — turn-by-turn from the nearest main road, or null if the
 *     routing came up empty (then the caller keeps the lot/parcel directions
 *     but STILL has the cross street).
 * This decoupling is the fix for the portal stalling on a blank cross street.
 */
export async function directionsFromMainRoad(
  address: string,
  city: string,
  zip: string,
  county = 'Marion',
  maxLen = 300,
): Promise<{ text: string | null; mainRoad: string | null; firstStreet: string | null } | null> {
  try {
    const house = await geocode(address, city, zip, county)
    if (!house) return null // truly unplaceable — caller falls back fully

    const destStreet = expandAddress(cleanAddress(address)).replace(/^[0-9]+\s+/, '').toLowerCase()
    const destLabel = cleanAddress(address)

    // 1) Nearest cross street — only needs the geocode, so it's the reliable
    //    source for Duke's required field.
    let firstStreet = await nearestCrossStreet(house, destStreet)

    // 2) Best-effort turn-by-turn (the Directions box text). Any miss here just
    //    leaves text null; the cross street above still stands.
    let text: string | null = null
    let mainRoad: string | null = null
    const main = await nearestMainRoad(house)
    if (main) {
      const url = `${OSRM}/route/v1/driving/${main.point.lon},${main.point.lat};${house.lon},${house.lat}?steps=true&overview=false`
      const res = await fetch(url, { headers: UA })
      const route = res.ok ? (await res.json()).routes?.[0] : null
      if (route) {
        const parts: string[] = []
        const streets: string[] = []
        for (const step of route.legs.flatMap((l: { steps: unknown[] }) => l.steps) as {
          maneuver: { type: string; modifier?: string }
          name?: string
          distance: number
        }[]) {
          const { type, modifier } = step.maneuver
          if (type === 'depart' || type === 'arrive' || !step.name) continue
          if (step.name === main.name) continue // still on the main road
          const turn = TURN_WORD[modifier ?? ''] ?? 'continue onto'
          parts.push(`${turn} ${step.name}${step.distance > 30 ? `, go ${dist(step.distance)}` : ''}`)
          streets.push(step.name)
        }
        if (parts.length) {
          mainRoad = main.ref ? `${main.name} (${main.ref})` : main.name
          text = `From ${mainRoad}: ${parts.join('; ')}; destination ${destLabel}.`
          if (text.length > maxLen) text = text.slice(0, maxLen - 1) + '…'
          // If the cross-street lookup missed, take the last routed street.
          if (!firstStreet) {
            const cand = streets.filter((s) => s.toLowerCase() !== destStreet)
            firstStreet = cand[cand.length - 1] ?? null
          }
        }
      }
    }

    return { text, mainRoad, firstStreet }
  } catch {
    return null
  }
}
