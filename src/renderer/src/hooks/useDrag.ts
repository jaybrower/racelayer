import { useEffect, useRef, useState } from 'react'

/**
 * Custom drag hook for frameless Electron overlay windows.
 *
 * Instead of relying on -webkit-app-region (which is subject to OS window-snap
 * constraints), we track screen-space mouse coordinates ourselves and push the
 * new bounds to the main process via IPC. This lets overlays be placed
 * anywhere on screen — including over the taskbar or across monitors.
 *
 * Why `setBounds` (and not `setPosition`):
 * On Windows with DPI scaling, repeated `BrowserWindow.setPosition()` calls
 * during a drag would sometimes cause the window to creep larger by a pixel
 * or two per frame, because position-only updates let the OS reapply size
 * constraints between frames. Capturing width/height at drag-start and
 * re-asserting them on every move locks the size and eliminates the growth.
 */
export function useDrag(editMode: boolean) {
  const [dragging, setDragging] = useState(false)

  // Refs avoid stale closures in the window-level event listeners
  const startMouseRef = useRef({ x: 0, y: 0 })
  const startBoundsRef = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const onMouseDown = async (e: React.MouseEvent) => {
    if (!editMode || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const winBounds = await window.iracingOverlay.getWindowBounds()
    startMouseRef.current = { x: e.screenX, y: e.screenY }
    startBoundsRef.current = winBounds
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const dx = e.screenX - startMouseRef.current.x
      const dy = e.screenY - startMouseRef.current.y
      const { x, y, width, height } = startBoundsRef.current
      // Always send the *original* width/height so the size is locked for the
      // duration of the drag. See header comment for the Windows-DPI rationale.
      window.iracingOverlay.setWindowBounds(x + dx, y + dy, width, height)
    }

    const onUp = () => setDragging(false)

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  return { onMouseDown, dragging }
}
