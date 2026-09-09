/**
 * runbook.ts — the BRAINS of the Monday Runbook view (no React here).
 *
 * Reads one Construction Job List item (a house) plus its subitems (the
 * checklist steps), decides which step is next, and knows what button each
 * step gets. The step lists come straight from Lodestar's lifecycles.ts, so
 * Monday and Lodestar can never disagree about the process.
 *
 * Column ids are the live Construction Job List board's (Sep 2026). If a
 * column is ever deleted and recreated, update the id here.
 */
import type { Project, ProjectState, SepticSource, SepticSystem, WaterSource } from '../types'
import type { StepDef } from '../data/lifecycles'
import { closingSteps, electricSteps, permitSteps, septicStepsFor, waterStepsFor } from '../data/lifecycles'
import { applicationDraft, meterNotifyDraft } from '../lib/loadForm'
import { dukeWebPayloadText, DUKE_PORTAL_URL } from '../lib/dukeWebApply'
import { ELECTRIC_DISCONNECT, MCU_WATER_DISCONNECT, waterDisconnectDraft } from '../data/disconnect'
import { GEORGES, MARION_PERMITTING, MCU, OFFICE_CC, SECO_EMAIL, SOIL_TECH, UTILITY_PHONES } from '../data/contacts'
import { dukeOfficeEmail } from '../lib/loadForm'
import { addBusinessDays } from '../lib/shutoff'
import { api } from './mondayClient'

export const CJL_BOARD_ID = 18429393869
export const SUBITEM_BOARD_ID = 18429428473
/** The editable "Runbook Template" board — one item per step (Sep 2026). */
export const TEMPLATE_BOARD_ID = 18430320313
export const TEMPLATE_BOARD_URL = `https://the-network-empire.monday.com/boards/${TEMPLATE_BOARD_ID}`
const TCOL = { stage: 'color_mm71eac2', order: 'numeric_mm71jmpr', applies: 'dropdown_mm71c4gw', tip: 'long_text_mm71yc3e', key: 'text_mm71pvdw' } as const
export const ORDERS_BOARD_URL = 'https://the-network-empire.monday.com/boards/18430202808'
export const LODESTAR_URL = 'https://utility-workbench.vercel.app'
const ENERGOV_HOME = 'https://selfservice.marionfl.org/energov_prod/selfservice#/home'
const ELECTRIC_GIS = 'https://data-marioncountyfl.opendata.arcgis.com/datasets/electric-service-areas/explore'

/** Construction Job List column ids (title → id). */
export const COL = {
  city: 'color_mm6tst06',
  zip: 'text_mm6tnvs7',
  subdivision: 'text_mm6t5yrb',
  parcel: 'text_mm6ts07h',
  model: 'color_mm6tn9g1',
  owner: 'color_mm6tbyec',
  permit: 'text_mm6tm77m',
  permitStatus: 'color_mm6tnewf',
  electricCo: 'color_mm6t88t4',
  workOrder: 'text_mm6ta17q',
  electricType: 'color_mm6tmnp0',
  engineer: 'color_mm6tjfs',
  water: 'color_mm6t99zg',
  septic: 'color_mm6txs82',
  inrb: 'color_mm6t6n',
  septicPermit: 'dropdown_mm6ta937',
  notes: 'text_mm6tv3k1',
  permitPortalLink: 'link_mm70j146',
  docsLink: 'link_mm7067xs',
  permitIssued: 'date_mm70mqzh',
  permitExpires: 'date_mm705fwh',
  closingDate: 'date_mm706a54',
  orders: 'board_relation_mm70ted2',
  inspections: 'board_relation_mm707ppw',
} as const

/** Subitems board column ids. */
export const SUB = {
  stage: 'color_mm70zk6q',
  done: 'boolean_mm705k0p',
  doneOn: 'date_mm70bxfv',
  key: 'text_mm70crak',
  order: 'numeric_mm70fn0g',
} as const

