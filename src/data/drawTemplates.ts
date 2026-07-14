/**
 * drawTemplates.ts — the DRAW SCHEDULE templates behind the 💵 Draws tab.
 *
 * A construction loan pays out in DRAWS: when a stage of the build is done
 * (foundation poured, framing up, dry-in…), the builder sends the lender an
 * "official draw request" and gets that stage's money. Every lender/contract
 * slices the stages a little differently — so the schedules here are TEMPLATES:
 * starting a house's draw tracking copies one onto the project, where every
 * stage, amount, and checklist item can then be tuned for that contract
 * without touching the template.
 *
 * Owner-editable the same way vendors/selections are: these code defaults seed
 * the blob on first run; after that 🛠 Settings → Draw schedule templates owns
 * the list (see WorkbenchState.drawTemplates + migrate()).
 *
 * The two built-ins are modeled on REAL Iron Shield paperwork (July 2026):
 *  • 'numbered'  — the flat numbered draws used with the spec-home lender
 *                  ("3rd Draw Request - <address>" emails, evidence attached).
 *  • 'bank-pct'  — the staged bank schedule from the Burns/Luminate build
 *                  ("draw schedule - Burns.pdf": permit 10% → … → retainage).
 */

/** One stage of a draw schedule (template form — no progress state). */
export interface DrawStage {
  id: string
  /** How Adam & the lender name it: "3rd Draw", "Completion of Dry In"… */
  label: string
  /** Display hint: "$45,000" or "10%" — free text, tuned per contract. */
  amount?: string
  /** What must be true (and often ATTACHED as proof) before requesting. */
  items: string[]
}

export interface DrawTemplate {
  id: string
  name: string
  /** One line shown in the template picker. */
  description?: string
  /** Default lender for projects started from this template (both optional —
   *  each project can override them when draw tracking starts). */
  lender?: string
  email?: string
  stages: DrawStage[]
}

export const DRAW_TEMPLATES_DEFAULT: DrawTemplate[] = [
  {
    id: 'numbered',
    name: 'Numbered draws — spec home',
    description:
      'Flat numbered draws ("1st Draw", "2nd Draw"…) tied to build milestones, requested by email with inspection proof attached. Tune the amounts to the loan.',
    stages: [
      {
        id: 'd1',
        label: '1st Draw',
        items: ['Lot cleared / pad prepped', 'Stem wall + slab poured', 'Slab survey received'],
      },
      {
        id: 'd2',
        label: '2nd Draw',
        items: ['Block walls up', 'Lintel poured', 'Lintel inspection passed (attach approval)'],
      },
      {
        id: 'd3',
        label: '3rd Draw',
        items: ['Trusses set', 'Framing + sheathing complete', 'Framing inspection passed'],
      },
      {
        id: 'd4',
        label: '4th Draw',
        items: ['Dried in — roof felt/shingles', 'Windows + exterior doors set'],
      },
      {
        id: 'd5',
        label: '5th Draw',
        items: [
          'Rough electric / plumbing / HVAC passed',
          'Insulation in',
          'Drywall hung',
        ],
      },
      {
        id: 'd6',
        label: '6th Draw',
        items: ['Cabinets + interior trim set', 'Paint + flooring done', 'Fixtures going in'],
      },
      {
        id: 'd7',
        label: '7th Draw',
        items: ['Final inspections passed', 'C.O. issued (attach it)', 'Punch list complete'],
      },
    ],
  },
  {
    id: 'bank-pct',
    name: 'Bank schedule — staged completions',
    description:
      'The bank-style schedule (permit 10% → foundation → framing → dry-in → rough-ins → trim-out → substantial completion → final retainage). Stage names match the lender\'s own draw sheet.',
    stages: [
      { id: 'permit', label: 'Receipt of Permit', amount: '10%', items: ['Building permit issued (attach it)'] },
      {
        id: 'foundation',
        label: 'Completion of Foundation',
        items: ['Excavation done', 'Footings poured', 'Foundation complete'],
      },
      {
        id: 'framing',
        label: 'Completion of Rough Framing',
        items: ['Walls + roof framed and sheathed', 'Subflooring in', 'Interior partitions framed'],
      },
      {
        id: 'dryin',
        label: 'Completion of Dry In',
        items: ['Roofing on', 'Siding on', 'Windows + exterior doors set'],
      },
      {
        id: 'roughins',
        label: 'Completion of Rough Ins',
        items: [
          'Rough HVAC / electrical / plumbing done',
          'Tubs + showers set',
          'Insulation in',
          'Flatwork poured',
        ],
      },
      {
        id: 'trimout',
        label: 'Completion of Trim Out',
        items: [
          'Drywall finished',
          'Interior doors + trim hung',
          'Cabinets + countertops set',
          'Finish flooring down',
        ],
      },
      {
        id: 'substantial',
        label: 'Substantial Completion',
        items: ['Finish plumbing + electric done', 'Carpeting in', 'Garage doors installed'],
      },
      { id: 'retainage', label: 'Final Retainage — 100% complete', amount: '5%', items: ['C.O. issued (attach it)', 'Final walkthrough done'] },
    ],
  },
]
