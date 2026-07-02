import { describe, it, expect } from 'vitest'
import { scanHealth, scanPending } from './scanHealth'

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

describe('scanPending() — the "Scan now" button state', () => {
  const LAST = '2026-07-02T05:30:00'

  it('false with no request (or no meta at all)', () => {
    expect(scanPending(undefined, NOW)).toBe(false)
    expect(scanPending({ lastScanAt: LAST }, NOW)).toBe(false)
  })

  it('pending while a fresh request is newer than the last scan', () => {
    expect(scanPending({ lastScanAt: LAST, requestedAt: '2026-07-02T11:55:00' }, NOW)).toBe(true)
  })

  it('pending even before the scanner has EVER completed a run', () => {
    expect(scanPending({ requestedAt: '2026-07-02T11:55:00' }, NOW)).toBe(true)
  })

  it('cleared once a completed scan stamps AFTER the request', () => {
    expect(scanPending({ lastScanAt: '2026-07-02T11:58:00', requestedAt: '2026-07-02T11:55:00' }, NOW)).toBe(false)
  })

  it('expires after 30 min unanswered (Mac was off — button re-offers)', () => {
    expect(scanPending({ lastScanAt: LAST, requestedAt: '2026-07-02T11:20:00' }, NOW)).toBe(false)
  })
})
