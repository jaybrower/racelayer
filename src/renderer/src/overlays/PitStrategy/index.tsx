import { useMemo, useRef, useEffect } from 'react'
import { useTelemetry } from '../../contexts/TelemetryContext'
import { useEditMode } from '../../hooks/useEditMode'
import { useDrag } from '../../hooks/useDrag'
import { useOverlayConfig } from '../../contexts/OverlayConfigContext'
import styles from './PitStrategy.module.css'

const LAP_TIME_ESTIMATE = 92   // seconds — used only as last-resort estimate on lap 1
// Minimum fuelUsePerHour (L/hr) to consider the car actually moving.
// At idle the engine burns ~1–2 L/hr which would produce absurdly high laps-remaining.
const MIN_DRIVING_FUEL_RATE = 5

function formatTime(s: number): string {
  if (s <= 0) return '--:--.---'
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(3).padStart(6, '0')
  return `${m}:${sec}`
}

interface LapRecord {
  lap: number
  time: number
  /** True when the player was on pit road at any point during this lap — i.e.
   *  it's an out-lap, in-lap, or a lap that included a full pit stop.  These
   *  laps are excluded from tire-deg analysis because their times don't reflect
   *  tire wear (partial distance, cold tires, refuel delta, etc.). */
  pitAffected: boolean
}

