// Perf HUD renderer (issue #32).
//
// Tiny transparent always-on-top window that visualises the rolling render-
// time and process-metrics snapshots pushed from main at 1 Hz.  Toggled via
// the `CommandOrControl+Shift+Alt+P` global shortcut wired in
// `src/main/index.ts`.  See `docs/performance.md` for how to use it.
//
// Render shape: header (CPU / mem totals), per-overlay table (p50/p95/max),
// per-process table (top CPU consumers).  Everything is read-only.

import { useEffect, useState } from 'react'
import { useDrag } from '../../hooks/useDrag'
import styles from './PerfHud.module.css'

/** Order in which overlay rows render — matches the on-screen reading order
 *  of the overlays themselves (top-left → top-right → bottom).  IDs missing
 *  from a snapshot are skipped silently. */
const OVERLAY_ORDER = ['relative', 'gauges', 'pit-strategy', 'tire-temps', 'radar'] as const

/** How many top processes to surface in the per-process table.  Keeping it
 *  small avoids a wall of GPU / Utility entries with negligible CPU. */
const TOP_PROCESS_COUNT = 6

function fmtMs(v: number): string {
  if (!isFinite(v) || v <= 0) return '—'
  return v < 10 ? v.toFixed(2) : v.toFixed(1)
}

function fmtPct(v: number): string {
  if (!isFinite(v)) return '—'
  return v < 10 ? v.toFixed(1) : Math.round(v).toString()
}

function fmtMB(v: number): string {
  if (!isFinite(v)) return '—'
  return Math.round(v).toString()
}

/** Visual cue for render-time hot spots.  16.7 ms is the 60 Hz frame budget,
 *  so anything close to that on a single React commit is worth a flag.  These
 *  thresholds are intentionally conservative for v1 — we'll calibrate them
 *  against real baseline numbers once #32's measurement pass is done. */
function p95Color(p95: number): string | undefined {
  if (p95 <= 0) return undefined
  if (p95 < 4) return '#4ade80'   // green: well under one frame
  if (p95 < 8) return '#fbbf24'   // amber: half-frame
  return '#f87171'                // red: over half-frame — likely visible jank
}

function overlayLabel(id: string): string {
  switch (id) {
    case 'pit-strategy': return 'Pit Strategy'
    case 'tire-temps':   return 'Tire Temps'
    default:             return id.charAt(0).toUpperCase() + id.slice(1)
  }
}

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug']

function buildTierLabel(tier: LogBuildTier): string {
  switch (tier) {
    case 'dev':        return 'dev build'
    case 'prerelease': return 'prerelease build'
    case 'stable':     return 'stable build'
  }
}

