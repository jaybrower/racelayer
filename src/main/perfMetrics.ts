// Performance metrics collection for the Perf HUD (issue #32).
//
// Off by default — toggled on via the secret global shortcut wired in
// `index.ts`.  When enabled:
//   • Renderers (each overlay) batch React-Profiler `actualDuration` samples
//     locally and flush them to main via `perf:recordRender` at ~2 Hz.  Off
//     means no IPC traffic at all from the renderer side.
//   • Main aggregates per-overlay rolling stats (p50 / p95 / max over the
//     last ~60 s of samples) and polls `app.getAppMetrics()` at 1 Hz for
//     per-process CPU + memory.
//   • Every 1 s while enabled, main broadcasts a `perf:snapshot` payload
//     so the Perf HUD renderer can render it.
//
// Disabled-state cost: a few bytes of state + one boolean check on each
// renderer commit.  No timers running, no IPC fanout.

import { app, BrowserWindow } from 'electron'

/** Max samples kept per overlay in the rolling window.
 *  At 10 Hz telemetry tick × 60 s of history = 600.  Slightly more than the
 *  default 60 s the issue asks for, so a transient hiccup at second 59 still
 *  shows up in p95 at second 60. */
const SAMPLE_WINDOW = 600

/** How often main rolls up samples + app metrics into a snapshot and
 *  broadcasts it.  1 Hz matches the HUD's update cadence — the HUD itself
 *  doesn't need to be reading state at full telemetry rate. */
const SNAPSHOT_INTERVAL_MS = 1000

/** Per-process CPU / memory derived from `app.getAppMetrics()` and packaged
 *  for the renderer.  Memory is in MB (working-set RSS); CPU is a 0–100
 *  percent of one core's worth of time over the sampling window Electron
 *  defines internally — see `Electron.ProcessMetric.cpu.percentCPUUsage`. */
export interface ProcessMetric {
  type: string                // 'Browser' (main), 'Tab' (renderer), 'GPU', 'Utility', 'Plugin', etc.
  name?: string               // best-effort window-title hint for renderers
  cpuPct: number
  memoryMB: number
}

export interface AppMetricsSnapshot {
  /** Sum of all process CPU%.  Useful as the headline "how much are we
   *  burning right now" number. */
  totalCpuPct: number
  /** Sum of all process working-set memory (MB). */
  totalMemoryMB: number
  perProcess: ProcessMetric[]
}

export interface OverlayPerfStats {
  /** Samples in the current rolling window (≤ SAMPLE_WINDOW). */
  count: number
  /** Median render duration, milliseconds. */
  p50: number
  /** 95th-percentile render duration, milliseconds. */
  p95: number
  /** Worst sample in the window, milliseconds. */
  max: number
  /** Mean of the window, milliseconds. */
  mean: number
}

export interface PerfSnapshot {
  enabled: boolean
  /** Wall-clock time (ms epoch) the snapshot was assembled. */
  collectedAt: number
  /** Per-overlay rolling stats, keyed by overlay name (`'gauges'`, `'relative'`, …). */
  overlays: Record<string, OverlayPerfStats>
  /** Whole-app process metrics from `app.getAppMetrics()`. */
  app: AppMetricsSnapshot
}

/** A flush from one renderer.  Renderer batches React-Profiler samples for
 *  ~500 ms then sends an array — cheaper than one IPC per commit. */
export interface RenderSampleBatch {
  overlayId: string
  /** Per-commit `actualDuration` values (ms).  Order doesn't matter; we just
   *  push into the ring buffer. */
  durations: number[]
}

// ── Private state ────────────────────────────────────────────────────────────

interface RingBuffer {
  /** Fixed-size buffer; older samples overwritten as new ones arrive. */
  data: Float32Array
  /** Index of the next slot to write to.  Wraps modulo SAMPLE_WINDOW. */
  cursor: number
  /** Total samples ever written (saturating at SAMPLE_WINDOW for windowed
   *  views).  Lets us distinguish "fewer than N samples seen" from "buffer
   *  is full" without a separate length counter. */
  written: number
}

function newRing(): RingBuffer {
  return { data: new Float32Array(SAMPLE_WINDOW), cursor: 0, written: 0 }
}

/** Number of valid samples currently in the buffer. */
function ringLength(r: RingBuffer): number {
  return Math.min(r.written, SAMPLE_WINDOW)
}

/** Return a sorted, length-trimmed snapshot of the buffer's contents (ms). */
function ringSorted(r: RingBuffer): number[] {
  const n = ringLength(r)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = r.data[i]
  out.sort((a, b) => a - b)
  return out
}

function ringPush(r: RingBuffer, v: number) {
  r.data[r.cursor] = v
  r.cursor = (r.cursor + 1) % SAMPLE_WINDOW
  r.written++
}

const buffers = new Map<string, RingBuffer>()

let enabled = false
let snapshotTimer: ReturnType<typeof setInterval> | null = null
let broadcaster: ((channel: string, data: unknown) => void) | null = null

