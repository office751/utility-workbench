/**
 * DocumentsBox.tsx — files attached to a project: upload, open, and SHARE.
 *
 * The real files live in Supabase Storage (see lib/files.ts); this component
 * just shows the list and the buttons. Four things you can do per file:
 *   📋 Copy link — one click: a fresh link lands on the clipboard as the
 *              clickable FILE NAME (rich text); plain fields get the raw URL.
 *   📤 Share — on a phone, the native share sheet (Messages, Mail, AirDrop…);
 *              on a desktop without that, a small Copy / Email / Text menu.
 *   ⬇︎ Open  — opens the file in a new tab (view or download).
 *   ✕ Remove — deletes the file from the locker.
 *
 * Sharing uses a "signed link": a long, unguessable URL we mint fresh each
 * time you hit Share (good for ~1 year) so your files stay private but the
 * link you send is always live. "Copy link" copies it as RICH TEXT — pasting
 * into Mail/Word/Teams shows the clickable file name, not the URL soup
 * (plain-text fields still get the raw URL). See lib/richCopy.ts.
 *
 * Files come in two ways: clicking "Add files" or dragging onto the drop zone.
 */
import { useRef, useState } from 'react'
import type { ProjectDoc } from '../types'
import { hasSupabase } from '../lib/supabase'
import { getShareUrl } from '../lib/files'
import { copyRichLink } from '../lib/richCopy'

interface Props {
  projectId: number
  docs: ProjectDoc[]
  onAddFiles: (files: File[]) => Promise<{ ok: number; failed: string[] }>
  onRemove: (index: number) => void
}

