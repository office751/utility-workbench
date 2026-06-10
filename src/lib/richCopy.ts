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
 * Put html + plain flavors on the clipboard, trying three ways in order:
 *
 *   1. PROMISE-based ClipboardItem — content promises created synchronously
 *      inside the click. Required by Safari (it only allows clipboard writes
 *      while the click is "live", and our content may still be minting).
 *   2. RESOLVED-blob ClipboardItem — await the content first, then write.
 *      Chrome is fine writing after an await (its clipboard-write permission
 *      persists for the tab), and some Chrome versions reject promise VALUES
 *      inside ClipboardItem — this tier catches those.
 *   3. writeText of the plain flavor — last resort; rich text is lost but
 *      the user still gets a working (raw) link.
 *
 * Returns which flavor actually landed so the UI can tell the truth —
 * 'plain' means pasting will show the raw URL, not the pretty name.
 * Rejects of the CONTENT promises (e.g. "nothing to copy") propagate to the
 * caller; only clipboard failures step down the ladder.
 */
export async function writeRichClipboard(
  htmlContent: string | Promise<string>,
  textContent: string | Promise<string>,
): Promise<'rich' | 'plain'> {
  const html = Promise.resolve(htmlContent)
  const text = Promise.resolve(textContent)

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': html.then((h) => new Blob([h], { type: 'text/html' })),
        'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })),
      }),
    ])
    return 'rich'
  } catch {
    /* tier 2 below — but first let content-promise rejections propagate */
  }

  // If the CONTENT itself failed (mint error, nothing to copy), this throw
  // is the real story — don't mask it with a clipboard fallback.
  const [h, t] = await Promise.all([html, text])

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([h], { type: 'text/html' }),
        'text/plain': new Blob([t], { type: 'text/plain' }),
      }),
    ])
    return 'rich'
  } catch {
    await navigator.clipboard.writeText(t)
    return 'plain'
  }
}

/**
 * Copy `url` to the clipboard with `name` as its rich-text face.
 * `url` may be a PROMISE of the link (one still being minted) — see
 * writeRichClipboard for the Safari reasoning. Returns 'rich' | 'plain'.
 */
export async function copyRichLink(name: string, url: string | Promise<string>): Promise<'rich' | 'plain'> {
  const urlPromise = Promise.resolve(url)
  return writeRichClipboard(
    urlPromise.then((u) => richLinkHtml(name, u)),
    urlPromise,
  )
}