export default function PitStrategy() {
  const t = useTelemetry()
  const { config } = useOverlayConfig()

  // ── Lap-time history ─────────────────────────────────────────────────────────
  // Stores every completed lap; diffs are always computed at render time against
  // the current session best so they update live as the baseline improves.
  const lapHistoryRef = useRef<LapRecord[]>([])
  const lastTrackedLapRef = useRef<number>(0)

  // Sticky flag: set true any tick the player is on pit road during the current
  // lap, reset when a lap completes.  Initialized true because a session starts
  // with the player in the pit stall, making lap 1 an out-lap by definition.
  const wasInPitThisLapRef = useRef<boolean>(true)

  // Detect player pit-road state every tick and OR into the sticky flag.
  // Never clears the flag here — only the lap-transition effect resets it,
  // so a pit visit early in the lap correctly taints the whole lap even if
  // the player has rejoined the racing surface by the time it completes.
  useEffect(() => {
    if (!t.connected) return
    const playerInPit = t.cars.find((c) => c.carIdx === t.playerCarIdx)?.inPit ?? false
    if (playerInPit) wasInPitThisLapRef.current = true
  }, [t.connected, t.cars, t.playerCarIdx])

  useEffect(() => {
    if (!t.connected || t.lapLastLapTime <= 0) return
    if (t.lap <= 1) {
      lapHistoryRef.current = []
      lastTrackedLapRef.current = 0
      // Session/lap-counter reset — start fresh with the assumption the player
      // is currently in pit (true at lap 1 in every session type).
      wasInPitThisLapRef.current = true
      return
    }
    if (t.lap > lastTrackedLapRef.current) {
      lastTrackedLapRef.current = t.lap
      lapHistoryRef.current.push({
        lap: t.lap - 1,
        time: t.lapLastLapTime,
        pitAffected: wasInPitThisLapRef.current,
      })
      // Reset for the new lap.  If the player is still on pit road right now
      // (e.g. just crossed pit-exit line), the per-tick pit-detection effect
      // will re-arm the flag on the next frame.
      wasInPitThisLapRef.current = false
      // Keep a full stint's worth; 30 laps is more than enough
      if (lapHistoryRef.current.length > 30) lapHistoryRef.current.shift()
    }
  }, [t.lap, t.lapLastLapTime, t.connected])

  // ── Per-lap fuel consumption (measured at lap boundaries) ────────────────────
  const fuelAtLapStartRef = useRef<number>(-1)
  const fuelPerLapSamplesRef = useRef<number[]>([])
  const lastFuelLapRef = useRef<number>(0)

  useEffect(() => {
    if (!t.connected || t.fuelLevel <= 0) return

    if (t.lap <= 1) {
      fuelAtLapStartRef.current = t.fuelLevel
      fuelPerLapSamplesRef.current = []
      lastFuelLapRef.current = 0
      return
    }

    if (t.lap > lastFuelLapRef.current) {
      if (fuelAtLapStartRef.current > 0) {
        const consumed = fuelAtLapStartRef.current - t.fuelLevel
        // Sanity: skip if refuelled (negative) or implausibly large (>15 L)
        if (consumed > 0.05 && consumed < 15) {
          fuelPerLapSamplesRef.current.push(consumed)
          if (fuelPerLapSamplesRef.current.length > 5) fuelPerLapSamplesRef.current.shift()
        }
      }
      fuelAtLapStartRef.current = t.fuelLevel
      lastFuelLapRef.current = t.lap
    }
  }, [t.lap, t.fuelLevel, t.connected])

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const lapHistory = lapHistoryRef.current
    const samples = fuelPerLapSamplesRef.current

    // Priority:
    //  1. Rolling average of measured per-lap fuel (most accurate)
    //  2. Live fuelUsePerHour × actual lap time (reasonable while actively driving)
    //  3. Show '--' — never show a nonsense number when idle/stopped
    let fuelPerLap = 0
    let hasReliableEstimate = false

    if (samples.length > 0) {
      fuelPerLap = samples.reduce((a, b) => a + b, 0) / samples.length
      hasReliableEstimate = true
    } else if (t.fuelUsePerHour > MIN_DRIVING_FUEL_RATE) {
      const lapTime = t.lapLastLapTime > 0 ? t.lapLastLapTime : LAP_TIME_ESTIMATE
      fuelPerLap = t.fuelUsePerHour * (lapTime / 3600)
      hasReliableEstimate = true
    }

    const lapsOnFuel = hasReliableEstimate && fuelPerLap > 0
      ? t.fuelLevel / fuelPerLap
      : 0

    const pitLap = lapsOnFuel > 0 ? Math.floor(t.lap + lapsOnFuel - 0.5) : null

    // ── Tire deg: stint-scoped pace trend ──────────────────────────────────────
    // A "stint" is the contiguous run of clean flying laps since the most recent
    // pit-affected lap (out-lap, in-lap, or full pit stop).  Walk backwards from
    // the end of history; everything after the last pitAffected lap is the
    // current stint.  Session-best is *not* the reference here — only this
    // stint's data matters for tire wear, since a fresh-tire run an hour ago
    // tells us nothing about the current set.
    const currentStint: LapRecord[] = []
    for (let i = lapHistory.length - 1; i >= 0; i--) {
      if (lapHistory[i].pitAffected) break
      currentStint.unshift(lapHistory[i])
    }

    const lastLap = currentStint.length > 0 ? currentStint[currentStint.length - 1] : null

    // Stint best — fastest lap within the current stint.  Equals lastLap on a
    // 1-lap stint or whenever the latest lap is the new best.
    const stintBest = currentStint.length > 0
      ? currentStint.reduce((best, r) => r.time < best.time ? r : best)
      : null

    // ── Headline trend: last lap vs avg of the up-to-3 prior stint laps ──────
    // Directional indicator — "am I getting faster or slower right now?"
    // After s1: null (no prior laps).  After s2: 1-sample comparison (muted in
    // UI).  After s4+: full 3-lap window.  A bad lap in the prior window will
    // *help* the next lap's trend (inflated baseline → next lap looks fast);
    // this is a known behaviour, not a bug — it self-corrects as the outlier
    // rolls out of the window.
    const priorLaps = currentStint.slice(-4, -1)
    const trendDelta = lastLap && priorLaps.length > 0
      ? lastLap.time - (priorLaps.reduce((s, r) => s + r.time, 0) / priorLaps.length)
      : null
    const trendMature = priorLaps.length >= 3

    // ── Stint-best delta: last lap vs the stint's fastest lap ────────────────
    // "How off-peak am I?" — always ≥ 0, equals 0 when the latest lap *is*
    // the stint best.
    const stintBestDelta = lastLap && stintBest
      ? lastLap.time - stintBest.time
      : null

    return {
      fuelPerLap, lapsOnFuel, hasReliableEstimate, pitLap,
      currentStint, lastLap, stintBest,
      trendDelta, trendMature, priorCount: priorLaps.length,
      stintBestDelta,
    }
  }, [t.fuelLevel, t.fuelUsePerHour, t.lap, t.lapLastLapTime])

  const editMode = useEditMode()
  const { onMouseDown, dragging } = useDrag(editMode)

  const sType = t.sessionType === 'unknown' ? 'practice' : t.sessionType
  const sec = config.pitStrategy.sections
  const showFuel      = sec.fuel[sType]
  const showTireDeg   = sec.tireDeg[sType]
  const showPitWindow = sec.pitWindow[sType]

  const containerProps = {
    className: `${styles.container} ${editMode ? styles.editMode : ''}`,
    onMouseDown,
    style: { cursor: editMode ? (dragging ? 'grabbing' : 'grab') : 'default' } as React.CSSProperties,
  }

  if (!config.pitStrategy.enabled[sType] && !editMode) return null

  if (!t.connected) {
    return (
      <div {...containerProps}>
        {editMode && <div className={styles.editBanner}>✥ DRAG TO REPOSITION</div>}
        <div className={styles.header}><span className={styles.label}>PIT STRATEGY</span></div>
        <div className={styles.muted}>Waiting for iRacing…</div>
      </div>
    )
  }

  return (
    <div {...containerProps}>
      {editMode && <div className={styles.editBanner}>✥ DRAG TO REPOSITION</div>}
      <div className={styles.header}>
        <span className={styles.label}>PIT STRATEGY</span>
        <span className={styles.lapInfo}>Lap {t.lap}</span>
      </div>

      {/* Fuel section */}
      {showFuel && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>FUEL</div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Current</span>
            <span className={styles.statValue}>{t.fuelLevel.toFixed(1)} L</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>
              {fuelPerLapSamplesRef.current.length > 0 ? 'Per lap (avg)' : 'Per lap (est.)'}
            </span>
            <span className={styles.statValue}>
              {stats.hasReliableEstimate ? `${stats.fuelPerLap.toFixed(2)} L` : '--'}
            </span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Laps remaining</span>
            <span
              className={styles.statValue}
              style={{ color: stats.lapsOnFuel < 3 ? '#f87171' : stats.lapsOnFuel < 6 ? '#fbbf24' : '#4ade80' }}
            >
              {stats.lapsOnFuel > 0 ? stats.lapsOnFuel.toFixed(1) : '--'}
            </span>
          </div>
        </div>
      )}

      {/* Tire degradation — stint-scoped pace trend */}
      {showTireDeg && stats.lastLap && stats.stintBest && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>TIRE DEG</span>
            <span className={styles.stintBadge}>
              Stint of {stats.currentStint.length}
            </span>
          </div>

          {/* Stint best lap */}
          <div className={styles.lapRow}>
            <span className={styles.lapNum}>L{stats.stintBest.lap}</span>
            <span className={styles.lapTime}>{formatTime(stats.stintBest.time)}</span>
            <span className={styles.bestBadge}>BEST</span>
          </div>

          {/* Last lap — only render if it isn't the stint best */}
          {stats.lastLap !== stats.stintBest && (
            <div className={styles.lapRow}>
              <span className={styles.lapNum}>L{stats.lastLap.lap}</span>
              <span className={styles.lapTime}>{formatTime(stats.lastLap.time)}</span>
              <span className={styles.lastBadge}>LAST</span>
            </div>
          )}

          {/* Headline trend: last lap vs prior up-to-3 in stint */}
          {stats.trendDelta !== null && stats.priorCount > 0 && (
            <div className={styles.degAvg}>
              <span className={styles.degAvgLabel}>
                vs LAST {stats.priorCount}
              </span>
              <span
                className={styles.degAvgValue}
                style={{
                  color: !stats.trendMature
                    ? '#64748b'
                    : stats.trendDelta <= -0.05 ? '#4ade80'
                    : stats.trendDelta <= 0.05 ? '#cbd5e1'
                    : stats.trendDelta <= 0.30 ? '#fbbf24'
                    : '#f87171',
                  opacity: stats.trendMature ? 1 : 0.55,
                }}
              >
                {stats.trendDelta > 0 ? '+' : ''}{stats.trendDelta.toFixed(3)}s
              </span>
            </div>
          )}

          {/* Stint-best delta (smaller, secondary) */}
          {stats.stintBestDelta !== null && stats.currentStint.length > 1 && (
            <div className={styles.stintBestRow}>
              <span className={styles.stintBestLabel}>vs STINT BEST</span>
              <span
                className={styles.stintBestValue}
                style={{
                  color: stats.stintBestDelta <= 0.1 ? '#94a3b8'
                       : stats.stintBestDelta <= 0.5 ? '#fbbf24'
                       : '#f87171'
                }}
              >
                +{stats.stintBestDelta.toFixed(3)}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pit window */}
      {showPitWindow && stats.pitLap && (
        <div className={styles.pitWindow}>
          <span className={styles.pitWindowLabel}>Pit by</span>
          <span className={styles.pitWindowLap}>Lap {stats.pitLap}</span>
        </div>
      )}
    </div>
  )
}
