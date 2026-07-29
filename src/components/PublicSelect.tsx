/**
 * PublicSelect.tsx — the CLIENT-FACING selections page behind a share link
 * (#/select/<token>), mounted straight from main.tsx.
 *
 * This page is a different world from the rest of the app:
 *   • NO login, NO Root/auth bootstrapping, NO workbench blob — it renders
 *     only the curated snapshot the token fetches (lib/selectionShare.ts) and
 *     can only ever insert a submission row. A homeowner on their couch can't
 *     touch app state, by construction.
 *   • Phone-first: the homeowner opens this from a text message. Swatch grids,
 *     dropdowns and write-ins reuse the Selections tab's own .sel-* styles so
 *     the two forms always look related.
 *
 * ISOLATION/DEMO MODE: with no Supabase keys (npm run dev -- --mode isolation),
 * open #/select/demo to browser-verify the page against the default catalog —
 * fetching and submitting are simulated. Any other token without a backend
 * shows the "link not active" screen.
 */
import { useEffect, useState } from 'react'
import '../App.css' // this page mounts outside <App>, so pull the styles in ourselves
import type { Project, SelectionChoice, SelectionSharePayload, ShareSubmissionChoices } from '../types'
import {
  buildSharePayload,
  fetchShare,
  openSharePrint,
  submitShare,
} from '../lib/selectionShare'
import { hasSupabase } from '../lib/supabase'
import Icon from './Icon'

/** Where the page is in its little life. */
type Phase = 'loading' | 'bad' | 'form' | 'sending' | 'sent'

/** A demo snapshot for isolation-mode verification (token "demo"): the default
 *  catalog, a pretend address, one pre-filled choice. Lazy imports keep these
 *  modules out of the picture in production use. */
