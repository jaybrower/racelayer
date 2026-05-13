import { useMemo, useRef, useEffect } from 'react'
import { useTelemetry } from '../../contexts/TelemetryContext'
import { useEditMode } from '../../hooks/useEditMode'
import { useDrag } from '../../hooks/useDrag'
import type { SessionType } from '../../types/telemetry'
import styles from './PitStrategy.module.css'

const FUEL_PER_LAP_FALLBACK = 2.1 // liters — replaced by rolling average once data comes in
const LAP_TIME_ESTIMATE = 92        // seconds — replaced by actual lap times

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

  // Track lap history in a ref so it persists across renders
  const lapHistoryRef = useRef<LapRecord[]>([])
  const lastTrackedLapRef = useRef<number>(0)

  useEffect(() => {
    if (!t.connected || t.lapLastLapTime <= 0) return
    if (t.lap <= 1) {
      // Reset on new session / first lap
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

  const stats = useMemo(() => {
    const lapHistory = lapHistoryRef.current
    const fuelPerLap = t.fuelUsePerHour > 0
      ? t.fuelUsePerHour / (3600 / LAP_TIME_ESTIMATE)
      : FUEL_PER_LAP_FALLBACK
    const lapsOnFuel = fuelPerLap > 0 ? t.fuelLevel / fuelPerLap : 0

    // Tire degradation: avg lap-time increase per lap over stint
    const degradation = lapHistory.length >= 2
      ? lapHistory[lapHistory.length - 1].diff / (lapHistory.length - 1)
      : null

    // Rough pit window: pit when you'll run low on fuel or deg gets bad
    const pitLap = lapsOnFuel > 0 ? Math.floor(t.lap + lapsOnFuel - 0.5) : null

    return { fuelPerLap, lapsOnFuel, degradation, pitLap, lapHistory }
  }, [t.fuelLevel, t.fuelUsePerHour, t.lap])

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
          <span className={styles.statLabel}>Per lap (est.)</span>
          <span className={styles.statValue}>{stats.fuelPerLap.toFixed(2)} L</span>
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
