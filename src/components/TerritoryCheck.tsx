/**
 * TerritoryCheck — the "not verified" banner, now with a brain.
 *
 * Three flavors of the same flow (lib/territoryLookup.ts — parcel-first
 * lookup against Marion County's own service-area layers):
 *
 *   ⚡ electric — on the Electric tab whenever needsVerify() says the utility
 *     is unconfirmed. Apply = utility set + 'verify' step checked, one update.
 *   💧 water (verify) — on the Water tab for CITY-WATER lots only
 *     (needsWaterVerify); wells have no company to verify. Apply =
 *     waterCompanyId set + the provenance stamped into the 'cavail' step
 *     NOTE — the step itself stays unchecked, because territory says WHOSE
 *     franchise area this is, not whether a main actually reaches the lot.
 *     That call stays human.
 *   💧 water (SCOUT, Aug 2026) — on the Water tab when the source is still
 *     UNDECIDED and Adam suspects city water. Same lookup, calmer banner,
 *     different payoff: a hit's apply sets the source to City AND records
 *     the company in one click (applyScoutedWaterUtility), and "outside
 *     every polygon" renders as the answer it is — no franchise here means
 *     well country on paper — instead of an error. The well-vs-city
 *     decision itself stays Adam's; the county map just informs it.
 *
 * Why this exists: SECO/Duke seams cut right through our subdivisions
 * (Marion Oaks' west edge is Duke!), and confirming territory used to mean
 * phone calls or per-lot research. The county map already knows — ask it.
 */
import { useState } from 'react'
import type { Project, Utility } from '../types'
import type { UtilityCompany } from '../data/utilities'
import {
  lookupTerritory,
  TERRITORY_MAP_URLS,
  type TerritoryKind,
  type TerritoryResult,
} from '../lib/territoryLookup'
import Icon from './Icon'

interface Props {
  p: Project
  /** Which service-area layer to ask (and which apply-wording to use). */
  kind: TerritoryKind
  /** 'verify' (default) = the warning banner for a lot whose company is
   *  unconfirmed. 'scout' (water only) = the calm "suspect city water?"
   *  offer for a lot whose SOURCE is still undecided — same lookup, but the
   *  apply also sets the source, and a no-franchise miss reads as a well
   *  signal instead of an error. */
  mode?: 'verify' | 'scout'
  /** Owner-added extra companies (Settings → Utility companies setup) — lets a
   *  non-built-in county answer (e.g. Ocala Electric, Sunshine Utilities)
   *  still be one-click set when Adam already created a roster entry for it. */
  utilities: UtilityCompany[]
  /** The one-setState writer for this kind+mode (applyVerifiedUtility /
   *  applyVerifiedWaterUtility / applyScoutedWaterUtility — see useProjects). */
  applyVerified: (id: number, code: Utility, providerName: string) => void
}

/** Per-flavor wording so the banner reads naturally everywhere it appears.
 *  Keys: the two verify flavors by kind, plus the water scout.
 *  `applyText` receives the display label (code, provider, or roster name)
 *  and returns the whole apply-button text — scout's differs structurally
 *  (it sets the SOURCE too), so the wording lives here, not in JSX. */
const FLAVOR_TEXT: Record<
  'electric' | 'water' | 'scout',
  { headline: (p: Project) => string; applyText: (label: string) => string }
> = {
  electric: {
    headline: (p) =>
      `Territory not verified — confirm the electric company before applying (subdivision: ${p.subdivision}).`,
    applyText: (label) => `Set ${label} + mark verified`,
  },
  water: {
    headline: () =>
      'City-water lot — confirm WHICH water company serves it before applying. (The availability call still confirms a main reaches the lot.)',
    applyText: (label) => `Set ${label} + record company`,
  },
  scout: {
    headline: () =>
      'Suspect city water? Ask the county map whose water franchise area this lot is in — before deciding well vs city.',
    applyText: (label) => `Set source City + record ${label}`,
  },
}

