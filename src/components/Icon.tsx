/**
 * Icon.tsx — the app's single icon primitive (from the Claude Design system).
 *
 * Renders a Material Symbols Outlined glyph by its ligature *name* (the font
 * turns the text "water_drop" into the droplet glyph). This is meant to replace
 * the app's emoji over time. Color inherits via `currentColor` unless overridden.
 *
 *   <Icon name="water_drop" />
 *   <Icon name="star" fill color="var(--gold)" />   // FILL=1 for brand/active
 *
 * The font is loaded in index.html; the family lives in --font-icon.
 */
import type { CSSProperties } from 'react'

interface Props {
  /** Material Symbols ligature name, e.g. "bolt", "water_drop", "check". */
  name: string
  /** Glyph size in px (default 20). */
  size?: number
  /** FILL=1 — use for active/brand glyphs (a filled star, a solid check). */
  fill?: boolean
  /** Optical weight 100–700 (default 400). */
  weight?: number
  /** Any CSS color; defaults to inheriting the surrounding text color. */
  color?: string
  className?: string
  style?: CSSProperties
  /** Native tooltip. */
  title?: string
}

function Icon({ name, size = 20, fill = false, weight = 400, color = 'currentColor', className, style, title }: Props) {
  return (
    <span
      aria-hidden
      title={title}
      className={'msi' + (className ? ' ' + className : '')}
      style={{
        fontFamily: 'var(--font-icon)',
        fontWeight: 'normal',
        fontStyle: 'normal',
        fontFeatureSettings: "'liga'",
        WebkitFontFeatureSettings: "'liga'",
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'opsz' ${size}`,
        fontSize: typeof size === 'number' ? `${size}px` : size,
        lineHeight: 1,
        color,
        display: 'inline-flex',
        flex: '0 0 auto',
        userSelect: 'none',
        // Keep ligatures intact even inside UPPERCASE / letter-spaced parents —
        // otherwise "bolt" → "BOLT" and the glyph name no longer matches.
        textTransform: 'none',
        letterSpacing: 'normal',
        whiteSpace: 'nowrap',
        wordWrap: 'normal',
        direction: 'ltr',
        ...style,
      }}
    >
      {name}
    </span>
  )
}

export default Icon
