/**
 * useDensity.ts — "comfortable" vs "compact" spacing.
 *
 * Done EXACTLY like dark mode (compare hooks/useTheme.ts on purpose): we flip
 * a data-attribute on the <html> element and let CSS do all the resizing.
 * Comfortable = the normal roomy layout; compact = tighter rows and smaller
 * tiles so more fits on screen. No component needs to know this exists.
 */
import { useEffect, useState } from 'react'

type Density = 'comfortable' | 'compact'
const DENSITY_KEY = 'isc_density'

export function useDensity() {
  // Read the saved choice once; default to comfortable.
  const [density, setDensity] = useState<Density>(
    () => (localStorage.getItem(DENSITY_KEY) as Density) ?? 'comfortable',
  )

  // On change: tag <html> (CSS reacts) and remember the choice.
  useEffect(() => {
    document.documentElement.dataset.density = density
    localStorage.setItem(DENSITY_KEY, density)
  }, [density])

  /** Flip comfortable ↔ compact. */
  function toggle() {
    setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))
  }

  return { density, toggle }
}
