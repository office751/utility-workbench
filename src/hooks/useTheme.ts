/**
 * useTheme.ts — dark mode in ~25 lines.
 *
 * How it works: index.css defines two sets of CSS variables — the defaults
 * (light) and an override set under `:root[data-theme="dark"]`. This hook
 * just flips that attribute on the <html> element and remembers the choice.
 *
 * Note: this is the ONE other thing we keep in localStorage besides project
 * data. It's a device preference (this monitor, this person), not project
 * data — so it deliberately does NOT live inside useProjects(), and won't
 * move to the database if we ever add one.
 */
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const THEME_KEY = 'isc_theme'

export function useTheme() {
  // Read the saved choice once; default to light.
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme) ?? 'light',
  )

  // Whenever the theme changes: tag <html> (CSS reacts) and save the choice.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  /** Flip light ↔ dark. */
  function toggle() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  return { theme, toggle }
}
