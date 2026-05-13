import { useEffect, useState } from 'react'

export function useEditMode(): boolean {
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    window.iracingOverlay.onEditMode(setEditMode)
    return () => window.iracingOverlay.removeAllListeners('overlay:editMode')
  }, [])

  return editMode
}