export default function TerritoryCheck({ p, kind, mode = 'verify', utilities, applyVerified }: Props) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TerritoryResult | null>(null)

  async function check() {
    setBusy(true)
    setResult(null)
    setResult(await lookupTerritory(p, kind)) // never throws — misses come back as {ok:false}
    setBusy(false)
  }

  // For a provider we have no built-in code for: is there an owner-added
  // company of this kind whose name matches? (loose contains-match either way,
  // so "Sunshine Utilities" in the county layer finds a roster entry named
  // "Sunshine Utilities of Central FL")
  const rosterKind = kind === 'water' ? 'water' : 'electric'
  const rosterMatch =
    result?.ok && !result.code
      ? utilities.find(
          (u) =>
            u.kind === rosterKind &&
            (u.name.toLowerCase().includes(result.provider.toLowerCase()) ||
              result.provider.toLowerCase().includes(u.name.toLowerCase())),
        )
      : undefined

  // The county map, centered on the lot when we know where it is — the human
  // fallback for every path below. Misses carry a point too now (whenever the
  // lot itself was located), so even "outside every polygon" centers the map.
  const pt = result ? (result.ok ? result.point : result.point) : undefined
  const mapUrl = pt
    ? `${TERRITORY_MAP_URLS[kind]}?location=${pt.lat.toFixed(5)},${pt.lon.toFixed(5)},15.00`
    : TERRITORY_MAP_URLS[kind]

  const scout = mode === 'scout'
  const text = FLAVOR_TEXT[scout ? 'scout' : kind]

  return (
    <div className={scout ? 'banner scout' : 'banner'}>
      {/* Scout is an OFFER, not an alarm — calm icon, calm banner. */}
      {scout ? (
        <Icon name="map" size={15} color="var(--info)" />
      ) : (
        <Icon name="warning" size={15} color="var(--warn)" />
      )}{' '}
      {text.headline(p)}
      <div className="tc-actions">
        {/* The one-click answer. While a result is showing, the button stays
            as a smaller "re-check" so a misfire is never a dead end. */}
        <button className="contact" onClick={check} disabled={busy}>
          <Icon name={busy ? 'hourglass_top' : 'travel_explore'} size={15} />
          {busy ? ' Asking Marion County GIS…' : result ? ' Re-check' : ' Check county GIS'}
        </button>
        {!result && !busy && (
          <span className="muted">…or set it yourself in ⚙ Settings if you already know.</span>
        )}
      </div>

      {/* Scout flavor of "outside every polygon": that's not a failure, it's
          the answer — no company franchises this area, which on paper means a
          well lot. If someone's territory starts within a mile, say who, so
          a genuinely-close main still gets its phone call. */}
      {result && !result.ok && result.outside && scout && (
        <div className="tc-result">
          <div>
            <Icon name="check_circle" size={15} color="var(--ok, #2e7d32)" /> No water utility
            claims this lot on the county franchise map — <b>that points to a well lot</b>.{' '}
            <a href={mapUrl} target="_blank" rel="noreferrer">
              map <Icon name="open_in_new" size={12} />
            </a>
          </div>
          {(result.nearby?.length ?? 0) > 0 && (
            <div className="tc-caution">
              <Icon name="fence" size={14} /> That said: {result.nearby!.join(' / ')} territory
              starts within a mile. If you still think a main runs close to this lot, that's who
              to call before drilling a well.
            </div>
          )}
          <div className="muted">
            If it's a well after all, set the source in ⚙ Settings and the well checklist loads.
          </div>
        </div>
      )}

      {result && !result.ok && !(result.outside && scout) && (
        <div className="tc-result">
          <Icon name="help" size={15} /> {result.reason}{' '}
          <a href={mapUrl} target="_blank" rel="noreferrer">
            county map <Icon name="open_in_new" size={12} />
          </a>
        </div>
      )}

      {result?.ok && (
        <div className="tc-result">
          <div>
            <Icon name="check_circle" size={15} color="var(--ok, #2e7d32)" /> County GIS says:{' '}
            <b>{result.provider}</b>
            {/* Scout hits spell out what a franchise hit MEANS (and doesn't):
                who you'd apply with if the lot goes city — not proof a main
                reaches the lot. */}
            {scout && <> holds the water franchise here — if this lot goes city, that's who you'd
            apply with. Whether a main actually reaches the lot is still their call.</>}{' '}
            <span className="muted">
              (matched {result.matched} · by {result.via === 'parcel' ? 'parcel number' : 'address'}
              ) ·{' '}
              <a href={mapUrl} target="_blank" rel="noreferrer">
                map <Icon name="open_in_new" size={12} />
              </a>
            </span>
          </div>

          {/* Seam caution — the whole reason this button exists. Near a
              boundary the county layer is right ~always, but not survey-grade,
              so say who's next door instead of pretending certainty. */}
          {result.neighbors.length > 0 && (
            <div className="tc-caution">
              <Icon name="fence" size={14} /> Boundary lot: {result.neighbors.join(' / ')} territory
              starts within a mile. The county line is reliable — but if {result.provider} rejects
              the application, that's who to call next.
            </div>
          )}

          {result.code ? (
            <button
              className="contact tc-apply"
              onClick={() => applyVerified(p.id, result.code!, result.provider)}
            >
              <Icon name="task_alt" size={15} />{' '}
              {text.applyText(kind === 'water' ? result.provider : result.code)}
            </button>
          ) : rosterMatch ? (
            <button
              className="contact tc-apply"
              onClick={() => applyVerified(p.id, rosterMatch.id, result.provider)}
            >
              <Icon name="task_alt" size={15} /> {text.applyText(`“${rosterMatch.name}”`)}
            </button>
          ) : kind === 'electric' ? (
            // A real provider we have no workflow for (e.g. Ocala Electric):
            // give the name and the path, never a fake code.
            <div className="muted">
              {result.provider} isn't one of the built-ins (SECO/Duke/Clay). Add it under ⚙
              Settings → Utility companies setup, then set it on this project — it'll work like
              Clay does: a contact card, no auto-filled forms.
            </div>
          ) : (
            <div className="muted">
              {result.provider} isn't in your companies list yet. Add it (kind: water) under ⚙
              Settings → Utility companies setup, then re-check here to record it with one click.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