/** "1.2 MB" / "640 KB" / "512 B" from a byte count. */
function humanSize(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentsBox({ docs, onAddFiles, onRemove }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false) // uploading right now?
  const [error, setError] = useState<string | null>(null)
  // Desktop share fallback: which row's menu is open + the fresh link in it.
  const [menu, setMenu] = useState<{ index: number; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  // Which row's 📋 Copy link just succeeded (shows "✓ Copied" for a moment).
  const [copiedRow, setCopiedRow] = useState<number | null>(null)

  /** Upload whatever files were chosen / dropped. */
  async function take(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setBusy(true)
    try {
      const res = await onAddFiles(Array.from(files))
      if (res.failed.length) setError(`Couldn't upload: ${res.failed.join(', ')}`)
    } catch (e) {
      setError((e as Error).message || 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  /** 📤 Share — native sheet on phones; Copy/Email/Text menu on desktop. */
  async function share(doc: ProjectDoc, index: number) {
    if (!doc.path) return
    setError(null)
    try {
      const url = await getShareUrl(doc.path)
      // Web Share API = the OS share sheet (phones + Safari/Chrome on Mac).
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: doc.name, text: doc.name, url })
          return
        } catch (e) {
          if ((e as Error).name === 'AbortError') return // user closed the sheet
          // Native share refused — fall through to the inline menu below.
        }
      }
      setMenu({ index, url })
      setCopied(false)
    } catch {
      setError('Could not create a share link. Is the file locker set up in Supabase?')
    }
  }

  /** ⬇︎ Open — view/download in a new tab via a fresh signed link. */
  async function open(doc: ProjectDoc) {
    if (!doc.path) return
    setError(null)
    try {
      const url = await getShareUrl(doc.path)
      window.open(url, '_blank', 'noopener')
    } catch {
      setError('Could not open the file.')
    }
  }

  /** 📋 Copy link (inside the desktop share menu) — link already minted. */
  async function copy(name: string, url: string) {
    try {
      await copyRichLink(name, url)
      setCopied(true)
    } catch {
      setError('Copy failed — select and copy the link manually.')
    }
  }

  /** 📋 Copy link (the row button) — mints a fresh link AND copies it, one
   *  click. Lands as a clickable FILE NAME in rich editors (Mail, Word,
   *  Teams); plain fields (SMS, notes) still get the raw URL. We pass the
   *  mint PROMISE straight to copyRichLink — Safari only allows clipboard
   *  writes while the click is "live", so no awaiting before the copy. */
  async function copyLink(doc: ProjectDoc, index: number) {
    if (!doc.path) return
    setError(null)
    try {
      await copyRichLink(doc.name, getShareUrl(doc.path))
      setCopiedRow(index)
      // Let the "✓ Copied" flash for a moment, then put the button back —
      // unless another row was copied in the meantime.
      setTimeout(() => setCopiedRow((cur) => (cur === index ? null : cur)), 2000)
    } catch {
      setError('Could not copy a link. Is the file locker set up in Supabase?')
    }
  }

  return (
    <div className="docs">
      <div className="docs-head">
        📎 Project files
        <span className="docs-note">upload anything · share by text or email anytime</span>
      </div>

      {!hasSupabase ? (
        <div className="flag">Connect the cloud backend to upload files.</div>
      ) : (
        <>
          {/* The drop zone. onDragOver must call preventDefault or the browser
              just opens the file instead of letting us handle the drop. */}
          <div
            className={'dropzone' + (dragOver ? ' over' : '') + (busy ? ' busy' : '')}
            onClick={() => !busy && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              if (!busy) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (!busy) take(e.dataTransfer.files)
            }}
          >
            {busy ? (
              <>⏳ Uploading…</>
            ) : (
              <>
                ＋ Add files <span className="muted">— click or drag &amp; drop</span>
              </>
            )}
          </div>

          <input
            ref={fileInput}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              take(e.target.files)
              e.target.value = '' // allow re-picking the same file later
            }}
          />
        </>
      )}

      {error && <div className="docs-error">⚠️ {error}</div>}

      {docs.length > 0 && (
        <ul className="doc-list">
          {docs.map((d, i) => (
            <li key={`${d.name}-${i}`}>
              <div className="doc-row">
                <span className="doc-name">📄 {d.name}</span>
                <span className="doc-meta muted">
                  {humanSize(d.size)}
                  {d.size != null && d.addedAt ? ' · ' : ''}
                  {d.addedAt}
                </span>
              </div>

              <div className="doc-actions">
                {d.path ? (
                  <>
                    <button
                      className="doc-btn"
                      onClick={() => copyLink(d, i)}
                      title="Copy link — pastes as the clickable file name, not the URL"
                    >
                      {copiedRow === i ? '✓ Copied' : '📋 Copy link'}
                    </button>
                    <button className="doc-btn" onClick={() => share(d, i)} title="Share by text / email">
                      📤 Share
                    </button>
                    <button className="doc-btn" onClick={() => open(d)} title="Open / download">
                      ⬇︎ Open
                    </button>
                  </>
                ) : (
                  <span className="muted doc-legacy">name only (no file)</span>
                )}
                <button
                  className="doc-btn x"
                  title="Remove file"
                  onClick={() => {
                    if (confirm(`Remove "${d.name}"? This deletes the file from the locker.`)) {
                      if (menu?.index === i) setMenu(null)
                      onRemove(i)
                    }
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Desktop share menu (phones get the native sheet instead). */}
              {menu?.index === i && (
                <div className="doc-share-menu">
                  <button className="doc-btn" onClick={() => copy(d.name, menu.url)}>
                    {copied ? '✓ Copied' : '📋 Copy link'}
                  </button>
                  <a
                    className="doc-btn"
                    href={`mailto:?subject=${encodeURIComponent(d.name)}&body=${encodeURIComponent(
                      `${d.name}\n\n${menu.url}`,
                    )}`}
                  >
                    ✉️ Email
                  </a>
                  <a className="doc-btn" href={`sms:?&body=${encodeURIComponent(`${d.name} ${menu.url}`)}`}>
                    💬 Text
                  </a>
                  <button className="doc-btn x" title="Close" onClick={() => setMenu(null)}>
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DocumentsBox