export type StageKey = 'permit' | 'electric' | 'water' | 'septic' | 'closing'
export const STAGE_ORDER: StageKey[] = ['permit', 'electric', 'water', 'septic', 'closing']
export const STAGE_TITLE: Record<StageKey, string> = {
  permit: 'Permit',
  electric: 'Electric',
  water: 'Water',
  septic: 'Septic / Sewer',
  closing: 'Closing',
}
/** Label text of the subitems board's Stage status column, per stage. */
const STAGE_LABEL: Record<StageKey, string> = {
  permit: 'Permit',
  electric: 'Electric',
  water: 'Water',
  septic: 'Septic',
  closing: 'Closing',
}

/** One house, as read off its Monday item. */
export interface House {
  id: number
  name: string
  city: string
  zip: string
  subdivision: string
  parcel: string
  model: string
  owner: string
  permit: string
  permitStatus: string
  electricCo: string
  workOrder: string
  electricType: string
  waterLabel: string
  septicLabel: string
  inrbLabel: string
  notes: string
  permitUrl: string
  docsUrl: string
  permitIssued: string
  permitExpires: string
  closingDate: string
  orderCount: number
  inspectionCount: number
}

/** One checklist subitem on the house. */
export interface StepRow {
  subitemId: number
  stage: StageKey
  key: string // '' for a hand-added subitem (no Step Key)
  name: string
  done: boolean
  doneOn: string
}

type ColVal = { id: string; text: string | null; value: string | null; linked_item_ids?: string[] }
type ItemQ = {
  items: {
    id: string
    name: string
    column_values: ColVal[]
    subitems: { id: string; name: string; column_values: ColVal[] }[]
  }[]
}

const ITEM_QUERY = `query ($id: [ID!]) { items(ids: $id) { id name
  column_values { id text value ... on BoardRelationValue { linked_item_ids } }
  subitems { id name column_values { id text value } } } }`

function linkUrl(v: ColVal | undefined): string {
  if (!v?.value) return ''
  try {
    return (JSON.parse(v.value) as { url?: string }).url ?? ''
  } catch {
    return ''
  }
}

export async function loadHouse(itemId: number): Promise<{ house: House; steps: StepRow[] }> {
  const d = await api<ItemQ>(ITEM_QUERY, { id: [String(itemId)] })
  const it = d.items[0]
  if (!it) throw new Error('Item not found')
  const cv = Object.fromEntries(it.column_values.map((c) => [c.id, c]))
  const t = (id: string) => (cv[id]?.text ?? '').trim()
  const house: House = {
    id: Number(it.id),
    name: it.name,
    city: t(COL.city),
    zip: t(COL.zip),
    subdivision: t(COL.subdivision),
    parcel: t(COL.parcel),
    model: t(COL.model),
    owner: t(COL.owner),
    permit: t(COL.permit),
    permitStatus: t(COL.permitStatus),
    electricCo: t(COL.electricCo),
    workOrder: t(COL.workOrder),
    electricType: t(COL.electricType),
    waterLabel: t(COL.water),
    septicLabel: t(COL.septic),
    inrbLabel: t(COL.inrb),
    notes: t(COL.notes),
    permitUrl: linkUrl(cv[COL.permitPortalLink]),
    docsUrl: linkUrl(cv[COL.docsLink]),
    permitIssued: t(COL.permitIssued),
    permitExpires: t(COL.permitExpires),
    closingDate: t(COL.closingDate),
    orderCount: cv[COL.orders]?.linked_item_ids?.length ?? 0,
    inspectionCount: cv[COL.inspections]?.linked_item_ids?.length ?? 0,
  }
  const steps: StepRow[] = []
  for (const s of it.subitems ?? []) {
    const sv = Object.fromEntries(s.column_values.map((c) => [c.id, c]))
    const key = (sv[SUB.key]?.text ?? '').trim() // '' = a hand-added step, kept as an "extra"
    const stageLabel = (sv[SUB.stage]?.text ?? '').trim()
    const stage = (Object.keys(STAGE_LABEL) as StageKey[]).find((k) => STAGE_LABEL[k] === stageLabel) ?? 'permit'
    // Monday returns checked as true (boolean) on read but wants "true" (string) on write.
    let done = false
    try {
      const c = sv[SUB.done]?.value ? (JSON.parse(sv[SUB.done].value as string) as { checked?: unknown }).checked : false
      done = c === true || c === 'true'
    } catch {
      done = false
    }
    steps.push({ subitemId: Number(s.id), stage, key, name: s.name, done, doneOn: (sv[SUB.doneOn]?.text ?? '').trim() })
  }
  return { house, steps }
}

