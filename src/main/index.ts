import { app, BrowserWindow, globalShortcut, screen, ipcMain, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { startTelemetryPolling, stopTelemetryPolling } from './telemetry.js'
import { registerConfigHandlers } from './config.js'
import { getPreviewMode, setPreviewMode } from './previewMode.js'
import { initShortcuts, registerShortcutIpc } from './shortcuts.js'
import { initUpdater, getUpdateStatus, checkForUpdates, downloadUpdate, quitAndInstall } from './updater.js'
import type { IRacingTelemetry } from './telemetry.js'

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

  windows.set(def.name, win)
  return win
}

function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 680,
    height: 560,
    minWidth: 560,
    minHeight: 400,
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
  })

  if (is.dev) {
    win.loadURL(rendererUrl('settings'))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/settings',
    })
  }

  // Hide instead of destroy so reopening is fast
  win.on('close', (e) => {
    e.preventDefault()
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
    { label: 'Quit', click: () => app.exit() },
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

function broadcastToAll(channel: string, data: unknown) {
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  })
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

app.whenReady().then(async () => {
  registerConfigHandlers(broadcastToAll)
  registerWindowIpc()
  registerPreviewModeIpc()
  registerStartupIpc()
  registerShellIpc()
  registerUpdaterIpc()
  initUpdater(broadcastToAll)

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

  for (const def of OVERLAYS) {
    const saved = savedPositions[def.name]
    createOverlayWindow(saved ? {
      ...def,
      x:      saved.x      ?? def.x,
      y:      saved.y      ?? def.y,
      width:  saved.width  ?? def.width,
      height: saved.height ?? def.height,
    } : def)
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
      broadcastToAll('overlay:editMode', editMode)
      // Persist positions when the user locks layout
      if (!editMode) saveWindowPositions()
    },
    openSettings,
  })

  await startTelemetryPolling((telemetry: IRacingTelemetry) => {
    setOverlaysVisible(telemetry.connected)
    if (telemetry.connected) {
      broadcastToAll('telemetry:update', telemetry)
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopTelemetryPolling()
})

app.on('window-all-closed', () => {
  // intentionally empty — overlay app stays alive
})