export default function PerfHud() {
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null)
  const [logState, setLogState] = useState<LogLevelState | null>(null)
  // The Perf HUD is a dev / support-debug tool that's only ever visible when
  // the user has explicitly toggled it on, so we make it always-draggable
  // rather than gating drag behind the global Layout Mode shortcut.  The main
  // process doesn't broadcast `overlay:editMode` to the HUD window anyway
  // (it's not in the overlay-window map).
  const { onMouseDown, dragging } = useDrag(true)

  useEffect(() => {
    // Initial pull so we have something to render before the first 1 Hz tick.
    window.iracingOverlay.getPerfSnapshot().then((s) => setSnapshot(s as PerfSnapshot))
    window.iracingOverlay.onPerfSnapshot((s) => setSnapshot(s as PerfSnapshot))
    return () => window.iracingOverlay.removeAllListeners('perf:snapshot')
  }, [])

  // Log-level state.  Pulled once on mount, kept in sync via the broadcast
  // channel so updates from elsewhere (or future re-broadcasts) flow through
  // without needing manual refresh.
  useEffect(() => {
    window.iracingOverlay.getLogState().then(setLogState)
    window.iracingOverlay.onLogLevelChanged(setLogState)
    return () => window.iracingOverlay.removeAllListeners('log:level-changed')
  }, [])

  // Click handlers — async wrappers so errors don't unhandled-reject.  Both
  // RPCs return the new state, but we also rely on the broadcast for consistency
  // with future external triggers (e.g. a CLI flag flipping the level).
  const onSetLevel = (level: LogLevel) => {
    window.iracingOverlay.setLogLevel(level).then(setLogState).catch(() => {})
  }
  const onResetLevel = () => {
    window.iracingOverlay.resetLogLevel().then(setLogState).catch(() => {})
  }
  const onRevealLogs = () => {
    window.iracingOverlay.revealLogFolder().catch(() => {})
  }

  const topProcesses = snapshot
    ? [...snapshot.app.perProcess]
        .sort((a, b) => b.cpuPct - a.cpuPct)
        .slice(0, TOP_PROCESS_COUNT)
    : []

  return (
    <div
      className={styles.container}
      onMouseDown={onMouseDown}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <div className={styles.header}>
        <span className={styles.title}>PERF</span>
        <span className={styles.shortcut}>Ctrl+Shift+Alt+P</span>
      </div>

      {!snapshot && <div className={styles.muted}>Waiting for first snapshot…</div>}

      {snapshot && (
        <>
          {/* Top-line: total CPU + total memory across all RaceLayer processes */}
          <div className={styles.summary}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>CPU</span>
              <span className={styles.summaryValue}>{fmtPct(snapshot.app.totalCpuPct)}%</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>MEM</span>
              <span className={styles.summaryValue}>{fmtMB(snapshot.app.totalMemoryMB)} MB</span>
            </div>
          </div>

          {/* Per-overlay render-time table */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Render time (ms)</div>
            <div className={styles.tableHeader}>
              <span>Overlay</span>
              <span>p50</span>
              <span>p95</span>
              <span>max</span>
              <span>n</span>
            </div>
            {OVERLAY_ORDER.map((id) => {
              const s = snapshot.overlays[id]
              if (!s) {
                return (
                  <div key={id} className={`${styles.tableRow} ${styles.idleRow}`}>
                    <span>{overlayLabel(id)}</span>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>0</span>
                  </div>
                )
              }
              return (
                <div key={id} className={styles.tableRow}>
                  <span>{overlayLabel(id)}</span>
                  <span>{fmtMs(s.p50)}</span>
                  <span style={{ color: p95Color(s.p95) }}>{fmtMs(s.p95)}</span>
                  <span>{fmtMs(s.max)}</span>
                  <span className={styles.muted}>{s.count}</span>
                </div>
              )
            })}
          </div>

          {/* Top-N processes by CPU% */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Top processes</div>
            <div className={styles.tableHeader}>
              <span>Process</span>
              <span>CPU</span>
              <span>MEM</span>
            </div>
            {topProcesses.map((p, i) => (
              <div key={i} className={styles.tableRowSmall}>
                <span className={styles.processLabel}>
                  {p.type}
                  {p.name ? <span className={styles.processName}> · {p.name}</span> : null}
                </span>
                <span>{fmtPct(p.cpuPct)}%</span>
                <span>{fmtMB(p.memoryMB)} MB</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Debug panel (issue #50) ───────────────────────────────────────────
          Lets dev / support sessions raise the log level without rebuilding.
          Hidden from the regular Settings UI to stay out of end users' way;
          the only way in is the same secret Ctrl+Shift+Alt+P shortcut that
          opens this HUD in the first place. */}
      {logState && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Debug</div>

          <div className={styles.debugLevelRow}>
            <span className={styles.debugLevelLabel}>Log level</span>
            <div className={styles.debugLevelSegmented}>
              {LOG_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`${styles.debugLevelBtn} ${logState.level === level ? styles.debugLevelBtnActive : ''}`}
                  onClick={() => onSetLevel(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.debugMeta}>
            <span className={styles.muted}>
              Default: <code>{logState.default}</code> ({buildTierLabel(logState.buildTier)})
            </span>
            {logState.isOverride && (
              <button
                type="button"
                className={styles.debugResetBtn}
                onClick={onResetLevel}
              >
                Reset to default
              </button>
            )}
          </div>

          <button
            type="button"
            className={styles.debugRevealBtn}
            onClick={onRevealLogs}
          >
            Reveal logs in Explorer
          </button>
        </div>
      )}
    </div>
  )
}
