/**
 * ExportImport.tsx — move your data between browsers/computers as a .json
 * file. Same idea as the original workbench's Export/Import buttons.
 *
 * Export: turn the saved state into a file the browser downloads.
 * Import: read a chosen .json file, sanity-check it, replace the state.
 *
 * NEW CONCEPT — useRef: a way to grab a real DOM element. The file input is
 * invisible (file inputs are ugly); our pretty Import button "clicks" it
 * via the ref.
 */
import { useRef } from 'react'
import type { WorkbenchState } from '../types'

interface Props {
  state: WorkbenchState
  onImport: (next: WorkbenchState) => void
}

function ExportImport({ state, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)

  function doExport() {
    // A Blob is an in-memory "file"; the temporary <a download> link below
    // is the standard browser trick for triggering a download of it.
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workbench-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url) // tidy up the temporary URL
  }

  function doImport(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        // Minimal sanity check before nuking current data:
        if (!parsed || typeof parsed.projects !== 'object') {
          throw new Error('not a Workbench export (missing "projects")')
        }
        // Importing REPLACES everything — make that unmissable.
        if (confirm('Import this file? It replaces ALL current progress in this browser.')) {
          onImport(parsed as WorkbenchState)
          alert('Progress imported. ✓')
        }
      } catch (err) {
        alert('Import failed: ' + (err as Error).message)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="io">
      <button className="mini" onClick={doExport} title="Download progress as a .json file">
        ⬇ Export
      </button>
      <button
        className="mini"
        onClick={() => fileInput.current?.click()} // forward to the hidden input
        title="Load progress from a .json file"
      >
        ⬆ Import
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) doImport(f)
          e.target.value = '' // allow re-importing the same file later
        }}
      />
    </div>
  )
}

export default ExportImport
