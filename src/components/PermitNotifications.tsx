/**
 * PermitNotifications.tsx — the 🔔 for ONE permit.
 *
 * Shows FYI notes the county-portal scanner pulled in (e.g. "DEP construction
 * permit received"). The badge counts UNdismissed ones; clicking opens a panel
 * where you can dismiss each. Dismissed notes don't vanish — they drop under a
 * "Dismissed" divider so there's always a history under the bell.
 *
 * Renders nothing if the permit has no notes at all (no clutter).
 */
import { useState } from 'react'
import type { PermitNote } from '../types'

interface Props {
  notes: PermitNote[]
  onDismiss: (sourceKey: string) => void
}

function PermitNotifications({ notes, onDismiss }: Props) {
  const [open, setOpen] = useState(false)
  if (!notes || notes.length === 0) return null

  const active = notes.filter((n) => !n.dismissed)
  const dismissed = notes.filter((n) => n.dismissed)

  return (
    <div className="permit-notices">
      <button
        className={'notice-bell' + (active.length ? ' has' : '')}
        onClick={() => setOpen((o) => !o)}
        title="Portal notifications"
      >
        🔔
        {active.length > 0 && <span className="notice-badge">{active.length}</span>}
      </button>

      {open && (
        <div className="notice-panel">
          {active.map((n) => (
            <div key={n.sourceKey} className="notice">
              <div className="notice-text">
                {n.text}
                {n.date && <span className="muted"> · {n.date}</span>}
              </div>
              <button className="doc-btn" onClick={() => onDismiss(n.sourceKey)}>
                Dismiss
              </button>
            </div>
          ))}

          {dismissed.length > 0 && (
            <>
              <div className="notice-divider">Dismissed</div>
              {dismissed.map((n) => (
                <div key={n.sourceKey} className="notice dismissed">
                  <div className="notice-text">
                    {n.text}
                    {n.date && <span className="muted"> · {n.date}</span>}
                  </div>
                </div>
              ))}
            </>
          )}

          {active.length === 0 && <p className="notice-allclear muted">All caught up 🎉</p>}
        </div>
      )}
    </div>
  )
}

export default PermitNotifications