/* ---------------- Monday labels → Lodestar's vocabulary ---------------- */

export function waterSourceOf(h: House): WaterSource {
  const w = h.waterLabel
  if (/wm|main ext/i.test(w)) return 'CityWM'
  if (/city|fgua/i.test(w)) return 'City'
  if (/well/i.test(w)) return 'Well'
  return ''
}
export function septicSourceOf(h: House): SepticSource {
  return /sewer/i.test(h.septicLabel) ? 'Sewer' : 'Septic'
}
export function septicSystemOf(h: House): SepticSystem {
  const s = h.inrbLabel
  if (/atu/i.test(s)) return 'ATU'
  if (/n\/?a/i.test(s)) return 'NA'
  if (s) return 'INRB' // To Type / Typed / Recorded — all mean the lot has an INRB
  return ''
}
export function utilityOf(h: House): string {
  const u = h.electricCo.toUpperCase()
  if (u.startsWith('SECO')) return 'SECO'
  if (u.startsWith('DUKE')) return 'DUKE'
  if (u.startsWith('CLAY')) return 'CLAY'
  return h.electricCo
}

/** Lodestar's helpers want (Project, ProjectState); build both from the house. */
export function toLodestar(h: House): { p: Project; ps: ProjectState } {
  const p: Project = {
    id: h.id,
    address: h.name,
    city: h.city,
    zip: h.zip,
    model: h.model,
    parcel: h.parcel,
    subdivision: h.subdivision,
    electricCo: utilityOf(h),
    permit: h.permit,
    workOrder: h.workOrder,
    serviceType: h.electricType === 'OH' || h.electricType === 'UG' ? h.electricType : '',
    listStatus: 'InProgress',
    engineer: '',
    waterSource: waterSourceOf(h),
  }
  const ps: ProjectState = {
    waterSource: waterSourceOf(h),
    septicSource: septicSourceOf(h),
    septicSystem: septicSystemOf(h),
    closingDate: h.closingDate || undefined,
    permitUrl: h.permitUrl || undefined,
    sharepointUrl: h.docsUrl || undefined,
    permitIssuedDate: h.permitIssued || undefined,
    permitExpiresDate: h.permitExpires || undefined,
    steps: { electric: {}, water: {}, septic: {}, permit: {}, materials: {} },
    notes: { electric: '', water: '', septic: '', permit: '', materials: '' },
  }
  return { p, ps }
}

/* ---------------- The template: which steps this house gets ---------------- */

/** One template row, as read off the Runbook Template board. */
export interface TemplateStep extends StepDef {
  stage: StageKey | '' // '' = no stage set on the template row (flat list)
  order: number
  applies: string[] // 'Applies to' labels
  tip: string
}

export interface Stage {
  key: StageKey
  title: string
  steps: TemplateStep[]
}

type TemplateQ = { boards: { items_page: { items: { id: string; name: string; column_values: ColVal[] }[] } }[] }

