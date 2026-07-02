/**
 * GuideView.tsx — the 📖 Guide screen (reached from the header More menu). The
 * full Playbook: every workflow as a step-by-step guide a new operator can read
 * start-to-finish. Pure presentation — all content lives in data/guides.ts and
 * renders through GuideCallout (same component the inline callouts use).
 */
import GuideCallout from './GuideCallout'
import { GUIDES, WHO, type GuideWho } from '../data/guides'

const LEGEND: GuideWho[] = ['you', 'claude', 'app', 'wait']

function GuideView() {
  return (
    <section className="guide-view">
      <h2>📖 Guide</h2>
      <p className="muted">
        How to run each workflow in the app, step by step — written so anyone can pick it up. Each step shows who does it:
      </p>
      <div className="guide-legend">
        {LEGEND.map((w) => (
          <span key={w} className="guide-legend-item">
            {/* the label text right next to it says the same thing, so the
                emoji is decorative here — aria-hidden stops screen readers
                reading "person… You" double-speak */}
            <span aria-hidden="true">{WHO[w].icon}</span> {WHO[w].label}
          </span>
        ))}
      </div>
      <div className="guide-list">
        {GUIDES.map((g) => (
          <GuideCallout key={g.id} id={g.id} defaultOpen />
        ))}
      </div>
    </section>
  )
}

export default GuideView
