/**
 * Hideable.tsx — the "🪄 Customize page" machinery (Aug 2026).
 *
 * Adam's ask: hide the sections he doesn't want on a page ("on the materials
 * page there's sections I just want gone") WITHOUT a code round-trip each
 * time. So every tune-able section on a Detail stream tab is wrapped in
 * <Hideable id label>, and the tab provides a TidyContext that says:
 *
 *   • on        — is customize mode active right now? (a local toggle,
 *                 admin-only button in Detail)
 *   • isHidden  — is this section id hidden on THIS page? (from the cloud
 *                 blob's hiddenSections — persists on every device)
 *   • toggle    — flip a section's hidden state (one setState in useProjects)
 *
 * Rendering rules (the whole trick):
 *   normal mode + visible → children, untouched — zero overhead.
 *   normal mode + hidden  → nothing at all. The section is just gone.
 *   customize mode        → EVERY wrapped section shows, each with an
 *                           eye-chip; hidden ones render dimmed so you can
 *                           see what you're missing before bringing it back.
 *
 * Components rendered OUTSIDE a provider (e.g. GuideCallout on the 📖 Guide
 * screen) fall back to the default context — never hidden, never in
 * customize mode — so wrapping is always safe.
 */
import { createContext, useContext, type ReactNode } from 'react'
import Icon from './Icon'

export interface TidyCtl {
  /** Customize mode active (the wand button in Detail). */
  on: boolean
  /** Is this section hidden on the current page? */
  isHidden: (id: string) => boolean
  /** Flip a section's hidden state on the current page. */
  toggle: (id: string) => void
}

/** Safe defaults for anywhere without a provider: nothing hidden, no chips. */
export const TidyContext = createContext<TidyCtl>({
  on: false,
  isHidden: () => false,
  toggle: () => {},
})

interface Props {
  /** Stable section id — this is what's stored in the blob, so renaming one
   *  orphans saved hides (they'd just no longer apply; harmless but avoid). */
  id: string
  /** Human label on the customize chip ("Contact buttons", "Notes box"). */
  label: string
  children: ReactNode
}

export default function Hideable({ id, label, children }: Props) {
  const tidy = useContext(TidyContext)
  const hidden = tidy.isHidden(id)

  // Normal mode: hidden sections vanish entirely; visible ones render bare.
  if (!tidy.on) return hidden ? null : <>{children}</>

  // Customize mode: chip + (dimmed-when-hidden) content.
  return (
    <div className={'hideable' + (hidden ? ' is-hidden' : '')}>
      <button
        className="hideable-chip"
        onClick={() => tidy.toggle(id)}
        title={hidden ? `Show "${label}" on this page again` : `Hide "${label}" from this page`}
      >
        <Icon name={hidden ? 'visibility_off' : 'visibility'} size={14} />
        {label}
        <span className="hideable-state">{hidden ? 'hidden' : 'shown'}</span>
      </button>
      <div className="hideable-body">{children}</div>
    </div>
  )
}
