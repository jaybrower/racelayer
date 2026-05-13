import { useEffect, useRef, useState } from 'react'

/**
 * Custom drag hook for frameless Electron overlay windows.
 *
 * Instead of relying on -webkit-app-region (which is subject to OS window-snap
 * constraints), we track screen-space mouse coordinates ourselves and push the
 * new position to the main process via IPC. This lets overlays be placed
 * anywhere on screen — including over the taskbar or across monitors.
 */
export function useDrag(editMode: boolean) {
  const [dragging, setDragging] = useState(false)

  // Refs avoid stale closures in the window-level event listeners
  const startMouseRef = useRef({ x: 0, y: 0 })
  const startWinRef = useRef({ x: 0, y: 0 })

  const onMouseDown = async (e: React.MouseEvent) => {
    if (!editMode || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const winPos = await window.iracingOverlay.getWindowPosition()
    startMouseRef.current = { x: e.screenX, y: e.screenY }
    startWinRef.current = winPos
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const dx = e.screenX - startMouseRef.current.x
      const dy = e.screenY - startMouseRef.current.y
      window.iracingOverlay.setWindowPosition(
        startWinRef.current.x + dx,
        startWinRef.current.y + dy,
      )
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
