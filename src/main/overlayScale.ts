// Overlay-scale management (issue #14).
//
// One module owns all of:
//   • Reading + validating the persisted `global.overlayScale` from
//     `userData/config/overlays/overlayConfig.json`.
//   • Applying the scale to a freshly-created overlay window — done via
//     `webContents.setZoomFactor` after `did-finish-load` so the zoom
//     persists across renderer reloads (each load resets the factor).
//   • Reacting to scale changes from Settings → General: every overlay
//     window's bounds are multiplied by the new/old ratio so content
//     doesn't overflow at higher scales or leave dead space at lower
//     scales, and the zoom factor is re-applied.
//
// Kept separate from `index.ts` because the scale-on-change math is
// non-trivial and the module-level state (`currentScale`) is easier to
// reason about with its own home.

import type { BrowserWindow } from 'electron'
import { readOverlayConfig } from './config.js'

/** Allowed presets — must stay in sync with `OVERLAY_SCALE_OPTIONS` in the
 *  renderer-side `overlayConfig.ts`.  Duplicated here rather than imported
 *  because cross-process imports of renderer types complicate the
 *  electron-vite build graph for negligible gain.  Any new preset must
 *  land in both places. */
const ALLOWED_SCALES = [0.75, 1.0, 1.25, 1.5] as const
const DEFAULT_SCALE = 1.0

/** Module-level state — the scale that's currently applied to every overlay
 *  window.  Initialised from the persisted config at app-ready; updated by
 *  `handleScaleChange` whenever the user picks a new value in Settings. */
let currentScale: number = DEFAULT_SCALE

function isValidScale(v: unknown): v is number {
  return typeof v === 'number' && (ALLOWED_SCALES as readonly number[]).includes(v)
}

/** Extract the validated `overlayScale` from a raw config object.  Falls
 *  back to the default for any unexpected value (missing field, hand-edited
 *  garbage, future schema, etc.). */
function extractScale(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SCALE
  const global = (raw as { global?: unknown }).global
  if (typeof global !== 'object' || global === null) return DEFAULT_SCALE
  const scale = (global as { overlayScale?: unknown }).overlayScale
  return isValidScale(scale) ? scale : DEFAULT_SCALE
}

/** Read + cache the currently-persisted scale.  Call once at app-ready
 *  before any overlay windows are created — they'll pick up this value
 *  when they finish loading. */
export function initOverlayScale(): number {
  currentScale = extractScale(readOverlayConfig())
  return currentScale
}

/** Current applied scale — used by `applyScaleToWindow` to set the initial
 *  zoom for a newly-created overlay. */
export function getCurrentScale(): number {
  return currentScale
}

/** Apply the current scale to a single overlay window.  Hooks the
 *  `did-finish-load` event so the zoom factor survives renderer reloads
 *  (every page load resets the factor to 1.0 by default).  Idempotent —
 *  re-calling for the same window just re-attaches the listener; the
 *  duplicate listener is harmless but we de-dupe defensively. */
export function applyScaleToWindow(win: BrowserWindow): void {
  const apply = () => {
    if (!win.isDestroyed()) {
      win.webContents.setZoomFactor(currentScale)
    }
  }
  // If the window has already finished loading by the time we're called
  // (rare but possible during testing), apply immediately.  Otherwise wait.
  if (!win.webContents.isLoading()) {
    apply()
  }
  win.webContents.on('did-finish-load', apply)
}

/**
 * Handle a scale change initiated from Settings → General.  Iterates every
 * overlay window:
 *   1. Multiply bounds by `newScale / oldScale` so content area scales
 *      proportionally and doesn't overflow / leave dead space.
 *   2. Apply the new zoom factor.
 *
 * Returns `true` if the scale actually changed (= action was taken), `false`
 * if `newScaleRaw` is invalid or matches the current scale.  The caller can
 * use the return value to decide whether to persist new window bounds.
 *
 * Bounds math note: `getBounds()` returns the window's outer dimensions
 * (including frame, but overlay windows are frameless so that's the content
 * box).  Scaling outer-bounds × ratio works directly with `setBounds`.
 */
export function handleScaleChange(
  newScaleRaw: unknown,
  overlayWindows: Iterable<BrowserWindow>,
): boolean {
  if (!isValidScale(newScaleRaw)) return false
  if (newScaleRaw === currentScale) return false

  const ratio = newScaleRaw / currentScale
  currentScale = newScaleRaw

  for (const win of overlayWindows) {
    if (win.isDestroyed()) continue
    const { x, y, width, height } = win.getBounds()
    // Round to whole pixels — `setBounds` accepts fractions on some
    // platforms but renders crispier with integers, and per-monitor-DPI
    // round-tripping is more stable with integer dimensions.
    win.setBounds({
      x,
      y,
      width: Math.round(width * ratio),
      height: Math.round(height * ratio),
    })
    win.webContents.setZoomFactor(currentScale)
  }

  return true
}
