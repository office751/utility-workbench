/**
 * draws.test.ts — the 💵 Draws brain (lib/draws.ts). Rules in docs/BRAINS.md
 * ("Draws"): status is derived never stored, empty checklist can't be 'ready'
 * ("can't tell" beats guessing), the draft never ships a silent blank, and
 * template instantiation must produce fresh ids (no aliasing).
 */
import { describe, expect, it } from 'vitest'
import type { Project, ProjectDraw, ProjectFinancials } from '../types'
import type { DrawTemplate } from '../data/drawTemplates'
import { DRAW_TEMPLATES_DEFAULT } from '../data/drawTemplates'
import {
  blankDraw,
  drawRequestDraft,
  drawStatus,
  drawsSummary,
  instantiateDraws,
  nextDraw,
} from './draws'

const P: Project = {
  id: 1,
  address: '4 Fisher Lane Trak',
  city: 'Ocklawaha',
  zip: '32179',
  model: 'Model A',
  parcel: '9002-0123-45',
  subdivision: '',
  electricCo: 'SECO',
  permit: '',
  workOrder: '',
  serviceType: '',
  listStatus: 'NotApplied',
  engineer: '',
  waterSource: '',
}

const draw = (over: Partial<ProjectDraw> = {}): ProjectDraw => ({
  id: 'd1',
  label: '5th Draw',
  amount: '$45,000',
  items: [
    { id: 'i1', text: 'Rough inspections passed', done: true },
    { id: 'i2', text: 'Insulation in', done: true },
  ],
  ...over,
})

const fin = (over: Partial<ProjectFinancials> = {}): ProjectFinancials => ({
  lender: 'FLONBE Holdings',
  lenderEmail: 'flonbeholdings@gmail.com',
  draws: [draw()],
  ...over,
})

describe('drawStatus — derived, never stored', () => {
  it('funded beats requested beats ready', () => {
    expect(drawStatus(draw({ requestedOn: '2026-07-01', fundedOn: '2026-07-10' }))).toBe('funded')
    expect(drawStatus(draw({ requestedOn: '2026-07-01' }))).toBe('requested')
    expect(drawStatus(draw())).toBe('ready')
  })

  it('any unchecked item → upcoming', () => {
    expect(drawStatus(draw({ items: [{ id: 'i1', text: 'x', done: true }, { id: 'i2', text: 'y' }] }))).toBe('upcoming')
  })

  it("an EMPTY checklist stays 'upcoming' — no items ≠ ready (can't tell beats guessing)", () => {
    expect(drawStatus(draw({ items: [] }))).toBe('upcoming')
  })
})

describe('instantiateDraws — a template becomes THIS contract\'s own copy', () => {
  it('copies every stage with fresh unique ids (no aliasing between projects)', () => {
    const t = DRAW_TEMPLATES_DEFAULT[0]
    const a = instantiateDraws(t)
    const b = instantiateDraws(t)
    expect(a).toHaveLength(t.stages.length)
    expect(a[0].label).toBe(t.stages[0].label)
    expect(a[0].items.map((i) => i.text)).toEqual(t.stages[0].items)
    // Fresh ids per copy — two houses started from one template never share.
    const ids = new Set([...a, ...b].map((d) => d.id))
    expect(ids.size).toBe(a.length + b.length)
    expect(a[0].items[0].id).not.toBe(b[0].items[0].id)
  })

  it('items start unchecked and nothing is requested/funded', () => {
    const t: DrawTemplate = { id: 't', name: 'T', stages: [{ id: 's', label: '1st Draw', amount: '10%', items: ['Permit issued'] }] }
    const [d] = instantiateDraws(t)
    expect(d.amount).toBe('10%')
    expect(d.items[0].done).toBeUndefined()
    expect(drawStatus(d)).toBe('upcoming')
  })

  it('blankDraw() is an empty, add-your-own draw', () => {
    const d = blankDraw()
    expect(d.items).toEqual([])
    expect(drawStatus(d)).toBe('upcoming')
  })
})

describe('nextDraw / drawsSummary — the header line', () => {
  it('next = first draw not yet requested or funded', () => {
    const f = fin({
      draws: [
        draw({ id: 'a', label: '1st Draw', fundedOn: '2026-05-01' }),
        draw({ id: 'b', label: '2nd Draw', requestedOn: '2026-07-01' }),
        draw({ id: 'c', label: '3rd Draw' }),
      ],
    })
    expect(nextDraw(f)?.id).toBe('c')
    expect(drawsSummary(f)).toBe('1 of 3 funded · next: 3rd Draw')
  })

  it('everything at least requested → no next to chase', () => {
    const f = fin({ draws: [draw({ requestedOn: '2026-07-01' })] })
    expect(nextDraw(f)).toBeNull()
    expect(drawsSummary(f)).toBe('0 of 1 funded')
  })
})

describe('drawRequestDraft — the official draw request in Adam\'s wording', () => {
  it('subject matches the real sent pattern: "<label> Request - <address>, <city>"', () => {
    const d = drawRequestDraft(P, fin(), draw())
    expect(d.subject).toBe('5th Draw Request - 4 Fisher Lane Trak, Ocklawaha')
  })

  it('body carries the official-request line, and only CHECKED items as evidence', () => {
    const d = drawRequestDraft(P, fin(), draw({ items: [
      { id: 'i1', text: 'Rough inspections passed', done: true },
      { id: 'i2', text: 'Insulation in' }, // not done — must NOT be claimed
    ] }))
    expect(d.body).toContain('official draw request')
    expect(d.body).toContain('$45,000 as the 5th Draw on 4 Fisher Lane Trak, Ocklawaha, FL 32179.')
    expect(d.body).toContain('• Rough inspections passed')
    expect(d.body).not.toContain('Insulation')
  })

  it('never ships a silent blank: missing amount → loud [FILL IN] marker', () => {
    const d = drawRequestDraft(P, fin(), draw({ amount: undefined }))
    expect(d.body).toContain('[FILL IN — amount]')
  })

  it('loan number renders as its own line only when set (FACO style)', () => {
    const withLoan = drawRequestDraft(P, fin({ loanNumber: '126863' }), draw())
    expect(withLoan.body).toContain('Loan #126863')
    const without = drawRequestDraft(P, fin(), draw())
    expect(without.body).not.toContain('Loan #')
  })

  it('routes to the lender email, CCs office@, and the mailto is fully encoded', () => {
    const d = drawRequestDraft(P, fin(), draw())
    expect(d.to).toBe('flonbeholdings@gmail.com')
    expect(d.mailto).toContain('mailto:flonbeholdings@gmail.com?cc=office%40ironshieldconstruction.com')
    expect(d.mailto).not.toContain(' ') // spaces must be %20-encoded
  })

  it('honors a Settings → Templates override for the wording', () => {
    const d = drawRequestDraft(P, fin(), draw(), { 'draw:request': { subject: 'Draw {{label}} for {{parcel}}' } })
    expect(d.subject).toBe('Draw 5th Draw for 9002-0123-45')
  })

  it('no sign-off in the default body (the mail client appends the real signature)', () => {
    const d = drawRequestDraft(P, fin(), draw())
    expect(d.body).not.toMatch(/adam|iron shield construction llc/i)
  })
})
