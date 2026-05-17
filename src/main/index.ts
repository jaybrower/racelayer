import { app, BrowserWindow, globalShortcut, screen, ipcMain, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { startTelemetryPolling, stopTelemetryPolling } from './telemetry.js'
import { registerConfigHandlers } from './config.js'
import { getPreviewMode, setPreviewMode } from './previewMode.js'
import { initShortcuts, registerShortcutIpc } from './shortcuts.js'
import { initUpdater, getUpdateStatus, checkForUpdates, downloadUpdate, quitAndInstall } from './updater.js'
import {
  initLogging,
  getLogLevelState,
  setLogLevel as applyLogLevel,
  resetLogLevel as resetLogLevelImpl,
  getLogPath as getUpdaterLogPath,
  openLogFolder,
  type LogLevel,
} from './logging.js'
import {
  initPerfMetrics,
  recordRenderSamples,
  computeSnapshot as computePerfSnapshot,
  isPerfEnabled,
  type RenderSampleBatch,
} from './perfMetrics.js'
import { togglePerfHud, getPerfHudWindow, flushPerfHud } from './perfHud.js'
import {
  initOverlayScale,
  applyScaleToWindow,
  handleScaleChange,
  getCurrentScale,
} from './overlayScale.js'
import type { IRacingTelemetry } from './telemetry.js'

/** Hardcoded global shortcut for the Perf HUD.  Deliberately undocumented in
 *  the user-facing Settings so it doesn't clutter the UI for the 99% of users
 *  who'll never need it.  Useful when remote-debugging perf reports from
 *  end users — tell them this combo, no app update required.  See #32. */
const PERF_HUD_SHORTCUT = 'CommandOrControl+Shift+Alt+P'

interface OverlayDef {
  name: string
  route: string
  width: number
  height: number
  x: number
  y: number
}

const windows = new Map<string, BrowserWindow>()
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let editMode = false
let overlaysVisible = false

function setOverlaysVisible(visible: boolean) {
  if (visible === overlaysVisible) return
  overlaysVisible = visible
  windows.forEach((win) => {
    if (win.isDestroyed()) return
    if (visible) {
      win.showInactive() // show without stealing focus from iRacing
    } else {
      win.hide()
    }
  })
}

function rendererUrl(route: string): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}#/${route}`
  }
  return `file://${join(__dirname, '../renderer/index.html')}#/${route}`
}

function createOverlayWindow(def: OverlayDef): BrowserWindow {
  const win = new BrowserWindow({
    width: def.width,
    height: def.height,
    x: def.x,
    y: def.y,
    show: false,       // hidden until iRacing reports connected
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    // Disable the Windows shell constraint that clamps windows to the work area
    enableLargerThanScreen: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })

  if (is.dev) {
    win.loadURL(rendererUrl(def.route))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: `/${def.route}`,
    })
  }

  // Apply the persisted global overlay scale (#14).  Hooks
  // `did-finish-load` so the zoom factor survives any future renderer
  // reload — every page load otherwise resets to 1.0.
  applyScaleToWindow(win)

  windows.set(def.name, win)
  return win
}

function createSettingsWindow(): BrowserWindow {
  // Restore size/position from the last session if we have one for the
  // current monitor configuration.  Width/height fall back to the hard-coded
  // defaults; x/y fall back to -1 which Electron treats as "OS-position"
  // (centred on the primary display on Windows) so a fresh install still
  // opens nicely centred.
  const saved = loadSettingsBounds()
  const width  = Math.max(SETTINGS_MIN_WIDTH,  saved?.width  ?? SETTINGS_DEFAULT_BOUNDS.width)
  const height = Math.max(SETTINGS_MIN_HEIGHT, saved?.height ?? SETTINGS_DEFAULT_BOUNDS.height)
  const winOpts: Electron.BrowserWindowConstructorOptions = {
    width,
    height,
    minWidth:  SETTINGS_MIN_WIDTH,
    minHeight: SETTINGS_MIN_HEIGHT,
    show: false,
    frame: true,
    title: 'RaceLayer — Settings',
    backgroundColor: '#0f172a',
    icon: appIcon('full'),
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    winOpts.x = saved.x
    winOpts.y = saved.y
  }
  const win = new BrowserWindow(winOpts)

  if (is.dev) {
    win.loadURL(rendererUrl('settings'))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/settings',
    })
  }

  // Persist size + position on every move / resize, debounced so a drag
  // doesn't fire dozens of disk writes per second.  500ms balances "saved
  // before the user moves on" against write amplification.
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => saveSettingsBounds(win), 500)
  }
  win.on('move', schedulePersist)
  win.on('resize', schedulePersist)

  // Hide instead of destroy so reopening is fast.  Flush any pending bounds
  // save synchronously here so the final on-screen state is what we persist
  // — without this, fast-close-after-resize could lose the last move.
  win.on('close', (e) => {
    e.preventDefault()
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    saveSettingsBounds(win)
    win.hide()
  })

  return win
}

