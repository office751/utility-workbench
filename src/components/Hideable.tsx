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
import { createContext, useContext, useState, type ReactNode } from 'react'
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

/**
 * TidyPage — the whole customize apparatus for ONE page in a self-contained
 * wrapper: hosts the on/off state, renders the admin-only "Customize page"
 * bar, and provides the TidyContext its children's <Hideable> wrappers read.
 * Used by top-level pages (🏠 Today); Detail hosts its own provider because
 * its page key changes with the active tab.
 */
export function TidyPage({
  page,
  hiddenSections,
  toggle,
  canCustomize,
  children,
}: {
  /** The hiddenSections key this page's hides live under (e.g. 'today'). */
  page: string
  hiddenSections?: Record<string, string[]>
  /** useProjects.toggleHiddenSection */
  toggle: (page: string, section: string) => void
  /** Admin-only (canManageSettings) — others never see the bar. */
  canCustomize: boolean
  children: ReactNode
}) {
  const [on, setOn] = useState(false)
  return (
    <TidyContext.Provider
      value={{
        on,
        isHidden: (id) => (hiddenSections?.[page] ?? []).includes(id),
        toggle: (id) => toggle(page, id),
      }}
    >
      {canCustomize && (
        <div className="tidy-bar">
          {on && (
            <span className="muted">
              Click a section's eye to hide/show it on this page — for everyone, on every device.
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setOn((t) => !t)}>
            <Icon name={on ? 'task_alt' : 'tune'} size={15} />
            {on ? ' Done customizing' : ' Customize page'}
          </button>
        </div>
      )}
      {children}
    </TidyContext.Provider>
  )
}

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
