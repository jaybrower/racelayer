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

function formatDelta(s: number): string {
  if (s === 0) return 'BEST'
  const sign = s > 0 ? '+' : ''
  return `${sign}${s.toFixed(3)}`
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

    // ── Tire deg: session-best baseline + recent wear laps ──────────────────────
    // Only clean flying laps count toward tire-deg analysis.  Out-laps, in-laps,
    // and laps containing a full pit stop are dropped — their times reflect pit
    // activity, not tire wear, and would otherwise pollute both the best-lap
    // baseline and the recent-laps "wear" sample.
    const flyingLaps = lapHistory.filter((r) => !r.pitAffected)

    // Fastest lap of the session — this is the rolling baseline.
    // It moves forward as the driver improves during warm-up, then locks in at peak.
    const fastestLap = flyingLaps.length > 0
      ? flyingLaps.reduce((best, r) => r.time < best.time ? r : best)
      : null

    // Up to 3 most recent flying laps that aren't the fastest lap.
    // Excluding the best means this window shows actual wear laps, not the peak.
    const recentLaps = fastestLap
      ? flyingLaps.filter(r => r !== fastestLap).slice(-3)
      : []

    // Average delta of those ≤3 laps vs the best — the headline tire wear number.
    // Positive = slower than best = tires wearing. Grows as deg worsens.
    const avgDelta = fastestLap && recentLaps.length > 0
      ? recentLaps.reduce((sum, r) => sum + (r.time - fastestLap.time), 0) / recentLaps.length
      : null

    return {
      fuelPerLap, lapsOnFuel, hasReliableEstimate, pitLap,
      fastestLap, recentLaps, avgDelta,
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

      {/* Tire degradation */}
      {showTireDeg && stats.fastestLap && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>TIRE DEG</div>

          {/* Baseline — session fastest lap */}
          <div className={styles.baselineRow}>
            <span className={styles.lapNum}>L{stats.fastestLap.lap}</span>
            <span className={styles.lapTime}>{formatTime(stats.fastestLap.time)}</span>
            <span className={styles.bestBadge}>BEST</span>
          </div>

          {/* Up to 3 most recent non-best laps with delta to best */}
          {stats.recentLaps.length > 0 && (
            <div className={styles.recentLaps}>
              {stats.recentLaps.map((rec) => {
                const delta = rec.time - stats.fastestLap!.time
                return (
                  <div className={styles.lapRow} key={rec.lap}>
                    <span className={styles.lapNum}>L{rec.lap}</span>
                    <span className={styles.lapTime}>{formatTime(rec.time)}</span>
                    <span
                      className={styles.lapDiff}
                      style={{ color: delta <= 0 ? '#4ade80' : delta < 0.3 ? '#94a3b8' : delta < 0.8 ? '#fbbf24' : '#f87171' }}
                    >
                      {formatDelta(delta)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Average deg — the headline number */}
          {stats.avgDelta !== null && (
            <div className={styles.degAvg}>
              <span className={styles.degAvgLabel}>
                AVG LAST {stats.recentLaps.length} vs BEST
              </span>
              <span
                className={styles.degAvgValue}
                style={{
                  color: stats.avgDelta <= 0.1 ? '#4ade80'
                       : stats.avgDelta <= 0.5 ? '#fbbf24'
                       : '#f87171'
                }}
              >
                +{stats.avgDelta.toFixed(3)}s
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