function openSettings() {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = createSettingsWindow()
  }
  if (settingsWindow.isVisible()) {
    settingsWindow.hide()
  } else {
    settingsWindow.show()
  }
}

function buildTrayMenu() {
  const preview = getPreviewMode()
  return Menu.buildFromTemplate([
    { label: 'Settings', click: openSettings },
    { type: 'separator' },
    {
      label: 'Preview Mode',
      type: 'checkbox',
      checked: preview.enabled,
      click: (item) => {
        setPreviewMode({ enabled: item.checked })
        broadcastToAll('previewMode:changed', getPreviewMode())
        // Rebuild menu so session type items update
        if (tray) tray.setContextMenu(buildTrayMenu())
      },
    },
    {
      label: 'Session: Practice',
      type: 'radio',
      checked: preview.sessionType === 'practice',
      enabled: preview.enabled,
      click: () => {
        setPreviewMode({ sessionType: 'practice' })
        broadcastToAll('previewMode:changed', getPreviewMode())
        if (tray) tray.setContextMenu(buildTrayMenu())
      },
    },
    {
      label: 'Session: Qualifying',
      type: 'radio',
      checked: preview.sessionType === 'qualifying',
      enabled: preview.enabled,
      click: () => {
        setPreviewMode({ sessionType: 'qualifying' })
        broadcastToAll('previewMode:changed', getPreviewMode())
        if (tray) tray.setContextMenu(buildTrayMenu())
      },
    },
    {
      label: 'Session: Race',
      type: 'radio',
      checked: preview.sessionType === 'race',
      enabled: preview.enabled,
      click: () => {
        setPreviewMode({ sessionType: 'race' })
        broadcastToAll('previewMode:changed', getPreviewMode())
        if (tray) tray.setContextMenu(buildTrayMenu())
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        // `app.exit()` skips the close-event handlers, so flush the Settings
        // window bounds here as a belt-and-suspenders — otherwise a resize
        // followed immediately by tray-Quit can lose up to ~500ms of changes
        // sitting in the debounce timer.
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          saveSettingsBounds(settingsWindow)
        }
        flushPerfHud()
        app.exit()
      },
    },
  ])
}

function appIcon(size: 'full' | 'tray' = 'full'): Electron.NativeImage {
  const file = size === 'tray' ? 'icon-tray.png' : 'icon.png'
  const p = join(app.getAppPath(), 'resources', file)
  if (existsSync(p)) return nativeImage.createFromPath(p)
  return nativeImage.createEmpty()
}

function createTray() {
  tray = new Tray(appIcon('tray'))
  tray.setToolTip('RaceLayer')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', openSettings)
}

/** Send an IPC event to every overlay window — NOT the Settings window.
 *  Use this for high-frequency, overlay-specific channels like
 *  `telemetry:update` (~10 Hz) and `overlay:editMode`, where the Settings
 *  window neither subscribes nor benefits and the extra IPC traffic is waste. */
function broadcastToOverlays(channel: string, data: unknown) {
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  })
}

/** Send an IPC event to every window — overlays AND the Settings window AND
 *  the Perf HUD (if open).
 *
 *  Use this for *state-change* channels that any renderer might care about:
 *  `previewMode:changed`, `config:changed`, `update:status`,
 *  `log:level-changed`, etc.  Without this fan-out the receiving window
 *  doesn't learn about the change until something forces it to re-fetch
 *  state on its own.
 *
 *  Original `broadcastToAll` did NOT include the Settings window, so any
 *  state change driven from the tray or from the main process never
 *  propagated to Settings — visible to the user as Preview Mode getting
 *  out of sync between tray and Settings.  Subsequently the Perf HUD was
 *  added; same logic applies — anything that affects the level shown in
 *  the Debug panel (i.e. `log:level-changed`) needs to reach the HUD. */
function broadcastToAll(channel: string, data: unknown) {
  broadcastToOverlays(channel, data)
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(channel, data)
  }
  const hud = getPerfHudWindow()
  if (hud) hud.webContents.send(channel, data)
}