async function demoShare(): Promise<SelectionSharePayload> {
  const [{ defaultCatalog, resolveSelectionSections }, { VENDORS }] = await Promise.all([
    import('../data/selections'),
    import('../data/vendors'),
  ])
  const p = {
    id: 0,
    address: '123 SW Demo Lane',
    city: 'Ocala',
    zip: '34481',
    model: 'F-LH',
    parcel: '0000-000-000',
    subdivision: 'Demo',
    electricCo: '',
    permit: '',
    workOrder: '',
    serviceType: '',
    listStatus: 'InProgress',
    engineer: '',
    waterSource: '',
  } as Project
  const payload = buildSharePayload(
    p,
    { interior: { cabColor: { option: 'White' } }, exterior: {} },
    resolveSelectionSections(defaultCatalog(), 'F'),
    VENDORS,
  )
  // Give one category inline SVG swatches so the demo exercises the photo-grid
  // UI too (data: URIs — no network, works in isolation mode).
  const chip = (fill: string) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70"><rect width="70" height="70" fill="${fill}"/></svg>`,
    )}`
  const colors: Record<string, string> = {
    White: '#f4f2ec', 'Light Gray': '#c9c9c4', Navy: '#27364b',
    'Natural Wood': '#b58a5a', 'Two-tone — see note': '#8a8378',
  }
  for (const sec of payload.sections)
    for (const cat of sec.categories) {
      if (cat.id === 'cabColor')
        cat.optionImages = Object.fromEntries(cat.options.map((o) => [o, chip(colors[o] ?? '#ddd')]))
      // One live Browse ↗ so the demo shows the link treatment too (the real
      // links come from the owner-edited catalog / vendor directory).
      if (cat.id === 'wallPaint') cat.browseUrl = 'https://www.sherwin-williams.com/homeowners/color'
    }
  return payload
}

function PublicSelect({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [payload, setPayload] = useState<SelectionSharePayload | null>(null)
  /** When the client already submitted once, the reopened page says so. */
  const [priorSentAt, setPriorSentAt] = useState<string | null>(null)
  const [choices, setChoices] = useState<ShareSubmissionChoices>({ interior: {}, exterior: {} })
  const [clientName, setClientName] = useState('')
  const [sendError, setSendError] = useState(false)
  const demo = !hasSupabase && token === 'demo'

  useEffect(() => {
    let alive = true
    async function load() {
      if (demo) {
        const p = await demoShare()
        if (!alive) return
        setPayload(p)
        setChoices({ ...p.current })
        setPhase('form')
        return
      }
      const got = await fetchShare(token)
      if (!alive) return
      if (!got) {
        setPhase('bad')
        return
      }
      setPayload(got.payload)
      // Pre-fill with what they last sent (reopening = editing), else with
      // what's already on file at the office.
      setChoices(got.last?.choices ?? { ...got.payload.current })
      if (got.last) {
        setPriorSentAt(got.last.submittedAt)
        setClientName(got.last.clientName)
      }
      setPhase('form')
    }
    load()
    return () => {
      alive = false
    }
  }, [token, demo])

  /** Update one category's choice in local state (nothing saves until Send). */
  function setChoice(area: 'interior' | 'exterior', catId: string, choice: SelectionChoice) {
    setChoices((prev) => ({ ...prev, [area]: { ...prev[area], [catId]: choice } }))
  }

  async function send() {
    if (!payload || !clientName.trim()) return
    setSendError(false)
    setPhase('sending')
    const ok = demo ? true : await submitShare(token, choices, clientName.trim())
    if (ok) {
      setPhase('sent')
      window.scrollTo({ top: 0 })
    } else {
      setPhase('form')
      setSendError(true)
    }
  }

  /* ---------------- screens ---------------- */

  if (phase === 'loading') {
    return (
      <div className="ps-outer">
        <div className="ps-shell">
          <p className="ps-dim">Loading your selections…</p>
        </div>
      </div>
    )
  }

  if (phase === 'bad' || !payload) {
    return (
      <div className="ps-outer">
        <div className="ps-shell">
          <div className="ps-card ps-center">
            <Icon name="link_off" size={34} color="var(--muted)" />
            <h1 className="ps-title">This link isn't active</h1>
            <p className="ps-dim">
              It may have been replaced or turned off. Please contact Iron Shield Construction for a
              fresh link.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const header = (
    <div className="ps-header">
      <img
        className="ps-logo"
        src="/iron-shield-logo.png"
        alt=""
        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
      />
      <div>
        <h1 className="ps-title">Client Selections</h1>
        <p className="ps-dim">
          {payload.address}, {payload.city}, FL {payload.zip}
          {payload.model ? ` · Plan ${payload.model}` : ''}
        </p>
      </div>
    </div>
  )

  if (phase === 'sent') {
    return (
      <div className="ps-outer">
        <div className="ps-shell">
          {header}
          <div className="ps-card ps-center">
            <Icon name="task_alt" size={40} color="var(--success)" fill />
            <h2 className="ps-title">Choices sent — thank you!</h2>
            <p className="ps-dim">
              Iron Shield has your selections{clientName.trim() ? `, ${clientName.trim()}` : ''}.
              Nothing is final yet: we'll review everything with you and you'll sign the printed
              form in person. Changed your mind already? Reopen this same link any time and resend.
            </p>
            <div className="ps-btnrow">
              <button
                className="btn btn-secondary"
                onClick={() => openSharePrint(payload, choices, clientName)}
              >
                <Icon name="print" size={16} />
                Print my choices
              </button>
              <button className="btn btn-secondary" onClick={() => setPhase('form')}>
                <Icon name="edit" size={16} />
                Make a change
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const sending = phase === 'sending'
  return (
    <div className="ps-outer">
      <div className="ps-shell">
        {header}
        <p className="ps-intro">
          Pick your finishes below — tap <b>Browse ↗</b> on any line to look at options on the
          supplier's website, and use the text boxes for anything not listed. When you're done, hit{' '}
          <b>Send to Iron Shield</b> at the bottom. Nothing is final until you sign in person, so
          you can send updates as often as you like.
        </p>
        {priorSentAt && (
          <p className="ps-dim ps-prior">
            <Icon name="history" size={14} /> You sent choices on{' '}
            {new Date(priorSentAt).toLocaleDateString()} — they're filled in below. Edit and resend
            any time.
          </p>
        )}

        {payload.sections.map((section) => (
          <div className="ps-card sel-section" key={section.id}>
            <h3 className="sel-section-title">
              <Icon name={section.icon} size={18} color="var(--rust)" />
              {section.label}
            </h3>
            <div className="sel-rows">
              {section.categories.map((cat) => {
                const choice = choices[section.id]?.[cat.id] ?? {}
                const fieldId = `ps-${section.id}-${cat.id}`
                const hasSwatches =
                  cat.options.length > 0 &&
                  !!cat.optionImages &&
                  cat.options.some((o) => !!cat.optionImages![o])
                return (
                  <div className="sel-row" key={cat.id}>
                    <div className="sel-label">
                      <label htmlFor={fieldId}>{cat.label}</label>
                      {cat.browseUrl && (
                        <a
                          className="sel-browse"
                          href={cat.browseUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Browse options online"
                        >
                          Browse ↗
                        </a>
                      )}
                    </div>
                    <div className={'sel-controls' + (hasSwatches ? ' has-swatches' : '')}>
                      {cat.options.length > 0 &&
                        (hasSwatches ? (
                          <div className="sel-swatches" role="radiogroup" aria-label={cat.label}>
                            {cat.options.map((o) => {
                              const img = cat.optionImages?.[o]
                              const isSel = choice.option === o
                              return (
                                <button
                                  type="button"
                                  key={o}
                                  className={'sel-swatch' + (isSel ? ' selected' : '')}
                                  aria-pressed={isSel}
                                  title={o}
                                  onClick={() =>
                                    setChoice(section.id, cat.id, {
                                      ...choice,
                                      option: isSel ? undefined : o,
                                    })
                                  }
                                >
                                  {img ? (
                                    <img className="sel-swatch-img" src={img} alt="" />
                                  ) : (
                                    <span className="sel-swatch-img sel-swatch-noimg">
                                      <Icon name="image" size={18} />
                                    </span>
                                  )}
                                  <span className="sel-swatch-label">{o}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <select
                            id={fieldId}
                            className="sel-select"
                            value={choice.option ?? ''}
                            onChange={(e) =>
                              setChoice(section.id, cat.id, {
                                ...choice,
                                option: e.target.value || undefined,
                              })
                            }
                          >
                            <option value="">— choose —</option>
                            {cat.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ))}
                      <input
                        id={cat.options.length === 0 ? fieldId : undefined}
                        className="sel-writein"
                        value={choice.writeIn ?? ''}
                        placeholder={
                          cat.hint
                            ? `${cat.hint}…`
                            : cat.options.length
                              ? 'Other / notes…'
                              : 'Type choice…'
                        }
                        onChange={(e) =>
                          setChoice(section.id, cat.id, {
                            ...choice,
                            writeIn: e.target.value || undefined,
                          })
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div className="ps-card sel-section">
          <h3 className="sel-section-title">
            <Icon name="edit_note" size={18} color="var(--rust)" />
            Additional Requests
          </h3>
          <textarea
            className="sel-additional"
            rows={4}
            value={choices.additionalRequests ?? ''}
            placeholder="Anything not listed above — special requests, upgrades, notes. (Subject to builder review; may affect cost or timeline.)"
            onChange={(e) =>
              setChoices((prev) => ({ ...prev, additionalRequests: e.target.value || undefined }))
            }
          />
        </div>

        <div className="ps-card ps-send">
          <label className="sel-lock-field ps-name">
            YOUR NAME
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="So we know who sent this"
              autoComplete="name"
            />
          </label>
          <div className="ps-btnrow">
            <button
              className="btn btn-primary"
              disabled={sending || !clientName.trim()}
              onClick={send}
            >
              <Icon name="send" size={16} />
              {sending ? 'Sending…' : 'Send to Iron Shield'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => openSharePrint(payload, choices, clientName)}
            >
              <Icon name="print" size={16} />
              Print
            </button>
          </div>
          {!clientName.trim() && <p className="ps-dim">Add your name to send.</p>}
          {sendError && (
            <p className="ps-error">
              Couldn't send — please check your connection and try again, or call the office.
            </p>
          )}
          <p className="ps-dim">
            Nothing is final until you review and sign in person with Iron Shield Construction.
          </p>
        </div>
      </div>
    </div>
  )
}

export default PublicSelect
