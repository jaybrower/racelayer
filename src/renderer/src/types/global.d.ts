interface DevModeState {
  enabled: boolean
  sessionType: 'practice' | 'qualifying' | 'race'
}

interface ShortcutMap {
  editMode: string
  openSettings: string
}

interface Window {
  iracingOverlay: {
    onTelemetryUpdate: (callback: (data: unknown) => void) => void
    onEditMode: (callback: (enabled: boolean) => void) => void
    onDevModeChanged: (callback: (state: DevModeState) => void) => void
    onConfigChanged: (callback: (data: { overlay: string; config: unknown }) => void) => void
    getConfig: (overlay: string) => Promise<unknown>
    setConfig: (overlay: string, config: unknown) => Promise<void>
    getDevMode: () => Promise<DevModeState>
    setDevMode: (patch: Partial<DevModeState>) => Promise<void>
    getShortcuts: () => Promise<ShortcutMap>
    setShortcut: (key: string, accel: string) => Promise<{ ok: boolean; error?: string }>
    resetPositions: () => Promise<void>
    getWindowPosition: () => Promise<{ x: number; y: number }>
    setWindowPosition: (x: number, y: number) => void
    removeAllListeners: (channel: string) => void
    getStartupEnabled: () => Promise<boolean>
    setStartupEnabled: (enable: boolean) => Promise<void>
  }
}
