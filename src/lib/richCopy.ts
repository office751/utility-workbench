/**
 * richCopy.ts — put a link on the clipboard as RICH TEXT: a clickable file
 * name instead of 300 characters of signed-URL soup.
 *
 * Two flavors ride together (standard clipboard behavior — the paste target
 * picks the one it understands):
 *   - text/html  → pasting into a rich editor (Mail, Outlook, Word, Teams)
 *                  shows just the underlined NAME, linked to the URL
 *   - text/plain → pasting into a plain field (SMS, notes, URL bar) still
 *                  gives the raw URL, so nothing is ever lost
 *
 * Used by the 📂 Files box "Copy link" button; the permit handoff builds its
 * multi-file clipboard payload the same way. Browser-only (clipboard API)
 * but safe to IMPORT from Node scripts — nothing here runs at module load.
 */

/** The five characters HTML can't show literally — swapped for entities so a
 *  file name like "Plans & Specs <rev2>.pdf" can't break the markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The clickable-name fragment that goes on the rich clipboard. */
export function richLinkHtml(name: string, url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(name)}</a>`
}

/**
 * Copy `url` to the clipboard with `name` as its rich-text face.
 * Returns 'rich' when both flavors landed, 'plain' when only the raw URL
 * could be copied (older browser without ClipboardItem). Throws only when
 * the clipboard is entirely unavailable — caller shows the error.
 *
 * `url` may be a PROMISE of the link (e.g. one still being minted). That's
 * the Safari-safe shape: Safari only allows clipboard writes while the
 * click is "live", so instead of awaiting the mint first we hand
 * ClipboardItem promises created synchronously inside the click.
 */
export async function copyRichLink(name: string, url: string | Promise<string>): Promise<'rich' | 'plain'> {
  const urlPromise = Promise.resolve(url)
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': urlPromise.then((u) => new Blob([richLinkHtml(name, u)], { type: 'text/html' })),
        'text/plain': urlPromise.then((u) => new Blob([u], { type: 'text/plain' })),
      }),
    ])
    return 'rich'
  } catch {
    await navigator.clipboard.writeText(await urlPromise)
    return 'plain'
  }
}
