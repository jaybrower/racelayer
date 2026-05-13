import { useMemo, useRef, useEffect } from 'react'
import { useTelemetry } from '../../contexts/TelemetryContext'
import { useEditMode } from '../../hooks/useEditMode'
import { useDrag } from '../../hooks/useDrag'
import type { SessionType } from '../../types/telemetry'
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

function formatDiff(s: number): string {
  if (s === 0) return 'baseline'
  const sign = s > 0 ? '+' : '-'
  return `${sign}${Math.abs(s).toFixed(3)}`
}

interface LapRecord {
  lap: number
  time: number
  diff: number  // vs. stint baseline
}

// Session types where this overlay is useful
const SHOWN_SESSIONS: SessionType[] = ['practice', 'race']

export default function PitStrategy() {
  const t = useTelemetry()

  // ── Lap-time history ─────────────────────────────────────────────────────────
  const lapHistoryRef = useRef<LapRecord[]>([])
  const lastTrackedLapRef = useRef<number>(0)

  useEffect(() => {
    if (!t.connected || t.lapLastLapTime <= 0) return
    if (t.lap <= 1) {
      lapHistoryRef.current = []
      lastTrackedLapRef.current = 0
    }
    if (t.lap > lastTrackedLapRef.current) {
      lastTrackedLapRef.current = t.lap
      const baseline = lapHistoryRef.current[0]?.time ?? t.lapLastLapTime
      lapHistoryRef.current.push({
        lap: t.lap - 1,
        time: t.lapLastLapTime,
        diff: t.lapLastLapTime - baseline,
      })
      if (lapHistoryRef.current.length > 8) lapHistoryRef.current.shift()
    }
  }, [t.lap, t.lapLastLapTime, t.connected])

  // ── Per-lap fuel consumption (measured at lap boundaries) ────────────────────
  const fuelAtLapStartRef = useRef<number>(-1)
  const fuelPerLapSamplesRef = useRef<number[]>([])
  const lastFuelLapRef = useRef<number>(0)

  useEffect(() => {
    if (!t.connected || t.fuelLevel <= 0) return

    if (t.lap <= 1) {
      // Reset on new session
      fuelAtLapStartRef.current = t.fuelLevel
      fuelPerLapSamplesRef.current = []
      lastFuelLapRef.current = 0
      return
    }

    if (t.lap > lastFuelLapRef.current) {
      // New lap crossed — record how much fuel was burned in the lap just completed
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
      // Only use live rate when the engine is actually under load
      const lapTime = t.lapLastLapTime > 0 ? t.lapLastLapTime : LAP_TIME_ESTIMATE
      fuelPerLap = t.fuelUsePerHour * (lapTime / 3600)
      hasReliableEstimate = true
    }

    const lapsOnFuel = hasReliableEstimate && fuelPerLap > 0
      ? t.fuelLevel / fuelPerLap
      : 0

    // Tire degradation: avg lap-time delta per lap over stint
    const degradation = lapHistory.length >= 2
      ? lapHistory[lapHistory.length - 1].diff / (lapHistory.length - 1)
      : null

    const pitLap = lapsOnFuel > 0 ? Math.floor(t.lap + lapsOnFuel - 0.5) : null

    return { fuelPerLap, lapsOnFuel, hasReliableEstimate, degradation, pitLap, lapHistory }
  }, [t.fuelLevel, t.fuelUsePerHour, t.lap, t.lapLastLapTime])

  const editMode = useEditMode()
  const { onMouseDown, dragging } = useDrag(editMode)

  const containerProps = {
    className: `${styles.container} ${editMode ? styles.editMode : ''}`,
    onMouseDown,
    style: { cursor: editMode ? (dragging ? 'grabbing' : 'grab') : 'default' } as React.CSSProperties,
  }

  if (!SHOWN_SESSIONS.includes(t.sessionType)) {
    return (
      <div {...containerProps}>
        {editMode && <div className={styles.editBanner}>✥ DRAG TO REPOSITION</div>}
        <div className={styles.header}>
          <span className={styles.label}>PIT STRATEGY</span>
        </div>
        <div className={styles.muted}>Not available in {t.sessionType} session</div>
      </div>
    )
  }

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

      {/* Tire degradation */}
      {stats.lapHistory.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>TIRE DEG — THIS STINT</div>
          {stats.lapHistory.map((rec) => (
            <div className={styles.lapRow} key={rec.lap}>
              <span className={styles.lapNum}>L{rec.lap}</span>
              <span className={styles.lapTime}>{formatTime(rec.time)}</span>
              <span
                className={styles.lapDiff}
                style={{ color: rec.diff === 0 ? '#94a3b8' : rec.diff > 0 ? '#f87171' : '#4ade80' }}
              >
                {formatDiff(rec.diff)}
              </span>
            </div>
          ))}
          {stats.degradation !== null && (
            <div className={styles.degSummary}>
              Avg deg: <span style={{ color: stats.degradation > 0.15 ? '#f87171' : '#94a3b8' }}>
                {stats.degradation > 0 ? '+' : ''}{stats.degradation.toFixed(3)}s/lap
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pit window */}
      {stats.pitLap && (
        <div className={styles.pitWindow}>
          <span className={styles.pitWindowLabel}>Pit by</span>
          <span className={styles.pitWindowLap}>Lap {stats.pitLap}</span>
        </div>
      )}
    </div>
  )
}