/** Read the template board. Empty array = board unreachable/empty → caller falls back to code. */
export async function loadTemplate(): Promise<TemplateStep[]> {
  try {
    const d = await api<TemplateQ>(`{ boards(ids: [${TEMPLATE_BOARD_ID}]) { items_page(limit: 200) { items { id name column_values { id text value } } } } }`)
    const out: TemplateStep[] = []
    for (const it of d.boards[0]?.items_page.items ?? []) {
      const cv = Object.fromEntries(it.column_values.map((c) => [c.id, c]))
      const key = (cv[TCOL.key]?.text ?? '').trim()
      if (!key) continue // a row without a Step Key can't be tracked — skipped
      const stageLabel = (cv[TCOL.stage]?.text ?? '').trim()
      const stage = (Object.keys(STAGE_LABEL) as StageKey[]).find((k) => STAGE_LABEL[k] === stageLabel) ?? ''
      const applies = (cv[TCOL.applies]?.text ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      out.push({ id: key, label: it.name.trim(), stage, order: Number(cv[TCOL.order]?.text || 0) || 0, applies, tip: (cv[TCOL.tip]?.text ?? '').trim() })
    }
    return out.sort((a, b) => a.order - b.order)
  } catch {
    return []
  }
}

/** The 'Applies to' labels a house matches (plus 'All lots'). */
export function profileOf(h: House): Set<string> {
  const set = new Set<string>(['All lots'])
  const w = waterSourceOf(h)
  if (w === 'Well') set.add('Well')
  if (w === 'City') set.add('City water')
  if (w === 'CityWM') { set.add('City water'); set.add('City water + main extension') }
  if (septicSourceOf(h) === 'Sewer') set.add('Sewer')
  else { set.add('Septic'); if (septicSystemOf(h) === 'INRB') set.add('Septic — INRB only') }
  return set
}

/** Code fallback: Lodestar's built-in lists, shaped like template rows. */
function codeTemplate(h: House): TemplateStep[] {
  const { p, ps } = toLodestar(h)
  const mk = (stage: StageKey, steps: StepDef[]): TemplateStep[] => steps.map((s, i) => ({ ...s, stage, order: i, applies: ['All lots'], tip: '' }))
  return [
    ...mk('permit', permitSteps()),
    ...mk('electric', electricSteps()),
    ...mk('water', waterStepsFor(p, ps)),
    ...mk('septic', septicStepsFor(ps)),
    ...mk('closing', closingSteps()),
  ]
}

/** Which template steps this house gets — ONE flat list in template order. */
export function stepsFor(h: House, template: TemplateStep[]): TemplateStep[] {
  const rows = template.length ? template : codeTemplate(h)
  const prof = profileOf(h)
  return rows.filter((t) => !t.applies.length || t.applies.some((a) => prof.has(a))).sort((a, b) => a.order - b.order)
}

/** Kept for callers that still think in stages (subitem Stage label, counters). */
export function stagesFor(h: House, template: TemplateStep[]): Stage[] {
  const steps = stepsFor(h, template)
  return STAGE_ORDER.map((key) => ({ key, title: STAGE_TITLE[key], steps: steps.filter((t) => t.stage === key) }))
}

/** Template steps this house is missing (added to the template after its runbook started). */
export function missingSteps(steps: TemplateStep[], rows: StepRow[]): TemplateStep[] {
  const have = new Set(rows.map((r) => r.key).filter(Boolean))
  return steps.filter((t) => !have.has(t.id))
}

/** Subitems not in the template (removed from it, or added by hand) — still shown, still tickable. */
export function extraRows(steps: TemplateStep[], rows: StepRow[]): StepRow[] {
  const keys = new Set(steps.map((t) => t.id))
  return rows.filter((r) => !r.key || !keys.has(r.key))
}

export interface NextStep {
  step: TemplateStep
  row: StepRow | undefined
}

/** The first unticked step from the top. Closing steps wait until the house
 *  has a Closing Date; the optional "corrections" step is never "next". */
export function nextStep(h: House, steps: TemplateStep[], rows: StepRow[]): NextStep | null {
  const done = new Set(rows.filter((r) => r.done).map((r) => r.key))
  for (const step of steps) {
    if (step.stage === 'closing' && !h.closingDate) continue
    if (step.id === 'corrections') continue
    if (!done.has(step.id)) return { step, row: rows.find((r) => r.key === step.id) }
  }
  return null
}

/* ---------------- Buttons per step ---------------- */

export interface Action {
  label: string
  href?: string // link / mailto: / tel:
  copy?: string // text to put on the clipboard
  special?: 'mark-issued'
  note?: string // shown under the button (e.g. "attach the photos")
}

function mailto(to: string, subject: string, body: string, cc = OFFICE_CC): string {
  return `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
const site = (h: House) => `${h.name}, ${h.city}, FL ${h.zip}`

export function actionsFor(h: House, stage: StageKey | '', stepId: string): Action[] {
  const { p, ps } = toLodestar(h)
  const u = utilityOf(h)
  const phone = UTILITY_PHONES[u]
  const out: Action[] = []
  if (stage === 'permit') {
    if (stepId === 'submitted') out.push({ label: 'Open county portal (EnerGov)', href: h.permitUrl || ENERGOV_HOME })
    if (stepId === 'review' || stepId === 'approved' || stepId === 'corrections') {
      out.push({ label: 'Check permit on portal', href: h.permitUrl || ENERGOV_HOME })
      out.push({ label: `Call Building Safety ${MARION_PERMITTING.phone}`, href: `tel:${MARION_PERMITTING.phone}` })
    }
    if (stepId === 'issued') out.push({ label: 'Mark permit issued (today)', special: 'mark-issued' })
  }
  if (stage === 'electric') {
    if (stepId === 'verify') out.push({ label: 'Check territory on county GIS', href: ELECTRIC_GIS })
    if (stepId === 'submit') {
      if (u === 'SECO') {
        const d = applicationDraft(p, ps)
        if (d) out.push({ label: 'Draft SECO application email', href: d.mailto, note: 'Sign + date the packet before sending.' })
      } else if (u === 'DUKE') {
        out.push({ label: 'Open Duke builder portal', href: DUKE_PORTAL_URL, copy: dukeWebPayloadText(p, ps), note: 'Form answers copied to your clipboard when you click.' })
      }
    }
    if (stepId === 'meternotify') {
      const d = meterNotifyDraft(p, ps)
      if (d) out.push({ label: `Draft "ready for meter" email`, href: d.mailto, note: 'Attach the photos: green tag, downpipe, sweep, straps, clear path.' })
    }
    if (['deposit', 'engineer', 'rough', 'fieldsched', 'fielddone', 'meter', 'power'].includes(stepId)) {
      if (u === 'SECO') out.push({ label: 'Email SECO new construction', href: mailto(SECO_EMAIL, `${site(h)} — ${h.permit ? 'Permit ' + h.permit : 'new service'}`, '') })
      if (u === 'DUKE') out.push({ label: 'Email Duke EDA office', href: mailto(dukeOfficeEmail(ps), `WO#${h.workOrder || '[WO#]'} — ${site(h)}`, '') })
    }
    if (phone) out.push({ label: `Call ${u} ${phone}`, href: `tel:${phone}` })
  }
  if (stage === 'water') {
    const src = waterSourceOf(h)
    if (src !== 'Well') {
      out.push({ label: `Email ${MCU.name}`, href: mailto(MCU.email, `Start Water Service – ${site(h)}`, `Parcel ${h.parcel}${h.permit ? ', Permit ' + h.permit : ''}`) })
      out.push({ label: `Call MCU ${MCU.phone}`, href: `tel:${MCU.phone}` })
    }
  }
  if (stage === 'septic') {
    if (septicSourceOf(h) === 'Sewer') {
      out.push({ label: `Email ${MCU.name}`, href: mailto(MCU.email, `Sewer service – ${site(h)}`, `Parcel ${h.parcel}`) })
      out.push({ label: `Call MCU ${MCU.phone}`, href: `tel:${MCU.phone}` })
    } else {
      if (stepId === 'seval') out.push({ label: `Email ${SOIL_TECH.name} (soil test)`, href: mailto(SOIL_TECH.email, `Soil test – ${site(h)}`, `Parcel ${h.parcel}`) })
      if (stepId === 'snrb') out.push({ label: 'Fill & print the INRB notice in Lodestar', href: LODESTAR_URL, note: 'Septic tab → INRB notice. Sign, notarize, record, then send to Vicki.' })
      if (['sapplied', 'sissued', 'scounty', 'sinstalled', 'snwell', 'snwater', 'snsod', 'sapproved', 'snrb'].includes(stepId)) {
        const what = stepId === 'snwell' ? 'well installed' : stepId === 'snwater' ? 'water line hooked up' : stepId === 'snsod' ? 'SOD laid' : 'update'
        out.push({ label: `Email Vicki (Georges) — ${what}`, href: mailto(GEORGES.email, `${site(h)} — ${what}`, `Hi Vicki,\n\n${site(h)}: ${what}.\n\n`) })
        out.push({ label: `Call Georges ${GEORGES.phone}`, href: `tel:${GEORGES.phone}` })
      }
    }
  }
  if (stage === 'closing') {
    if (stepId === 'estop' || stepId === 'xfer') {
      const d = ELECTRIC_DISCONNECT[u]
      if (d) out.push({ label: `Stop ${u} service (online form)`, href: d.url })
      if (d?.phone) out.push({ label: `Call ${u} ${d.phone}`, href: `tel:${d.phone}` })
    }
    if (stepId === 'wstop') {
      out.push({ label: 'MCU disconnect form', href: MCU_WATER_DISCONNECT.formUrl })
      const d = waterDisconnectDraft(p, ps)
      out.push({ label: 'Draft MCU disconnect email', href: d.mailto, note: 'Attach: ' + d.attachments.join(', ') })
    }
    if (stepId === 'handoff' && h.docsUrl) out.push({ label: 'Open project folder', href: h.docsUrl })
  }
  return out
}