// ── Public API ───────────────────────────────────────────────────────────────

/** Wire the broadcaster used to send `perf:enabled` and `perf:snapshot`
 *  events.  Mirrors how `registerConfigHandlers` accepts `broadcastToAll`
 *  rather than importing it back — avoids a circular dep with `index.ts`. */
export function initPerfMetrics(broadcast: (channel: string, data: unknown) => void): void {
  broadcaster = broadcast
}

export function isPerfEnabled(): boolean {
  return enabled
}

/** Turn collection on or off.  When turning on, kicks the 1 Hz snapshot
 *  timer and broadcasts `perf:enabled` so renderers know to start sampling.
 *  When turning off, clears the timer, drops all buffered samples, and tells
 *  renderers to stop flushing — back to zero-overhead. */
export function setPerfEnabled(on: boolean): void {
  if (on === enabled) return
  enabled = on

  if (on) {
    snapshotTimer = setInterval(broadcastSnapshot, SNAPSHOT_INTERVAL_MS)
    // Fire one immediately so the HUD has something to render on first paint.
    broadcastSnapshot()
  } else {
    if (snapshotTimer) clearInterval(snapshotTimer)
    snapshotTimer = null
    buffers.clear()
  }

  if (broadcaster) broadcaster('perf:enabled', enabled)
}

/** Record a batch of per-commit render durations from one overlay renderer.
 *  No-ops when collection is off so a renderer that mis-fires after a toggle
 *  doesn't accidentally allocate. */
export function recordRenderSamples(batch: RenderSampleBatch): void {
  if (!enabled) return
  if (!batch || !batch.overlayId || !Array.isArray(batch.durations)) return

  let ring = buffers.get(batch.overlayId)
  if (!ring) {
    ring = newRing()
    buffers.set(batch.overlayId, ring)
  }
  for (const d of batch.durations) {
    if (Number.isFinite(d) && d >= 0) ringPush(ring, d)
  }
}

/** Compute a snapshot of current per-overlay stats + app metrics.
 *  Exposed for tests and for the on-demand `perf:getSnapshot` IPC. */
export function computeSnapshot(): PerfSnapshot {
  const overlays: Record<string, OverlayPerfStats> = {}
  for (const [id, ring] of buffers) {
    overlays[id] = statsFromRing(ring)
  }

  return {
    enabled,
    collectedAt: Date.now(),
    overlays,
    app: appMetricsSnapshot(),
  }
}

function statsFromRing(r: RingBuffer): OverlayPerfStats {
  const sorted = ringSorted(r)
  const n = sorted.length
  if (n === 0) return { count: 0, p50: 0, p95: 0, max: 0, mean: 0 }

  const p50 = sorted[Math.floor((n - 1) * 0.5)]
  const p95 = sorted[Math.floor((n - 1) * 0.95)]
  const max = sorted[n - 1]
  let sum = 0
  for (let i = 0; i < n; i++) sum += sorted[i]
  return { count: n, p50, p95, max, mean: sum / n }
}

function appMetricsSnapshot(): AppMetricsSnapshot {
  // `app.getAppMetrics()` returns one entry per Electron child process
  // (main, GPU, each renderer, etc.).  We don't filter — the HUD wants to
  // show the breakdown so we can spot which overlay is the hot one.
  let totalCpuPct = 0
  let totalMemoryMB = 0
  const perProcess: ProcessMetric[] = []

  let raw: Electron.ProcessMetric[] = []
  try {
    raw = app.getAppMetrics()
  } catch {
    // `getAppMetrics()` can throw very early in app lifecycle or after quit.
    // Treat as no data rather than failing the snapshot.
    return { totalCpuPct: 0, totalMemoryMB: 0, perProcess: [] }
  }

  for (const m of raw) {
    const cpu = m.cpu?.percentCPUUsage ?? 0
    // `memory.workingSetSize` is in KB.
    const memMB = (m.memory?.workingSetSize ?? 0) / 1024
    totalCpuPct += cpu
    totalMemoryMB += memMB

    perProcess.push({
      type: m.type,
      name: nameFor(m),
      cpuPct: cpu,
      memoryMB: memMB,
    })
  }

  return { totalCpuPct, totalMemoryMB, perProcess }
}

/** Best-effort label for a renderer process so the HUD can show
 *  `Renderer: gauges` instead of just `Tab`.  Electron exposes the OS PID
 *  on the metric and on each `BrowserWindow` via `getOSProcessId()`, so we
 *  cross-reference the two. */
function nameFor(m: Electron.ProcessMetric): string | undefined {
  if (m.type !== 'Tab') return undefined
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      if (w.webContents.getOSProcessId() === m.pid) {
        return w.getTitle() || undefined
      }
    } catch {
      // Window may have been destroyed mid-iteration; skip.
    }
  }
  return undefined
}

function broadcastSnapshot() {
  if (!broadcaster) return
  broadcaster('perf:snapshot', computeSnapshot())
}
