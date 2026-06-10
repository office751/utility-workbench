/**
 * permitHandoff.ts — drafts the "new permit package" email to Jennifer's
 * Permitting Service, our permitting agent for every NEW permit (projects we
 * already started permitting ourselves stay on the old process).
 *
 * Same recipe as vendors.ts / loadForm.ts: gather the live values, pour them
 * into the editable template (⚙️ Settings → Templates → "Permit package —
 * Jennifer"), return a ready-to-send draft. Pure logic — no React, and no
 * direct Supabase import either: the caller passes the link-minting function
 * in (Detail.tsx hands us lib/files.ts' getShareUrl). That keeps this module
 * runnable from plain Node scripts and free of the Vite-only import.meta.
 *
 * FILES: plan sets and surveys are too heavy to attach to email, so the
 * draft carries a signed ~1-year DOWNLOAD LINK for every file uploaded to
 * the project (same links the 📂 Files box shares). Links are minted one by
 * one — a single stale file can't sink the rest; it just falls back to a
 * name-only bullet and gets counted in `failed` so the UI can say so.
 */
import type { Project, ProjectDoc, ProjectState, TemplateOverride } from '../types'
import { JENNIFER, PERMIT_SUBS } from '../data/contacts'
import { septicSourceOf, septicSystemOf } from './nextAction'
import {
  DEFAULT_PERMIT_HANDOFF_BODY,
  DEFAULT_PERMIT_HANDOFF_SUBJECT,
  effectiveTemplate,
  renderTemplate,
} from './templates'

/** What a drafted handoff email comes back as. */
export interface HandoffDraft {
  /** The mailto: URL that opens the draft addressed to Jennifer. */
  mailto: string
  /**
   * The same subject + body as plain text. Some mail apps (notably on
   * Windows) silently trim very long mailto: URLs — and signed links are
   * long — so the UI keeps this on the clipboard as a paste-to-fix backup.
   */
  text: string
  /** How many files got a download link. */
  linked: number
  /** How many files SHOULD have gotten a link but couldn't (stale pointer, offline). */
  failed: number
}

/**
 * The documents section of the email — its own header + one bullet per file.
 * The header lives HERE (not in the template body) so the wording always
 * matches what the section actually contains:
 *   - links minted     → "download links below" + name/URL pairs
 *   - no links minted  → plain list of names, no broken promise
 *   - nothing uploaded → a loud marker so a half-empty draft never gets sent
 */
function docsBlock(docs: ProjectDoc[], links?: Record<string, string>): string {
  if (docs.length === 0) {
    return 'Project documents: [NONE UPLOADED YET — add them in the 📂 Files box before sending]'
  }
  const haveLinks = docs.some((d) => d.path && links?.[d.path])
  const header = haveLinks
    ? 'The plan sets are heavy, so the project documents are download links below (each link is good for about a year):'
    : 'Project documents (download links to follow):'
  const lines = docs.map((d) => {
    const url = d.path ? links?.[d.path] : undefined
    // The link goes on its OWN line so mail apps auto-link the whole URL.
    return url ? `    - ${d.name}:\n      ${url}` : `    - ${d.name}`
  })
  return [header, ...lines].join('\n')
}

/** The live values the handoff template's {{tokens}} can use. */
export function permitHandoffVars(
  p: Project,
  ps: ProjectState,
  links?: Record<string, string>,
): Record<string, string> {
  // The standard sub lineup, one bullet per trade (edit data/contacts.ts to change it).
  const subs = PERMIT_SUBS.map((s) => `    - ${s.trade}: ${s.company} — ${s.contact}`).join('\n')

  // Same wording the status report uses: 'Sewer', 'Septic', or 'Septic (ATU)'.
  const src = septicSourceOf(ps)
  const sys = septicSystemOf(ps)

  return {
    address: p.address,
    city: p.city,
    zip: p.zip,
    site: `${p.address}, ${p.city}, FL ${p.zip}`.trim(),
    parcel: p.parcel,
    permit: p.permit,
    model: p.model || '[model]',
    subs,
    docs: docsBlock(ps.docs ?? [], links),
    septic_type: src === 'Sewer' ? 'Sewer' : sys ? `Septic (${sys})` : 'Septic',
  }
}

/** Render subject+body with the user's template override (or the default)
 *  and package them as both a mailto: and plain text. */
function buildDraft(
  p: Project,
  ps: ProjectState,
  overrides: Record<string, TemplateOverride> | undefined,
  links?: Record<string, string>,
): Pick<HandoffDraft, 'mailto' | 'text'> {
  const t = effectiveTemplate(overrides, 'permit:handoff', {
    subject: DEFAULT_PERMIT_HANDOFF_SUBJECT,
    body: DEFAULT_PERMIT_HANDOFF_BODY,
  })
  const vars = permitHandoffVars(p, ps, links)
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)
  return {
    mailto: `mailto:${JENNIFER.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    text: `Subject: ${subject}\n\n${body}`,
  }
}

/** Names-only draft — instant, works offline. The fallback path. */
export function permitHandoffDraft(
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
): HandoffDraft {
  return { ...buildDraft(p, ps, overrides), linked: 0, failed: 0 }
}

/**
 * The full draft: mints a fresh download link for every uploaded file and
 * weaves them into {{docs}}, so Jennifer downloads instead of us attaching.
 * Each file is minted independently — failures turn into name-only bullets
 * and are tallied in `failed` rather than sinking the whole email.
 */
export async function permitHandoffDraftWithLinks(
  p: Project,
  ps: ProjectState,
  overrides: Record<string, TemplateOverride> | undefined,
  mint: (path: string) => Promise<string>,
): Promise<HandoffDraft> {
  const linkable = (ps.docs ?? []).filter((d) => d.path)
  const links: Record<string, string> = {}
  let failed = 0
  await Promise.all(
    linkable.map(async (d) => {
      try {
        links[d.path!] = await mint(d.path!)
      } catch {
        failed += 1
      }
    }),
  )
  return { ...buildDraft(p, ps, overrides, links), linked: Object.keys(links).length, failed }
}
