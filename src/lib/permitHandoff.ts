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
 * FILES: plan sets and surveys are too heavy to attach, so each uploaded file
 * gets a signed ~1-year DOWNLOAD LINK (same links the 📂 Files box shares).
 * Raw signed URLs are 300+ characters of token soup though — off-putting in
 * an email — and a mailto: draft is plain text by spec, so it can't carry a
 * clickable "file name → link". The trick: the draft body holds a loud
 * [PASTE HERE] marker, and the CLIPBOARD holds a rich-text (HTML) list of
 * clickable file names. One paste over the marker and the email shows tidy
 * links, no URLs. (A plain-text clipboard fallback keeps raw URLs available
 * for plain-text composers.)
 */
import type { Project, ProjectDoc, ProjectState, TemplateOverride } from '../types'
import { JENNIFER, PERMIT_SUBS } from '../data/contacts'
import { septicSourceOf, septicSystemOf } from './nextAction'
import { escapeHtml } from './richCopy'
import {
  DEFAULT_PERMIT_HANDOFF_BODY,
  DEFAULT_PERMIT_HANDOFF_SUBJECT,
  effectiveTemplate,
  renderTemplate,
} from './templates'

/** The placeholder the draft carries where the documents section goes when
 *  the clickable links are waiting on the clipboard. Exported so the
 *  Settings → Templates preview can show exactly what the draft contains. */
export const DOCS_MARKER =
  'Project documents: [PASTE HERE — the download links are on your clipboard as clickable file names]'

/** What a drafted handoff email comes back as. */
export interface HandoffDraft {
  /** The mailto: URL that opens the draft addressed to Jennifer. */
  mailto: string
  /**
   * Same draft but with the documents section as plain name + raw-URL lines
   * instead of the [PASTE HERE] marker. The fallback when the clipboard
   * write fails: uglier, but never a marker pointing at an empty clipboard.
   */
  mailtoWithUrls: string
  /**
   * Rich-text documents section — clickable file names, no visible URLs.
   * Goes on the clipboard; pasting it over the draft's [PASTE HERE] marker
   * gives the tidy version. Empty string when no links were minted.
   */
  docsHtml: string
  /**
   * The same section as plain text (file name + raw URL per line). The
   * clipboard's plain flavor, for plain-text composers — still works, just
   * not pretty. Empty string when no links were minted.
   */
  docsText: string
  /** How many files got a download link. */
  linked: number
  /** How many files SHOULD have gotten a link but couldn't (stale pointer, offline). */
  failed: number
}

const DOCS_HEADER =
  'The plan sets are heavy, so the project documents are download links below (each link is good for about a year):'

/**
 * The PLAIN-TEXT documents section (header + one bullet per file, raw URL
 * under each name when we have one). Used for the names-only fallback and as
 * the clipboard's plain flavor.
 */
function docsBlockText(docs: ProjectDoc[], links?: Record<string, string>): string {
  if (docs.length === 0) {
    return 'Project documents: [NONE UPLOADED YET — add them in the 📂 Files box before sending]'
  }
  const haveLinks = docs.some((d) => d.path && links?.[d.path])
  const header = haveLinks ? DOCS_HEADER : 'Project documents (download links to follow):'
  const lines = docs.map((d) => {
    const url = d.path ? links?.[d.path] : undefined
    // The link goes on its OWN line so mail apps auto-link the whole URL.
    return url ? `    - ${d.name}:\n      ${url}` : `    - ${d.name}`
  })
  return [header, ...lines].join('\n')
}

/** The RICH-TEXT documents section: clickable file names instead of URLs.
 *  Files whose link failed still appear, just without a link. */
function docsBlockHtml(docs: ProjectDoc[], links: Record<string, string>): string {
  const items = docs.map((d) => {
    const url = d.path ? links[d.path] : undefined
    return url
      ? `<li><a href="${escapeHtml(url)}">${escapeHtml(d.name)}</a></li>`
      : `<li>${escapeHtml(d.name)} (link to follow)</li>`
  })
  return `<p>${escapeHtml(DOCS_HEADER)}</p><ul>${items.join('')}</ul>`
}

