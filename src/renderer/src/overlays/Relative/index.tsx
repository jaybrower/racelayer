import { useMemo } from 'react'
import { useTelemetry } from '../../contexts/TelemetryContext'
import { useEditMode } from '../../hooks/useEditMode'
import { useDrag } from '../../hooks/useDrag'
import type { CarTelemetry, DriverInfo, SessionType } from '../../types/telemetry'
import styles from './Relative.module.css'

interface RelativeEntry {
  car: CarTelemetry
  driver: DriverInfo
  gapSeconds: number
  positionDelta: number
  isPlayer: boolean
}

// Per-session-type display config (will be driven by config file later)
const SESSION_CONFIG: Record<SessionType, { carsAbove: number; carsBelow: number; showIR: boolean; showSR: boolean; showDelta: boolean }> = {
  practice:   { carsAbove: 5, carsBelow: 5, showIR: true,  showSR: true,  showDelta: false },
  qualifying: { carsAbove: 3, carsBelow: 3, showIR: true,  showSR: false, showDelta: false },
  race:       { carsAbove: 5, carsBelow: 5, showIR: false, showSR: true,  showDelta: true  },
  unknown:    { carsAbove: 5, carsBelow: 5, showIR: true,  showSR: true,  showDelta: false },
}

function formatGap(seconds: number): string {
  const abs = Math.abs(seconds)
  if (abs > 90) return seconds < 0 ? '-1 Lap' : '+1 Lap'
  const sign = seconds <= 0 ? '-' : '+'
  return `${sign}${abs.toFixed(3)}`
}

function formatLapTime(s: number): string {
  if (s <= 0) return '--:--.---'
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(3).padStart(6, '0')
  return `${m}:${sec}`
}

export default function Relative() {
  const telemetry = useTelemetry()
  const cfg = SESSION_CONFIG[telemetry.sessionType] ?? SESSION_CONFIG.unknown

  const { visibleEntries, playerPosition } = useMemo(() => {
    if (!telemetry.connected || telemetry.cars.length === 0) {
      return { visibleEntries: [], playerPosition: 0 }
    }

    const { cars, drivers, playerCarIdx } = telemetry

    const all: RelativeEntry[] = cars
      .filter((c) => c.onTrack)
      .map((car) => {
        const driver = drivers.find((d) => d.carIdx === car.carIdx) ?? {
          carIdx: car.carIdx,
          userName: `Car #${car.carIdx}`,
          iRating: 0,
          safetyRating: '? ?.??',
          carNumber: '??',
          carName: '',
        }
        return {
          car,
          driver,
          gapSeconds: car.f2Time,
          positionDelta: car.startPosition - car.position,
          isPlayer: car.carIdx === playerCarIdx,
        }
      })
      .sort((a, b) => a.gapSeconds - b.gapSeconds)

    const playerIdx = all.findIndex((e) => e.isPlayer)
    if (playerIdx === -1) return { visibleEntries: all, playerPosition: 0 }

    const start = Math.max(0, playerIdx - cfg.carsAbove)
    const end = Math.min(all.length, playerIdx + cfg.carsBelow + 1)

    return {
      visibleEntries: all.slice(start, end),
      playerPosition: telemetry.cars.find((c) => c.carIdx === playerCarIdx)?.position ?? 0,
    }
  }, [telemetry, cfg.carsAbove, cfg.carsBelow])

  const editMode = useEditMode()
  const { onMouseDown, dragging } = useDrag(editMode)

  const sessionLabel: Record<SessionType, string> = {
    practice: 'PRACTICE',
    qualifying: 'QUALIFY',
    race: 'RACE',
    unknown: '---',
  }

  return (
    <div
      className={`${styles.container} ${editMode ? styles.editMode : ''}`}
      onMouseDown={onMouseDown}
      style={{ cursor: editMode ? (dragging ? 'grabbing' : 'grab') : 'default' }}
    >
      {editMode && <div className={styles.editBanner}>✥ DRAG TO REPOSITION</div>}
      <div className={styles.header}>
        <span className={styles.headerLabel}>RELATIVE</span>
        <span className={styles.sessionBadge}>{sessionLabel[telemetry.sessionType]}</span>
        {playerPosition > 0 && <span className={styles.playerPos}>P{playerPosition}</span>}
      </div>

      {!telemetry.connected ? (
        <div className={styles.disconnected}>Waiting for iRacing…</div>
      ) : (
        <div className={styles.rows}>
          {visibleEntries.map((entry) => (
            <DriverRow key={entry.car.carIdx} entry={entry} cfg={cfg} />
          ))}
        </div>
      )}
    </div>
  )
}

function DriverRow({
  entry,
  cfg,
}: {
  entry: RelativeEntry
  cfg: { showIR: boolean; showSR: boolean; showDelta: boolean }
}) {
  const { car, driver, gapSeconds, positionDelta, isPlayer } = entry

  const deltaColor = positionDelta > 0 ? '#4ade80' : positionDelta < 0 ? '#f87171' : '#6b7280'
  const deltaText =
    positionDelta > 0
      ? `▲${positionDelta}`
      : positionDelta < 0
        ? `▼${Math.abs(positionDelta)}`
        : ''

  const gapColor = isPlayer ? 'transparent' : gapSeconds < 0 ? '#4ade80' : '#f87171'
  const gap = isPlayer ? '' : formatGap(gapSeconds)
  // Position 0 means no classification (practice) — show '--' instead of 'P0'
  const posLabel = car.position > 0 ? `P${car.position}` : '--'

  return (
    <div className={`${styles.row} ${isPlayer ? styles.playerRow : ''}`}>
      <span className={styles.position} style={{ color: isPlayer ? '#fbbf24' : '#38bdf8' }}>
        {posLabel}
      </span>

      {/* Always render the delta cell — hiding it with visibility keeps the grid columns
          stable regardless of session type. Conditionally omitting it shifts every
          subsequent child into the wrong column. */}
      <span
        className={styles.delta}
        style={{ color: deltaColor, visibility: cfg.showDelta ? 'visible' : 'hidden' }}
      >
        {deltaText}
      </span>

      <span className={styles.carNum}>#{driver.carNumber}</span>

      <span className={styles.name} style={{ fontWeight: isPlayer ? 700 : 400, color: isPlayer ? '#fbbf24' : '#f1f5f9' }}>
        {driver.userName}
      </span>

      {/* Same grid-stability pattern for IR / SR columns */}
      <span className={styles.irating} style={{ visibility: cfg.showIR ? 'visible' : 'hidden' }}>
        {driver.iRating > 0 ? driver.iRating.toLocaleString() : ''}
      </span>

      <span className={styles.safety} style={{ visibility: cfg.showSR ? 'visible' : 'hidden' }}>
        {driver.safetyRating !== '? ?.??' ? driver.safetyRating : ''}
      </span>

      <span className={styles.gap} style={{ color: gapColor }}>
        {gap}
      </span>
    </div>
  )
}
