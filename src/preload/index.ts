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
  // Window positioning for custom drag (bypasses OS window-snap constraints)
  getWindowPosition: (): Promise<{ x: number; y: number }> => {
    return ipcRenderer.invoke('window:getPosition')
  },
  setWindowPosition: (x: number, y: number): void => {
    ipcRenderer.send('window:setPosition', x, y)
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
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('iracingOverlay', iracingOverlay)
} else {
  // @ts-ignore
  window.iracingOverlay = iracingOverlay
}
