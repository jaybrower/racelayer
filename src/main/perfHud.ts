// Perf HUD window — a tiny, transparent, always-on-top overlay that renders
// the rolling render-time and process-metrics snapshots from `perfMetrics.ts`.
//
// Default off; the window is created lazily on first toggle and then hidden
// rather than destroyed so re-toggling is instant.  Position is persisted
// per monitor configuration so it doesn't reappear off-screen after a
// monitor swap.

import { BrowserWindow, app, screen } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { setPerfEnabled, isPerfEnabled } from './perfMetrics.js'

interface HudBounds { x: number; y: number; width: number; height: number }

// Height accounts for: header (~20) + CPU/MEM summary (~60) + render-time
// table (header + 5 rows ≈ 110) + top-processes table (header + ~3 rows ≈ 70)
// + Debug panel (~110) + gaps/padding (~30) ≈ ~410.  Round up to 460 for
// breathing room.  Users with bounds saved from before this default landed
// keep their old size — the container is scrollable so it works at any
// size, this is just the first-launch nicety.
const HUD_DEFAULT_SIZE = { width: 320, height: 460 }

let hudWindow: BrowserWindow | null = null

function rendererUrl(route: string): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}#/${route}`
  }
  return `file://${join(__dirname, '../renderer/index.html')}#/${route}`
}

// ── Bounds persistence (per monitor configuration, same pattern as Settings) ─

function monitorKey(): string {
  return screen.getAllDisplays()
    .map((d) => `${d.bounds.width}x${d.bounds.height}+${d.bounds.x}+${d.bounds.y}`)
    .sort()
    .join('_')
}

function boundsDir(): string {
  return join(app.getPath('userData'), 'config', 'overlays')
}

function boundsPath(): string {
  return join(boundsDir(), `perfHud_${monitorKey()}.json`)
}

function loadHudBounds(): Partial<HudBounds> | null {
  const p = boundsPath()
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

function saveHudBounds(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const [x, y] = win.getPosition()
  const [width, height] = win.getSize()
  const dir = boundsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(boundsPath(), JSON.stringify({ x, y, width, height }, null, 2), 'utf-8')
}

// ── Window factory ───────────────────────────────────────────────────────────

function createHudWindow(): BrowserWindow {
  const saved = loadHudBounds()
  // Default position: top-right corner of the primary work area, offset down
  // so it doesn't fight with the system tray's notification area.
  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize
  const defaultX = screenW - HUD_DEFAULT_SIZE.width - 16
  const defaultY = 60

  const winOpts: Electron.BrowserWindowConstructorOptions = {
    width:  saved?.width  ?? HUD_DEFAULT_SIZE.width,
    height: saved?.height ?? HUD_DEFAULT_SIZE.height,
    x: saved?.x ?? defaultX,
    y: saved?.y ?? defaultY,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    // Same DPI escape hatch as the other overlays — see `index.ts` for why.
    enableLargerThanScreen: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }

  const win = new BrowserWindow(winOpts)
  win.setAlwaysOnTop(true, 'screen-saver')
  // HUD is read-only — let clicks pass through to whatever's underneath.
  // Edit-mode users move it via the drag handle (the title bar area).
  // For now keep mouse events on so users can drag/resize it without a custom handle.

  if (is.dev) {
    win.loadURL(rendererUrl('perf-hud'))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/perf-hud' })
  }

  // Persist size + position on move/resize, debounced — same shape as Settings.
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => saveHudBounds(win), 500)
  }
  win.on('move', schedulePersist)
  win.on('resize', schedulePersist)

  // Toggling the shortcut while the HUD is visible should hide it, not quit
  // collection — but the user can also dismiss via the window's own close
  // button (if we add one).  Hide instead of destroy so re-show is instant.
  win.on('close', (e) => {
    e.preventDefault()
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    saveHudBounds(win)
    win.hide()
    // Hiding the window also stops perf collection — there's nothing left to
    // render to, and the dev cost of leaving it running is wasted.
    setPerfEnabled(false)
  })

  return win
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Toggle the Perf HUD visibility.  Wired to the secret global shortcut from
 *  `index.ts`.  First call lazily creates the window; subsequent calls
 *  hide/show without re-creating.  Toggling on enables perf collection;
 *  toggling off disables it (zero overhead when hidden). */
export function togglePerfHud(): void {
  if (!hudWindow || hudWindow.isDestroyed()) {
    hudWindow = createHudWindow()
  }

  if (hudWindow.isVisible()) {
    hudWindow.hide()
    setPerfEnabled(false)
  } else {
    hudWindow.showInactive() // don't steal focus from iRacing
    setPerfEnabled(true)
  }
}

/** Used by the broadcaster wiring in `index.ts` so per-snapshot fan-out can
 *  reach the HUD window even though it isn't in the main `windows` map. */
export function getPerfHudWindow(): BrowserWindow | null {
  return hudWindow && !hudWindow.isDestroyed() ? hudWindow : null
}

/** Best-effort cleanup on app quit so a final resize gets persisted. */
export function flushPerfHud(): void {
  if (hudWindow && !hudWindow.isDestroyed() && isPerfEnabled()) {
    saveHudBounds(hudWindow)
  }
}