/* ---------------- Routine watch-items ---------------- */

export interface Routine {
  tone: 'crit' | 'warn' | 'info' | 'ok'
  text: string
  href?: string
}

function daysUntil(iso: string): number {
  const d = new Date(iso + 'T00:00:00')
  return Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
}

export function routineFor(h: House): Routine[] {
  const out: Routine[] = []
  if (h.permitExpires) {
    const n = daysUntil(h.permitExpires)
    if (n < 0) out.push({ tone: 'crit', text: `Permit EXPIRED ${-n} days ago (${h.permitExpires})`, href: h.permitUrl || undefined })
    else if (n <= 30) out.push({ tone: n <= 7 ? 'crit' : 'warn', text: `Permit expires in ${n} days (${h.permitExpires})`, href: h.permitUrl || undefined })
    else out.push({ tone: 'ok', text: `Permit expires ${h.permitExpires}` })
  } else if (h.permit) {
    out.push({ tone: 'info', text: 'No permit expiry date on file — fill Permit Expires.' })
  }
  if (h.closingDate) {
    const cut = addBusinessDays(h.closingDate, 2).toISOString().slice(0, 10)
    const n = daysUntil(cut)
    out.push({
      tone: n < 0 ? 'crit' : n <= 10 ? 'warn' : 'info',
      text: n < 0 ? `Shut-off deadline passed ${-n} days ago (${cut})` : `Closing ${h.closingDate} — shut off / transfer electric by ${cut} (${n} days)`,
    })
  }
  out.push({ tone: h.orderCount ? 'info' : 'ok', text: `${h.orderCount} open material order${h.orderCount === 1 ? '' : 's'}`, href: ORDERS_BOARD_URL })
  if (h.inspectionCount) out.push({ tone: 'warn', text: `${h.inspectionCount} inspection result${h.inspectionCount === 1 ? '' : 's'} to look at`, href: h.permitUrl || undefined })
  return out
}

