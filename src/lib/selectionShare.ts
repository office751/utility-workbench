/**
 * selectionShare.ts — the client "fill it out on your phone" share link.
 *
 * Staff click "Client link" on the Selections tab → we snapshot everything the
 * client needs (address, resolved catalog, current choices, browse links) into
 * a selection_shares row and hand back an unguessable URL. The client opens it
 * with NO login (components/PublicSelect.tsx), picks finishes, and submits —
 * which inserts a selection_submissions row. Staff then review and APPLY the
 * submission in the app.
 *
 * TWO HARD RULES (don't weaken them):
 *   1. Anonymous visitors never touch the workbench blob — reads and writes
 *      go through two token-scoped SECURITY DEFINER functions
 *      (supabase/setup-selection-shares.sql); the tables themselves are
 *      internal-only under RLS.
 *   2. Applying a submission is a STAFF action in the app (a normal setState →
 *      debounced save with all the merge/backup machinery) — never a server-
 *      side write into the blob.
 *
 * Same family as lib/investor.ts: pure builders up top, fail-SOFT Supabase IO
 * below (missing schema / offline → null/[] — the UI quietly hides itself).
 */
import { supabase } from './supabase'
import type {
  Project,
  ProjectSelections,
  SelectionCategory,
  SelectionChoice,
  SelectionSection,
  SelectionSharePayload,
  ShareSubmissionChoices,
} from '../types'
import type { Vendor } from '../data/vendors'

/* ------------------------------------------------------------------ */
/* Pure builders (unit-tested in selectionShare.test.ts)               */
/* ------------------------------------------------------------------ */

/** The client's "browse options online" link for a category: its own url wins,
 *  else the linked vendor's website (data/vendors.ts), else none.
 *  (Single source — SelectionsView imports this too.) */
export function browseUrlFor(cat: SelectionCategory, vendors: Vendor[]): string | undefined {
  const direct = cat.url?.trim()
  if (direct) return direct
  if (cat.vendorId) return vendors.find((v) => v.id === cat.vendorId)?.website || undefined
  return undefined
}

/**
 * Build the curated snapshot a share link serves. `sections` must be the
 * EFFECTIVE sections for this house's model (resolveSelectionSections) — the
 * same ones the tab renders — so the client sees exactly what staff see.
 * Browse links are resolved HERE so the public page needs no vendor data.
 */
export function buildSharePayload(
  p: Project,
  selections: ProjectSelections | undefined,
  sections: SelectionSection[],
  vendors: Vendor[],
): SelectionSharePayload {
  const sel = selections ?? { interior: {}, exterior: {} }
  return {
    version: 1,
    address: p.address,
    city: p.city,
    zip: p.zip,
    model: p.model,
    sections: sections.map((sec) => ({
      id: sec.id,
      label: sec.label,
      icon: sec.icon,
      categories: sec.categories.map((cat) => ({
        id: cat.id,
        label: cat.label,
        options: [...cat.options],
        ...(cat.hint ? { hint: cat.hint } : {}),
        ...(browseUrlFor(cat, vendors) ? { browseUrl: browseUrlFor(cat, vendors) } : {}),
        ...(cat.optionImages ? { optionImages: { ...cat.optionImages } } : {}),
      })),
    })),
    current: {
      interior: { ...sel.interior },
      exterior: { ...sel.exterior },
      ...(sel.additionalRequests ? { additionalRequests: sel.additionalRequests } : {}),
    },
  }
}

/** True when a choice actually says something (an option pick or a write-in). */
function hasValue(c: SelectionChoice | undefined): boolean {
  return !!(c && (c.option || c.writeIn?.trim()))
}

/** How many categories a submission actually answered — for "(14 choices)". */
export function countShareChoices(sub: ShareSubmissionChoices): number {
  const n = (m: Record<string, SelectionChoice>) => Object.values(m).filter(hasValue).length
  return n(sub.interior ?? {}) + n(sub.exterior ?? {})
}

/**
 * Merge a client submission onto a project's saved selections — the pure heart
 * of the staff "Apply" button (called inside useProjects' one-setState updater).
 *
 * Rules:
 *   • Category-level: a category the client ANSWERED replaces what's saved;
 *     a category they left empty is untouched (never wipes staff-entered data).
 *   • additionalRequests: replaced only when the client wrote something.
 *   • The sign-off lock is preserved as-is (the UI blocks Apply while locked —
 *     this is just belt-and-suspenders).
 */
