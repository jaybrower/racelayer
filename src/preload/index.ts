import { contextBridge, ipcRenderer } from 'electron'

export interface DevModeState {
  enabled: boolean
  sessionType: 'practice' | 'qualifying' | 'race'
}

export interface ShortcutMap {
  editMode: string
  openSettings: string
}

const iracingOverlay = {
  onTelemetryUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('telemetry:update', (_event, data) => callback(data))
  },
  onEditMode: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('overlay:editMode', (_event, enabled) => callback(enabled))
  },
  onDevModeChanged: (callback: (state: DevModeState) => void) => {
    ipcRenderer.on('devMode:changed', (_event, state) => callback(state))
  },
  onConfigChanged: (callback: (data: { overlay: string; config: unknown }) => void) => {
    ipcRenderer.on('config:changed', (_event, data) => callback(data))
  },
  getConfig: (overlay: string): Promise<unknown> => {
    return ipcRenderer.invoke('config:get', overlay)
  },
  setConfig: (overlay: string, config: unknown): Promise<void> => {
    return ipcRenderer.invoke('config:set', overlay, config)
  },
  getDevMode: (): Promise<DevModeState> => {
    return ipcRenderer.invoke('devMode:get')
  },
  setDevMode: (patch: Partial<DevModeState>): Promise<void> => {
    return ipcRenderer.invoke('devMode:set', patch)
  },
  getShortcuts: (): Promise<ShortcutMap> => {
    return ipcRenderer.invoke('shortcuts:get')
  },
  setShortcut: (key: string, accel: string): Promise<{ ok: boolean; error?: string }> => {
    return ipcRenderer.invoke('shortcuts:set', key, accel)
  },
  resetPositions: (): Promise<void> => {
    return ipcRenderer.invoke('positions:reset')
  },
  // Window bounds for custom drag (bypasses OS window-snap constraints).
  // Width/height are included so the renderer can lock the size for the
  // duration of a drag — see `useDrag.ts` for the Windows-DPI rationale.
  getWindowBounds: (): Promise<{ x: number; y: number; width: number; height: number }> => {
    return ipcRenderer.invoke('window:getBounds')
  },
  setWindowBounds: (x: number, y: number, width: number, height: number): void => {
    ipcRenderer.send('window:setBounds', x, y, width, height)
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
  getStartupEnabled: (): Promise<boolean> => {
    return ipcRenderer.invoke('startup:get')
  },
  setStartupEnabled: (enable: boolean): Promise<void> => {
    return ipcRenderer.invoke('startup:set', enable)
  },
  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke('app:version')
  },
  getUpdateStatus: (): Promise<unknown> => {
    return ipcRenderer.invoke('update:getStatus')
  },
  checkForUpdates: (): Promise<void> => {
    return ipcRenderer.invoke('update:check')
  },
  downloadUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('update:download')
  },
  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('update:install')
  },
  onUpdateStatus: (callback: (status: unknown) => void) => {
    ipcRenderer.on('update:status', (_event, status) => callback(status))
  },
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('iracingOverlay', iracingOverlay)
} else {
  // @ts-ignore
  window.iracingOverlay = iracingOverlay
}