/** The live values the handoff template's {{tokens}} can use. */
export function permitHandoffVars(
  p: Project,
  ps: ProjectState,
  links?: Record<string, string>,
): Record<string, string> {
  // The standard sub lineup — name, county-portal Contact ID, and email per
  // trade, so Jennifer can attach the existing portal contacts directly
  // (edit data/contacts.ts to change the lineup).
  const subs = PERMIT_SUBS.map(
    (s) => `    - ${s.trade}: ${s.company} — ${s.contact} (Contact ID ${s.contactId}, ${s.email})`,
  ).join('\n')

  // Asserted, not hedged: the app knows septic vs sewer (utility settings),
  // so the email tells Jennifer exactly what to apply for.
  const src = septicSourceOf(ps)
  const sys = septicSystemOf(ps)
  const septicLine =
    src === 'Sewer'
      ? 'sewer connection — no septic permit needed'
      : `septic required${sys ? ` (${sys})` : ''} — please apply for the septic permit as well`

  return {
    address: p.address,
    city: p.city,
    zip: p.zip,
    site: `${p.address}, ${p.city}, FL ${p.zip}`.trim(),
    parcel: p.parcel,
    permit: p.permit,
    model: p.model || '[model]',
    subs,
    docs: docsBlockText(ps.docs ?? [], links),
    septic_line: septicLine,
    septic_type: src === 'Sewer' ? 'Sewer' : sys ? `Septic (${sys})` : 'Septic',
  }
}

/** Render subject+body (user override wins, default otherwise) into a mailto. */
function buildMailto(
  p: Project,
  ps: ProjectState,
  overrides: Record<string, TemplateOverride> | undefined,
  docsOverride?: string,
): string {
  const t = effectiveTemplate(overrides, 'permit:handoff', {
    subject: DEFAULT_PERMIT_HANDOFF_SUBJECT,
    body: DEFAULT_PERMIT_HANDOFF_BODY,
  })
  const vars = permitHandoffVars(p, ps)
  if (docsOverride !== undefined) vars.docs = docsOverride
  const subject = renderTemplate(t.subject, vars)
  const body = renderTemplate(t.body, vars)
  return `mailto:${JENNIFER.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Names-only draft — instant, works offline. The fallback path. */
export function permitHandoffDraft(
  p: Project,
  ps: ProjectState,
  overrides?: Record<string, TemplateOverride>,
): HandoffDraft {
  const mailto = buildMailto(p, ps, overrides)
  // No links here, so the "with URLs" flavor is the same draft.
  return { mailto, mailtoWithUrls: mailto, docsHtml: '', docsText: '', linked: 0, failed: 0 }
}

/**
 * The full draft. Mints a download link per uploaded file (each minted
 * independently — one stale file can't sink the rest), then:
 *   - the mailto body carries a [PASTE HERE] marker for the docs section
 *   - docsHtml/docsText carry the actual links for the clipboard
 * If NO link could be minted, this just returns the names-only draft so the
 * marker never appears with nothing to paste.
 */
export async function permitHandoffDraftWithLinks(
  p: Project,
  ps: ProjectState,
  overrides: Record<string, TemplateOverride> | undefined,
  mint: (path: string) => Promise<string>,
): Promise<HandoffDraft> {
  const docs = ps.docs ?? []
  const linkable = docs.filter((d) => d.path)
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
  const linked = Object.keys(links).length
  if (linked === 0) return { ...permitHandoffDraft(p, ps, overrides), failed }

  const docsText = docsBlockText(docs, links)
  return {
    mailto: buildMailto(p, ps, overrides, DOCS_MARKER),
    mailtoWithUrls: buildMailto(p, ps, overrides, docsText),
    docsHtml: docsBlockHtml(docs, links),
    docsText,
    linked,
    failed,
  }
}