export function mergeSubmissionIntoSelections(
  current: ProjectSelections | undefined,
  sub: ShareSubmissionChoices,
): ProjectSelections {
  const cur = current ?? { interior: {}, exterior: {} }
  const mergeArea = (
    base: Record<string, SelectionChoice>,
    incoming: Record<string, SelectionChoice> | undefined,
  ): Record<string, SelectionChoice> => {
    const out = { ...base }
    for (const [id, choice] of Object.entries(incoming ?? {})) {
      if (hasValue(choice)) out[id] = choice
    }
    return out
  }
  return {
    ...cur,
    interior: mergeArea(cur.interior, sub.interior),
    exterior: mergeArea(cur.exterior, sub.exterior),
    additionalRequests: sub.additionalRequests?.trim()
      ? sub.additionalRequests
      : cur.additionalRequests,
  }
}

/** The URL a client opens. Hash-based (#/select/…) so it needs no server
 *  rewrites AND the token never appears in server logs (fragments aren't sent
 *  over the wire beyond the origin). */
export function shareUrlFor(token: string): string {
  return `${window.location.origin}/#/select/${token}`
}

/* ------------------------------------------------------------------ */
/* Print (the client's "print it, come in and sign" path)              */
/* ------------------------------------------------------------------ */

/** Plain-text report of the client's CURRENT on-screen choices — mirrors
 *  lib/selectionsReport.ts but built from the share payload, since the public
 *  page has no Project/ProjectState. */
