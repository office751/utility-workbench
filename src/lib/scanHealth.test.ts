import { describe, it, expect } from 'vitest'
import { scanHealth } from './scanHealth'

// A fixed "now" so results never depend on when the tests actually run.
const NOW = new Date('2026-07-02T12:00:00')

const at = (iso: string) => scanHealth({ lastScanAt: iso }, NOW)

describe('scanHealth()', () => {
  it('stays quiet (null) before the scanner has ever stamped', () => {
    expect(scanHealth(undefined, NOW)).toBeNull()
    expect(scanHealth({ lastScanAt: 'not a date' }, NOW)).toBeNull()
  })

  it('ok when it ran this morning', () => {
    const h = at('2026-07-02T05:30:00')
    expect(h?.level).toBe('ok')
    expect(h?.agoLabel).toMatch(/^today at/)
  })

  it('still ok within normal daily jitter (< 36h)', () => {
    // yesterday 5:30 AM, viewed at noon today = ~30.5h — one run cycle, fine
    const h = at('2026-07-01T05:30:00')
    expect(h?.level).toBe('ok')
    expect(h?.agoLabel).toMatch(/^yesterday at/)
  })

  it('warn once a whole night has truly been missed (≥ 36h)', () => {
    expect(at('2026-06-30T22:00:00')?.level).toBe('warn') // 38h
  })

  it('crit after three nights dark (≥ 72h)', () => {
    const h = at('2026-06-28T05:30:00') // ~4 days
    expect(h?.level).toBe('crit')
    expect(h?.agoLabel).toMatch(/days ago$/)
  })
})