/** Channel-aware fan-out for perf-collection events.
 *
 *  • `perf:enabled` reaches **overlays + Perf HUD** — overlays need to know
 *    when to start / stop batching React-Profiler samples, and the HUD
 *    listens so it can render an "OFF" affordance while we're spinning up.
 *  • `perf:snapshot` reaches **Perf HUD only** at 1 Hz — the per-process
 *    payload is large-ish and overlays have no use for it.  Keeping it off
 *    the overlay channel matters because some overlays render at telemetry
 *    rate (~10 Hz) and we don't want to wake their event loop unnecessarily. */
function broadcastPerf(channel: string, data: unknown) {
  const hud = getPerfHudWindow()
  if (channel === 'perf:enabled') {
    broadcastToOverlays(channel, data)
    if (hud) hud.webContents.send(channel, data)
  } else if (channel === 'perf:snapshot') {
    if (hud) hud.webContents.send(channel, data)
  }
}

// ── Window position persistence (per monitor configuration) ──────────────────

/** Key that uniquely identifies the current monitor layout. */
function monitorKey(): string {
  return screen.getAllDisplays()
    .map(d => `${d.bounds.width}x${d.bounds.height}+${d.bounds.x}+${d.bounds.y}`)
    .sort()
    .join('_')
}

function positionsDir() {
  return join(app.getPath('userData'), 'config', 'overlays')
}

function positionsPath() {
  return join(positionsDir(), `positions_${monitorKey()}.json`)
}

/** Default overlay positions for the current primary display size. */
function defaultOverlayPositions(width: number, height: number): Record<string, { x: number; y: number }> {
  return {
    relative:       { x: 40,                            y: 80 },
    gauges:         { x: Math.round((width - 860) / 2), y: height - 200 },
    'pit-strategy': { x: width - 380,                   y: 80 },
    'tire-temps':   { x: width - 620,                   y: 80 },
    radar:          { x: width - 220,                   y: 80 },
  }
}

interface WindowLayout { x: number; y: number; width: number; height: number }

function saveWindowPositions() {
  const layouts: Record<string, WindowLayout> = {}
  windows.forEach((win, name) => {
    if (!win.isDestroyed()) {
      const [x, y] = win.getPosition()
      const [width, height] = win.getSize()
      layouts[name] = { x, y, width, height }
    }
  })
  const dir = positionsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(positionsPath(), JSON.stringify(layouts, null, 2), 'utf-8')
}

function loadWindowPositions(): Record<string, Partial<WindowLayout>> {
  const p = positionsPath()
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return {} }
}

// ── Settings window bounds persistence ────────────────────────────────────────
//
// Mirrors the overlay-position pattern (per-monitor-config file) but for the
// single Settings window.  Keyed by `monitorKey()` so unplugging or rearranging
// monitors yields defaults for that new layout instead of restoring an
// off-screen window.

const SETTINGS_DEFAULT_BOUNDS: WindowLayout = { x: -1, y: -1, width: 680, height: 560 }
const SETTINGS_MIN_WIDTH = 560
const SETTINGS_MIN_HEIGHT = 400

function settingsBoundsPath() {
  return join(positionsDir(), `settings_${monitorKey()}.json`)
}

function loadSettingsBounds(): Partial<WindowLayout> | null {
  const p = settingsBoundsPath()
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

function saveSettingsBounds(win: BrowserWindow) {
  if (win.isDestroyed()) return
  const [x, y] = win.getPosition()
  const [width, height] = win.getSize()
  const layout: WindowLayout = { x, y, width, height }
  const dir = positionsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(settingsBoundsPath(), JSON.stringify(layout, null, 2), 'utf-8')
}

function resetWindowPositions() {
  // Delete saved file for current monitor config
  const p = positionsPath()
  if (existsSync(p)) { try { unlinkSync(p) } catch {} }

  // Move all windows to their defaults
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const defaults = defaultOverlayPositions(width, height)
  windows.forEach((win, name) => {
    if (!win.isDestroyed() && defaults[name]) {
      win.setPosition(defaults[name].x, defaults[name].y)
    }
  })
}

function registerWindowIpc() {
  // Renderer asks for its own window bounds so it can compute drag deltas and
  // lock width/height for the duration of the drag.
  ipcMain.handle('window:getBounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { x: 0, y: 0, width: 0, height: 0 }
    const [x, y] = win.getPosition()
    const [width, height] = win.getSize()
    return { x, y, width, height }
  })

  // Renderer sends the desired new bounds during a drag. We always set the
  // full bounds (including width/height) rather than just position because
  // `setPosition`-only updates on Windows with DPI scaling let the OS reapply
  // size constraints between frames, causing the window to creep larger over
  // the course of a long drag. Re-asserting width/height every frame pins it.
  ipcMain.on(
    'window:setBounds',
    (event, x: number, y: number, width: number, height: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        win.setBounds({
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
        })
      }
    },
  )

  // Reset all overlay positions to defaults and delete the saved layout
  ipcMain.handle('positions:reset', () => resetWindowPositions())
}

