/**
 * useResizableSidebar.ts — drag the divider between the project list and the
 * detail panel to resize them. The chosen width is remembered in localStorage
 * (same idea as dark mode / density — a per-device UI preference).
 *
 * NEW CONCEPT — useRef: a useRef "box" holds a value that survives re-renders
 * WITHOUT causing one when it changes. We use it two ways here:
 *   - layoutRef points at the real layout <div> so we can measure where its
 *     left edge is on screen.
 *   - dragging tracks "is the mouse button currently held on the handle?"
 *     during a drag — a fast-changing flag we don't want to re-render on.
 */
import { useEffect, useRef, useState } from 'react'

const WIDTH_KEY = 'isc_sidebar_w'
const MIN = 240 // never let the list get unusably narrow
const MAX = 560 // ...or so wide it crowds out the detail panel
const DEFAULT = 330

function load(): number {
  const saved = Number(localStorage.getItem(WIDTH_KEY))
  // Number("") is 0 and Number("abc") is NaN — both fail this range check,
  // so a missing/garbage value cleanly falls back to the default.
  return saved >= MIN && saved <= MAX ? saved : DEFAULT
}

export function useResizableSidebar() {
  const [width, setWidth] = useState<number>(load)
  const layoutRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Persist the width whenever it changes.
  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width))
  }, [width])

  // Listen for mouse movement on the WHOLE window while dragging — if we only
  // listened on the handle, a fast drag would "outrun" the cursor and drop it.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !layoutRef.current) return
      // New width = mouse X minus the layout's left edge, clamped to [MIN,MAX].
      const left = layoutRef.current.getBoundingClientRect().left
      const next = Math.min(MAX, Math.max(MIN, e.clientX - left))
      setWidth(next)
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    // Cleanup: remove the listeners if this component ever unmounts.
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  /** Call this on the handle's onMouseDown to begin a drag. */
  function startDrag() {
    dragging.current = true
    document.body.style.cursor = 'col-resize' // keep the resize cursor everywhere
    document.body.style.userSelect = 'none' // don't select text while dragging
  }

  return { width, layoutRef, startDrag }
}
