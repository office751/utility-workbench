/**
 * TerritoryCheck — the "Territory not verified" banner, now with a brain.
 *
 * Lives on the Electric tab whenever needsVerify() says the utility is still
 * unconfirmed. One click asks Marion County's own GIS which electric company
 * serves the lot (lib/territoryLookup.ts — parcel-first lookup against the
 * county's Electric Service Areas layer), then a second click writes the
 * answer: utility set + 'verify' step checked, in one state update
 * (useProjects.applyVerifiedUtility).
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
  TERRITORY_MAP_URL,
  type TerritoryResult,
} from '../lib/territoryLookup'
import Icon from './Icon'

interface Props {
  p: Project
  /** Owner-added extra companies (Settings → Utility companies setup) — lets a
   *  non-built-in county answer (e.g. Ocala Electric) still be one-click set
   *  when Adam already created a roster entry for it. */
  utilities: UtilityCompany[]
  applyVerifiedUtility: (id: number, code: Utility, providerName: string) => void
}

export default function TerritoryCheck({ p, utilities, applyVerifiedUtility }: Props) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TerritoryResult | null>(null)

  async function check() {
    setBusy(true)
    setResult(null)
    setResult(await lookupTerritory(p)) // never throws — misses come back as {ok:false}
    setBusy(false)
  }

  // For a provider we have no built-in code for: is there an owner-added
  // electric company whose name matches? (loose contains-match either way,
  // so "Ocala Electric Utility" finds a roster entry named "Ocala Electric")
  const rosterMatch =
    result?.ok && !result.code
      ? utilities.find(
          (u) =>
            u.kind === 'electric' &&
            (u.name.toLowerCase().includes(result.provider.toLowerCase()) ||
              result.provider.toLowerCase().includes(u.name.toLowerCase())),
        )
      : undefined

  // The county map, centered on the lot when we know where it is — the human
  // fallback for every path below.
  const mapUrl = result?.ok
    ? `${TERRITORY_MAP_URL}?location=${result.point.lat.toFixed(5)},${result.point.lon.toFixed(5)},15.00`
    : TERRITORY_MAP_URL

  return (
    <div className="banner">
      <Icon name="warning" size={15} color="var(--warn)" /> Territory not verified — confirm the
      electric company before applying (subdivision: {p.subdivision}).
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

      {result && !result.ok && (
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
            <b>{result.provider}</b>{' '}
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
              onClick={() => applyVerifiedUtility(p.id, result.code!, result.provider)}
            >
              <Icon name="task_alt" size={15} /> Set {result.code} + mark verified
            </button>
          ) : rosterMatch ? (
            <button
              className="contact tc-apply"
              onClick={() => applyVerifiedUtility(p.id, rosterMatch.id, result.provider)}
            >
              <Icon name="task_alt" size={15} /> Set “{rosterMatch.name}” + mark verified
            </button>
          ) : (
            // A real provider we have no workflow for (e.g. Ocala Electric):
            // give the name and the path, never a fake code.
            <div className="muted">
              {result.provider} isn't one of the built-ins (SECO/Duke/Clay). Add it under ⚙
              Settings → Utility companies setup, then set it on this project — it'll work like
              Clay does: a contact card, no auto-filled forms.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
