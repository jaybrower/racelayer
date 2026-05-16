import { contextBridge, ipcRenderer } from 'electron'

export interface PreviewModeState {
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
  onPreviewModeChanged: (callback: (state: PreviewModeState) => void) => {
    ipcRenderer.on('previewMode:changed', (_event, state) => callback(state))
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
  getPreviewMode: (): Promise<PreviewModeState> => {
    return ipcRenderer.invoke('previewMode:get')
  },
  setPreviewMode: (patch: Partial<PreviewModeState>): Promise<void> => {
    return ipcRenderer.invoke('previewMode:set', patch)
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
  getUpdaterLogPath: (): Promise<string> => {
    return ipcRenderer.invoke('update:getLogPath')
  },
  // ── Log-level controls (issue #50) ────────────────────────────────────────
  // Surfaced in the Perf HUD; the regular Settings UI doesn't expose these
  // because they're a dev / support-debug tool, not a normal user feature.
  // See `src/main/logging.ts` for the build-tier default policy.
  getLogState: (): Promise<unknown> => {
    return ipcRenderer.invoke('log:getState')
  },
  setLogLevel: (level: string): Promise<unknown> => {
    return ipcRenderer.invoke('log:setLevel', level)
  },
  resetLogLevel: (): Promise<unknown> => {
    return ipcRenderer.invoke('log:resetLevel')
  },
  revealLogFolder: (): Promise<string> => {
    return ipcRenderer.invoke('log:reveal')
  },
  onLogLevelChanged: (callback: (state: unknown) => void) => {
    ipcRenderer.on('log:level-changed', (_event, state) => callback(state))
  },
  // Open an http(s) URL in the user's default browser.  Main-process side
  // validates the scheme so a compromised renderer can't launch arbitrary
  // protocols.
  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke('app:openExternal', url)
  },
  onUpdateStatus: (callback: (status: unknown) => void) => {
    ipcRenderer.on('update:status', (_event, status) => callback(status))
  },
  // ── Perf-HUD plumbing (issue #32) ──────────────────────────────────────────
  // All no-ops when collection is disabled in main, so leaving them wired up
  // in overlays has zero cost.  See `src/main/perfMetrics.ts` for the
  // batching / aggregation strategy.
  reportRenderSamples: (overlayId: string, durations: number[]): void => {
    ipcRenderer.send('perf:recordRender', { overlayId, durations })
  },
  getPerfEnabled: (): Promise<boolean> => {
    return ipcRenderer.invoke('perf:getEnabled')
  },
  getPerfSnapshot: (): Promise<unknown> => {
    return ipcRenderer.invoke('perf:getSnapshot')
  },
  onPerfEnabled: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('perf:enabled', (_event, enabled) => callback(enabled))
  },
  onPerfSnapshot: (callback: (snapshot: unknown) => void) => {
    ipcRenderer.on('perf:snapshot', (_event, snapshot) => callback(snapshot))
  },
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('iracingOverlay', iracingOverlay)
} else {
  // @ts-ignore
  window.iracingOverlay = iracingOverlay
}