export function buildShareReportText(
  payload: SelectionSharePayload,
  choices: ShareSubmissionChoices,
  clientName?: string,
): string {
  const valueOf = (c: SelectionChoice | undefined): string => {
    const parts: string[] = []
    if (c?.option) parts.push(c.option)
    if (c?.writeIn) parts.push(c.writeIn)
    return parts.join(' — ')
  }
  const lines: string[] = []
  lines.push(`Homeowner Selections — ${payload.address}`)
  lines.push(`${payload.city}, FL ${payload.zip}` + (payload.model ? ` · ${payload.model}` : ''))
  for (const section of payload.sections) {
    const rows: string[] = []
    for (const cat of section.categories) {
      const v = valueOf(choices[section.id]?.[cat.id])
      if (v) rows.push(`  ${cat.label}: ${v}`)
    }
    if (rows.length) {
      lines.push('')
      lines.push(section.label.toUpperCase())
      lines.push(...rows)
    }
  }
  if (choices.additionalRequests?.trim()) {
    lines.push('')
    lines.push('ADDITIONAL REQUESTS')
    lines.push(`  ${choices.additionalRequests.trim()}`)
  }
  lines.push('')
  if (clientName?.trim()) lines.push(`Prepared by ${clientName.trim()}.`)
  lines.push('NOT FINAL until signed in person with Iron Shield Construction.')
  lines.push('')
  lines.push('Signature: ______________________________   Date: ____________')
  return lines.join('\n')
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** 🖨 Print the client's choices from the public page — same look as the
 *  staff-side openSelectionsPrint, with a signature line for the in-person
 *  sign-off. Call SYNCHRONOUSLY from the click (pop-up blockers). */
export function openSharePrint(
  payload: SelectionSharePayload,
  choices: ShareSubmissionChoices,
  clientName?: string,
) {
  const body = buildShareReportText(payload, choices, clientName)
  const logoUrl = `${window.location.origin}/iron-shield-logo.png`
  const today = new Date().toLocaleDateString()
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(`Selections — ${payload.address}`)}</title>
<style>
  body { font: 13px/1.5 'Times New Roman', Times, Georgia, serif; color: #222; margin: 32px; }
  .hdr { display: flex; align-items: center; gap: 14px; margin: 0 0 18px; }
  .logo { height: 54px; width: auto; }
  h1 { font-size: 17px; font-weight: 700; margin: 0 0 2px; color: #b3541e; }
  .sub { color: #666; font-size: 11.5px; margin: 0; }
  pre { font: inherit; white-space: pre-wrap; margin: 0; }
  @page { margin: 14mm; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="hdr">
  <img class="logo" src="${esc(logoUrl)}" alt="" onerror="this.style.display='none'">
  <div>
    <h1>Iron Shield Construction — Client Selections</h1>
    <div class="sub">${esc(payload.address)}, ${esc(payload.city)}, FL ${esc(payload.zip)} · ${esc(today)}</div>
  </div>
</div>
<pre>${esc(body)}</pre>
<script>window.onload = () => setTimeout(() => window.print(), 150)</script>
</body></html>`
  const win = window.open('', '_blank')
  if (!win) return alert('Pop-up blocked — allow pop-ups for this site to print.')
  win.document.write(html)
  win.document.close()
}

/* ------------------------------------------------------------------ */
/* Supabase IO — every call fails SOFT (schema absent / offline → the  */
/* share UI simply hides itself; nothing here can break the app).      */
/* ------------------------------------------------------------------ */

/** A share link's row as the app-side UI needs it. */
export interface ShareRow {
  token: string
  updated_at: string
}

/** One client submission row, as the review banner needs it. */
export interface SubmissionRow {
  id: string
  project_id: number
  choices: ShareSubmissionChoices
  client_name: string
  submitted_at: string
  status: 'pending' | 'applied' | 'dismissed'
}

/** What the public page gets for a token (via the fetch RPC). */
export interface FetchedShare {
  payload: SelectionSharePayload
  /** The client's most recent submission, if any — pre-fills their reopen. */
  last?: { choices: ShareSubmissionChoices; clientName: string; submittedAt: string } | null
}

/** Wrap a query so missing tables / policies / network fail SOFT.
 *  (PromiseLike, not Promise — Supabase's query builder is a thenable.) */
async function soft<T>(fallback: T, run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  if (!supabase) return fallback
  try {
    const { data, error } = await run()
    if (error) return fallback
    return (data as T) ?? fallback
  } catch {
    return fallback
  }
}

/** STAFF: the project's active (non-revoked) share link, newest first. */
export async function getShareForProject(projectId: number): Promise<ShareRow | null> {
  const rows = await soft<ShareRow[]>([], () =>
    supabase!
      .from('selection_shares')
      .select('token, updated_at')
      .eq('project_id', projectId)
      .eq('revoked', false)
      .order('updated_at', { ascending: false })
      .limit(1),
  )
  return rows[0] ?? null
}

/** STAFF: mint the project's share link, or refresh its snapshot if one is
 *  already active (same token → the URL the client has keeps working). */
export async function createOrRefreshShare(
  projectId: number,
  payload: SelectionSharePayload,
): Promise<ShareRow | null> {
  if (!supabase) return null
  const existing = await getShareForProject(projectId)
  if (existing) {
    const updated_at = new Date().toISOString()
    const ok = await soft(false, async () => {
      const res = await supabase!
        .from('selection_shares')
        .update({ payload, updated_at })
        .eq('token', existing.token)
      return { data: !res.error, error: res.error }
    })
    return ok ? { token: existing.token, updated_at } : null
  }
  const rows = await soft<ShareRow[]>([], () =>
    supabase!
      .from('selection_shares')
      .insert({ project_id: projectId, payload })
      .select('token, updated_at'),
  )
  return rows[0] ?? null
}

/** STAFF: kill a link (the client's URL stops working immediately). */
export async function revokeShare(token: string): Promise<boolean> {
  return soft(false, async () => {
    const res = await supabase!.from('selection_shares').update({ revoked: true }).eq('token', token)
    return { data: !res.error, error: res.error }
  })
}

/** STAFF: unreviewed client submissions for one project, newest first. */
export async function pendingSubmissionsFor(projectId: number): Promise<SubmissionRow[]> {
  return soft<SubmissionRow[]>([], () =>
    supabase!
      .from('selection_submissions')
      .select('id, project_id, choices, client_name, submitted_at, status')
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false }),
  )
}

/** STAFF: after Apply/Dismiss — stamp the reviewed rows so the banner clears
 *  everywhere. `appliedId` gets 'applied'; the rest (older, superseded) get
 *  'dismissed'. Pass appliedId=null to dismiss them all. */
export async function resolveSubmissions(appliedId: string | null, dismissedIds: string[]): Promise<void> {
  if (!supabase) return
  if (appliedId) {
    await soft(false, async () => {
      const res = await supabase!
        .from('selection_submissions')
        .update({ status: 'applied' })
        .eq('id', appliedId)
      return { data: !res.error, error: res.error }
    })
  }
  if (dismissedIds.length) {
    await soft(false, async () => {
      const res = await supabase!
        .from('selection_submissions')
        .update({ status: 'dismissed' })
        .in('id', dismissedIds)
      return { data: !res.error, error: res.error }
    })
  }
}

/** CLIENT (anon): fetch a share by token — the public page's only read. */
export async function fetchShare(token: string): Promise<FetchedShare | null> {
  const data = await soft<FetchedShare | null>(null, () =>
    supabase!.rpc('selection_share_fetch', { share_token: token }),
  )
  return data?.payload ? data : null
}

/** CLIENT (anon): submit choices — the public page's only write. Returns
 *  false on any failure (revoked link, offline, caps) so the page can say
 *  "couldn't send — try again or call the office". */
export async function submitShare(
  token: string,
  choices: ShareSubmissionChoices,
  clientName: string,
): Promise<boolean> {
  if (!supabase) return false
  try {
    const { error } = await supabase.rpc('selection_share_submit', {
      share_token: token,
      choices,
      client_name: clientName,
    })
    return !error
  } catch {
    return false
  }
}
