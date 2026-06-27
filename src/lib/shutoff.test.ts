import { describe, it, expect } from 'vitest'
import { addBusinessDays } from './shutoff'

// The shut-off deadline = 2 BUSINESS days after closing. Weekend-skipping math
// drives a real deadline on the Today screen, so it's worth pinning down.
describe('addBusinessDays', () => {
  it('skips the weekend: Friday + 1 business day = Monday', () => {
    const d = addBusinessDays('2026-06-26', 1) // Fri Jun 26 2026
    expect(d.getDay()).toBe(1) // Monday
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5) // June (0-indexed)
    expect(d.getDate()).toBe(29) // jumped over Sat 27 + Sun 28
  })

  it('counts only weekdays: Monday + 3 business days = Thursday', () => {
    const d = addBusinessDays('2026-06-22', 3) // Mon Jun 22 2026
    expect(d.getDay()).toBe(4) // Thursday
    expect(d.getDate()).toBe(25)
  })
})
