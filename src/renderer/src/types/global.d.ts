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
  | { state: 'dev' }

/** Available log levels (issue #50).  Ordered from quietest to loudest. */
type LogLevel = 'error' | 'warn' | 'info' | 'debug'

type LogBuildTier = 'dev' | 'prerelease' | 'stable'

/** Snapshot of the logging system's current state. */
interface LogLevelState {
  level: LogLevel
  default: LogLevel
  buildTier: LogBuildTier
  isOverride: boolean
}

/** Rolling render-time stats for one overlay. */
interface OverlayPerfStats {
  count: number   // samples in window
  p50: number     // ms
  p95: number     // ms
  max: number     // ms
  mean: number    // ms
}

/** One Electron process entry from `app.getAppMetrics()`, packaged for the HUD. */
interface PerfProcessMetric {
  type: string
  name?: string
  cpuPct: number
  memoryMB: number
}

/** Whole-app metrics snapshot. */
interface PerfAppMetrics {
  totalCpuPct: number
  totalMemoryMB: number
  perProcess: PerfProcessMetric[]
}

/** Snapshot pushed at 1 Hz when perf collection is enabled. */
interface PerfSnapshot {
  enabled: boolean
  collectedAt: number
  overlays: Record<string, OverlayPerfStats>
  app: PerfAppMetrics
}

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
    getUpdaterLogPath: () => Promise<string>
    // Log-level controls (issue #50) — see `src/main/logging.ts`.
    getLogState: () => Promise<LogLevelState>
    setLogLevel: (level: LogLevel) => Promise<LogLevelState>
    resetLogLevel: () => Promise<LogLevelState>
    revealLogFolder: () => Promise<string>
    onLogLevelChanged: (callback: (state: LogLevelState) => void) => void
    openExternal: (url: string) => Promise<void>
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => void
    // Perf HUD plumbing (issue #32) — see `src/main/perfMetrics.ts`.
    reportRenderSamples: (overlayId: string, durations: number[]) => void
    getPerfEnabled: () => Promise<boolean>
    getPerfSnapshot: () => Promise<PerfSnapshot>
    onPerfEnabled: (callback: (enabled: boolean) => void) => void
    onPerfSnapshot: (callback: (snapshot: PerfSnapshot) => void) => void
  }
}
