interface PreviewModeState {
  enabled: boolean
  sessionType: 'practice' | 'qualifying' | 'race'
}

interface ShortcutMap {
  editMode: string
  openSettings: string
}

type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available';     version: string }
  | { state: 'not-available' }
  | { state: 'downloading';   percent: number }
  | { state: 'ready';         version: string }
  | { state: 'error';         message: string }

interface Window {
  iracingOverlay: {
    onTelemetryUpdate: (callback: (data: unknown) => void) => void
    onEditMode: (callback: (enabled: boolean) => void) => void
    onPreviewModeChanged: (callback: (state: PreviewModeState) => void) => void
    onConfigChanged: (callback: (data: { overlay: string; config: unknown }) => void) => void
    getConfig: (overlay: string) => Promise<unknown>
    setConfig: (overlay: string, config: unknown) => Promise<void>
    getPreviewMode: () => Promise<PreviewModeState>
    setPreviewMode: (patch: Partial<PreviewModeState>) => Promise<void>
    getShortcuts: () => Promise<ShortcutMap>
    setShortcut: (key: string, accel: string) => Promise<{ ok: boolean; error?: string }>
    resetPositions: () => Promise<void>
    getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>
    setWindowBounds: (x: number, y: number, width: number, height: number) => void
    removeAllListeners: (channel: string) => void
    getStartupEnabled: () => Promise<boolean>
    setStartupEnabled: (enable: boolean) => Promise<void>
    getVersion: () => Promise<string>
    getUpdateStatus: () => Promise<UpdateStatus>
    checkForUpdates: () => Promise<void>
    downloadUpdate: () => Promise<void>
    installUpdate: () => Promise<void>
    openExternal: (url: string) => Promise<void>
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => void
  }
}