function registerPreviewModeIpc() {
  ipcMain.handle('previewMode:get', () => getPreviewMode())

  ipcMain.handle('previewMode:set', (_event, patch: { enabled?: boolean; sessionType?: string }) => {
    setPreviewMode(patch as any)
    const state = getPreviewMode()
    broadcastToAll('previewMode:changed', state)
    if (tray) tray.setContextMenu(buildTrayMenu())
  })
}

function registerStartupIpc() {
  ipcMain.handle('startup:get', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('startup:set', (_event, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable })
  })
}

function registerUpdaterIpc() {
  ipcMain.handle('update:getStatus', () => getUpdateStatus())
  ipcMain.handle('update:check',     () => checkForUpdates())
  ipcMain.handle('update:download',  () => downloadUpdate())
  ipcMain.handle('update:install',   () => quitAndInstall())
  // Kept as an alias to the same path the new `log:getState` returns.
  // Existing renderers (Updates pane footer) can continue using
  // `getUpdaterLogPath`; new ones should reach for the log-system state.
  ipcMain.handle('update:getLogPath',() => getUpdaterLogPath())
  ipcMain.handle('app:version',      () => app.getVersion())
}

function registerShellIpc() {
  // Open external URLs in the user's default browser.  Only http(s) is allowed
  // so a compromised renderer can't be tricked into launching `file://`,
  // `javascript:`, custom URL handlers, etc.
  ipcMain.handle('app:openExternal', (_event, url: unknown) => {
    if (typeof url !== 'string') return
    if (!/^https?:\/\//i.test(url)) return
    shell.openExternal(url)
  })
}

function registerLogIpc() {
  // Initial state + on-demand re-query.  The Perf HUD pulls this on mount;
  // renderers also subscribe to `log:level-changed` for push updates.
  ipcMain.handle('log:getState', () => getLogLevelState())

  // Apply a user override.  Persists to disk + broadcasts the new state.
  ipcMain.handle('log:setLevel', (_event, level: unknown) => {
    if (typeof level !== 'string') return getLogLevelState()
    applyLogLevel(level as LogLevel)
    return getLogLevelState()
  })

  // Clear the override; revert to the build-tier default.
  ipcMain.handle('log:resetLevel', () => {
    resetLogLevelImpl()
    return getLogLevelState()
  })

  // Open the log folder in the OS file browser.  Returns the empty string
  // on success per `shell.openPath`; non-empty string is an error message.
  ipcMain.handle('log:reveal', () => openLogFolder())
}

function registerPerfIpc() {
  // Renderer (overlay) flushes a batch of React-Profiler `actualDuration`
  // samples it accumulated since the last flush.  Cheaper than one IPC per
  // commit at 10 Hz × 5 overlays = 50 msgs/sec.
  ipcMain.on('perf:recordRender', (_event, batch: RenderSampleBatch) => {
    recordRenderSamples(batch)
  })

  // Overlays / HUD ask whether collection is currently active.  Used on
  // mount to decide whether to attach the React.Profiler wrapper.
  ipcMain.handle('perf:getEnabled', () => isPerfEnabled())

  // On-demand snapshot pull (debug / one-off inspections).  The 1 Hz push
  // via `perf:snapshot` is the normal HUD path; this is a fallback for
  // anything that wants synchronous data.
  ipcMain.handle('perf:getSnapshot', () => computePerfSnapshot())
}

app.whenReady().then(async () => {
  // Logging must initialise before anything else that writes logs — see
  // comment in `src/main/updater.ts`.  Otherwise the updater module logs to
  // electron-log's pre-init no-op transport and we miss the first events.
  initLogging(broadcastToAll)

  // Read + cache the persisted overlay scale BEFORE the config handlers
  // run.  `createOverlayWindow` → `applyScaleToWindow` reads this value
  // at window-create time; if it's not initialised yet, windows would
  // open at 1.0× regardless of the user's saved preference.  See #14.
  initOverlayScale()

  registerConfigHandlers(broadcastToAll, (overlay, config) => {
    // React to the user changing the overlay scale in Settings → General.
    // `handleScaleChange` is a no-op when the scale value hasn't actually
    // changed (or is invalid), so it's safe to call on every config:set
    // — we don't need to diff here.  See `src/main/overlayScale.ts`.
    if (overlay === 'overlayConfig') {
      const newScale =
        (config as { global?: { overlayScale?: unknown } } | null)?.global?.overlayScale
      handleScaleChange(newScale, windows.values())
    }
  })
  registerWindowIpc()
  registerPreviewModeIpc()
  registerStartupIpc()
  registerShellIpc()
  registerUpdaterIpc()
  registerLogIpc()
  registerPerfIpc()
  initUpdater(broadcastToAll)
  initPerfMetrics(broadcastPerf)

  // Use actual display bounds so positions scale to any monitor/DPI
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const savedPositions = loadWindowPositions()
  const defaults = defaultOverlayPositions(width, height)

  const OVERLAYS: OverlayDef[] = [
    { name: 'relative',     route: 'relative',     width: 460, height: 520, ...defaults.relative },
    { name: 'gauges',       route: 'gauges',        width: 860, height: 180, ...defaults.gauges },
    { name: 'pit-strategy', route: 'pit-strategy',  width: 360, height: 420, ...defaults['pit-strategy'] },
    { name: 'tire-temps',   route: 'tire-temps',    width: 220, height: 145, ...defaults['tire-temps'] },
    // Radar — re-enabled in v0.1.4 alongside the CarLeftRight enum fix so the
    // amber side-edge indicators can be verified against real telemetry. The
    // gap-strip portion still uses `CarIdxF2Time` which isn't granular enough
    // for a proper proximity display; revisit positional data in a future
    // release. Default-disabled in `RadarConfig.enabled` so the window stays
    // empty/hidden until the user opts in via Settings.
    { name: 'radar', route: 'radar', width: 180, height: 240, ...defaults.radar },
  ]

  // If the user has a non-default overlay scale persisted but NO saved
  // bounds yet (first launch after they bumped scale in Settings before
  // ever dragging an overlay, or after a config-reset that wiped bounds),
  // default-sized windows would be too small to fit their zoomed content.
  // Multiply the per-overlay defaults by the current scale so the initial
  // window dimensions match what `webContents.setZoomFactor` will render.
  // Saved bounds skip this — they're already at-scale from their last
  // save.  See #14.
  const initialScale = getCurrentScale()

  for (const def of OVERLAYS) {
    const saved = savedPositions[def.name]
    createOverlayWindow(saved ? {
      ...def,
      x:      saved.x      ?? def.x,
      y:      saved.y      ?? def.y,
      width:  saved.width  ?? def.width,
      height: saved.height ?? def.height,
    } : {
      ...def,
      width:  Math.round(def.width  * initialScale),
      height: Math.round(def.height * initialScale),
    })
  }

  settingsWindow = createSettingsWindow()
  createTray()

  registerShortcutIpc()
  initShortcuts({
    editMode: () => {
      editMode = !editMode
      windows.forEach((win) => {
        win.setIgnoreMouseEvents(!editMode, { forward: true })
      })
      broadcastToOverlays('overlay:editMode', editMode)
      // Persist positions when the user locks layout
      if (!editMode) saveWindowPositions()
    },
    openSettings,
  })

  // Secret Perf HUD shortcut — not exposed in Settings → Shortcuts because
  // it's a developer / support-debug tool, not a normal user feature.
  // Documented in `docs/performance.md` for end users who hit perf issues.
  const perfOk = globalShortcut.register(PERF_HUD_SHORTCUT, togglePerfHud)
  console.log(`[shortcuts] ${PERF_HUD_SHORTCUT} (perfHud): ${perfOk ? 'ok' : 'FAILED — already claimed'}`)

  await startTelemetryPolling((telemetry: IRacingTelemetry) => {
    setOverlaysVisible(telemetry.connected)
    if (telemetry.connected) {
      broadcastToOverlays('telemetry:update', telemetry)
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopTelemetryPolling()
  flushPerfHud()
})

app.on('window-all-closed', () => {
  // intentionally empty — overlay app stays alive
})
