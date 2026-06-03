/**
 * DocumentsBox.tsx — the "Documents" area on the permit tab.
 *
 * IMPORTANT / honest limitation: this is the UI for attaching documents, but
 * it does NOT actually store the files yet — only their names. localStorage
 * can't hold real files, and file storage is being restructured separately.
 * So this is a working-looking placeholder: you can add/remove file names so
 * the list persists, and we'll wire real uploads in once storage is sorted.
 *
 * It accepts files two ways: clicking "Add files" (a hidden file input) or
 * dragging files onto the dashed drop zone.
 */
import { useRef, useState } from 'react'
import type { ProjectDoc } from '../types'

interface Props {
  docs: ProjectDoc[]
  onAdd: (names: string[]) => void
  onRemove: (index: number) => void
}

function DocumentsBox({ docs, onAdd, onRemove }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  // Just for the drag-hover highlight — local, nobody else cares.
  const [dragOver, setDragOver] = useState(false)

  /** Pull the file NAMES out of a FileList and hand them up. */
  function take(files: FileList | null) {
    if (!files || files.length === 0) return
    onAdd(Array.from(files).map((f) => f.name))
  }

  return (
    <div className="docs">
      <div className="docs-head">
        Documents
        <span className="docs-note">names only for now — file storage coming soon</span>
      </div>

      {/* The drop zone. onDragOver must call preventDefault or the browser
          just opens the file instead of letting us handle the drop. */}
      <div
        className={'dropzone' + (dragOver ? ' over' : '')}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          take(e.dataTransfer.files)
        }}
      >
        ＋ Add files <span className="muted">— click or drag &amp; drop</span>
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

      {docs.length > 0 && (
        <ul className="doc-list">
          {docs.map((d, i) => (
            <li key={`${d.name}-${i}`}>
              <span className="doc-name">📄 {d.name}</span>
              <span className="doc-date muted">{d.addedAt}</span>
              <button className="doc-x" title="Remove" onClick={() => onRemove(i)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DocumentsBox