/* ---------------- Writes ---------------- */

/** Create subitems for the given template steps (Start runbook = all; auto-sync = the missing ones). */
export async function addSteps(h: House, steps: TemplateStep[]): Promise<void> {
  for (const step of steps) {
    const vals: Record<string, unknown> = { [SUB.key]: step.id, [SUB.order]: String(step.order) }
    if (step.stage) vals[SUB.stage] = { label: STAGE_LABEL[step.stage] }
    await api(`mutation ($p: ID!, $n: String!, $v: JSON!) { create_subitem(parent_item_id: $p, item_name: $n, column_values: $v) { id } }`, {
      p: String(h.id),
      n: step.label,
      v: JSON.stringify(vals),
    })
  }
}

/** Start runbook = add every applicable template step. */
export async function startRunbook(h: House, steps: TemplateStep[]): Promise<void> {
  await addSteps(h, steps)
}

/** Tick / untick one step (Done + Done On). */
export async function setStepDone(row: StepRow, done: boolean): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const vals = done ? { [SUB.done]: { checked: 'true' }, [SUB.doneOn]: { date: today } } : { [SUB.done]: { checked: 'false' }, [SUB.doneOn]: '' }
  await api(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`, {
    b: String(SUBITEM_BOARD_ID),
    i: String(row.subitemId),
    v: JSON.stringify(vals),
  })
}

/** The "Mark permit issued" button: same effect as the board button. */
export async function markPermitIssued(h: House): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await api(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`, {
    b: String(CJL_BOARD_ID),
    i: String(h.id),
    v: JSON.stringify({ [COL.permitIssued]: { date: today }, [COL.permitStatus]: { label: 'Issued' } }),
  })
}
