/**
 * GuideCallout.tsx — a collapsible "how this works" guide, rendered from
 * data/guides.ts. Drop <GuideCallout id="apply-duke" /> next to an action
 * button for an in-the-moment explainer, or <GuideCallout id=… defaultOpen />
 * inside the 📖 Guide screen for the full, always-open manual. One component,
 * one source of truth — edit the steps in data/guides.ts.
 */
import { useState } from 'react'
import { WHO, guideById } from '../data/guides'

interface Props {
  id: string
  /** Open on mount (the Guide screen passes this; inline callouts stay closed). */
  defaultOpen?: boolean
}

function GuideCallout({ id, defaultOpen = false }: Props) {
  const guide = guideById(id)
  const [open, setOpen] = useState(defaultOpen)
  if (!guide) return null // unknown id — render nothing rather than break the page

  return (
    <div className={'guide-callout' + (open ? ' open' : '')}>
      <button className="guide-callout-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          {guide.icon} How this works — {guide.title}
        </span>
        <span className="guide-chev" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="guide-callout-body">
          <p className="guide-when">{guide.when}</p>
          <ol className="guide-steps">
            {guide.steps.map((s, i) => (
              <li key={i} className="guide-step">
                <span className="guide-who" title={WHO[s.who].label}>
                  {WHO[s.who].icon}
                </span>
                <span className="guide-step-text">{s.text}</span>
              </li>
            ))}
          </ol>
          {guide.tip && <p className="guide-tip">💡 {guide.tip}</p>}
        </div>
      )}
    </div>
  )
}

export default GuideCallout
