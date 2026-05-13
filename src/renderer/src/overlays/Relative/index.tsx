import { useMemo } from 'react'
import { useTelemetry } from '../../contexts/TelemetryContext'
import { useEditMode } from '../../hooks/useEditMode'
import { useDrag } from '../../hooks/useDrag'
import { useOverlayConfig } from '../../contexts/OverlayConfigContext'
import type { CarTelemetry, DriverInfo, SessionType } from '../../types/telemetry'
import styles from './Relative.module.css'

interface RelativeEntry {
  car: CarTelemetry
  driver: DriverInfo
  gapSeconds: number
  positionDelta: number
  irChange: number | null
  isPlayer: boolean
}

const CARS_ABOVE: Record<SessionType, number> = {
  practice: 5, qualifying: 3, race: 5, unknown: 5,
}
const CARS_BELOW: Record<SessionType, number> = {
  practice: 5, qualifying: 3, race: 5, unknown: 5,
}

/**
 * Compute the gap in seconds between a car and the player using track position
 * (CarIdxLapDistPct + CarIdxLap) rather than CarIdxF2Time.
 *
 * CarIdxF2Time is unreliable in practice sessions — it returns 0 for cars that
 * haven't set a lap time and huge values for others.  LapDistPct is always valid
 * and available for every on-track car.
 *
 * Algorithm:
 *   diff = (car.lap + car.lapDistPct) - (playerLap + playerLapDistPct)
 *   Wrap diff to [-0.5, 0.5] (shortest path on the circular track).
 *   gapSeconds = -diff × referenceLapTime
 *     (positive diff → car is ahead → negative gap → displayed with '-')
 */
function computeRelativeGap(
  car: CarTelemetry,
  playerLapDistPct: number,
  playerLap: number,
  referenceLapTime: number,
): number {
  const diff = (car.lap + car.lapDistPct) - (playerLap + playerLapDistPct)
  // Wrap to [-0.5, 0.5]: "diff - nearest integer" gives the shortest circular path
  const wrapped = diff - Math.round(diff)
  // Positive wrapped → car is further along the track → is ahead → negative gap
  return -wrapped * referenceLapTime
}

/**
 * Estimate per-car iRating change using a community-reverse-engineered approximation
 * of iRacing's Elo-style formula.
 *
 * Only meaningful for official race sessions where iRating is on the line — but we
 * compute it here regardless and let the caller decide whether to show it.
 *
 * Formula:
 *   expectedPosition = 1 + Σ P(opponent beats car)
 *   P(opponent beats car) = 1 / (1 + 10^((myIR - opponentIR) / 1000))
 *   iRΔ ≈ round((expectedPos - actualPos) × (200 / N))
 *
 * Returns a Map from carIdx → estimated iRating delta.
 * Returns an empty Map if fewer than 2 rated cars are in the session.
 */
function computeIRChanges(
  cars: CarTelemetry[],
  drivers: DriverInfo[],
): Map<number, number> {
  const ratedCars = cars
    .filter((c) => c.position > 0)
    .map((c) => ({
      carIdx:   c.carIdx,
      position: c.position,
      iRating:  drivers.find((d) => d.carIdx === c.carIdx)?.iRating ?? 0,
    }))
    .filter((c) => c.iRating > 0)

  if (ratedCars.length < 2) return new Map()

  const N = ratedCars.length
  const result = new Map<number, number>()

  for (const car of ratedCars) {
    let expectedPos = 1
    for (const other of ratedCars) {
      if (other.carIdx === car.carIdx) continue
      expectedPos += 1 / (1 + Math.pow(10, (car.iRating - other.iRating) / 1000))
    }
    result.set(car.carIdx, Math.round((expectedPos - car.position) * (200 / N)))
  }

  return result
}

/**
 * Map SR sub-level to a color, independent of license class.
 * Matches the icon tiers so color + icon tell the same story at a glance:
 *   ≤ 2.0  red    — danger / probation risk
 *   ≤ 3.0  yellow — caution
 *   ≤ 4.0  green  — solid
 *   > 4.0  blue   — excellent
 */
function srColor(sub: number): string {
  if (sub <= 2.0) return '#f87171'  // red
  if (sub <= 3.0) return '#fbbf24'  // yellow
  if (sub <= 4.0) return '#4ade80'  // green
  return '#38bdf8'                   // blue
}

/**
 * Render a compact safety-rating badge: class letter + tier icon, both colored
 * by SR sub-level so the visual signal is immediate without reading the letter.
 *
 * Sub-level tiers:
 *   ≤ 2.0  →  !  (danger / probation risk)
 *   ≤ 3.0  →  ▲  (caution)
 *   ≤ 4.0  →  ★  (solid)
 *   > 4.0  →  ✦  (excellent)
 *
 * Example output: "A✦" in blue, "B★" in green, "D!" in red.
 */
function SafetyBadge({ rating }: { rating: string }) {
  const m = rating.match(/^([A-Z]+)\s+([\d.]+)$/)
  if (!m) return null
  const cls  = m[1]
  const sub  = parseFloat(m[2])
  const color = srColor(sub)
  const icon  = sub <= 2.0 ? '!' : sub <= 3.0 ? '▲' : sub <= 4.0 ? '★' : '✦'
  return <span style={{ color }}>{cls}{icon}</span>
}

function formatGap(seconds: number): string {
  const abs = Math.abs(seconds)
  if (abs > 90) return seconds < 0 ? '-1 Lap' : '+1 Lap'
  const sign = seconds <= 0 ? '-' : '+'
  return `${sign}${abs.toFixed(1)}`
}

export default function Relative() {
  const telemetry = useTelemetry()
  const { config } = useOverlayConfig()
  const editMode = useEditMode()
  const { onMouseDown, dragging } = useDrag(editMode)

  const sType = telemetry.sessionType === 'unknown' ? 'practice' : telemetry.sessionType

  const cols = config.relative.columns
  const cfg = {
    showIR:       cols.iRating[sType],
    showSR:       cols.safetyRating[sType],
    showDelta:    cols.positionDelta[sType],
    showIRChange: cols.irChange[sType],
    carsAbove:    CARS_ABOVE[sType],
    carsBelow:    CARS_BELOW[sType],
  }

  // useMemo must come before any conditional return (Rules of Hooks)
  const { visibleEntries, playerPosition } = useMemo(() => {
    if (!telemetry.connected || telemetry.cars.length === 0) {
      return { visibleEntries: [], playerPosition: 0 }
    }

    const { cars, drivers, playerCarIdx } = telemetry

    // Best available reference lap time for converting track-position diff → seconds.
    // Prefer the player's personal best, then last lap, then any car's best in the session.
    const referenceLapTime = (() => {
      if (telemetry.lapBestLapTime > 0)  return telemetry.lapBestLapTime
      if (telemetry.lapLastLapTime > 0)  return telemetry.lapLastLapTime
      const sessionBest = cars
        .filter((c) => c.bestLapTime > 0)
        .reduce((best, c) => Math.min(best, c.bestLapTime), Infinity)
      return Number.isFinite(sessionBest) ? sessionBest : 90
    })()

    const irChanges = computeIRChanges(cars, drivers)

    const all: RelativeEntry[] = cars
      .filter((c) => c.onTrack)
      .map((car) => {
        const driver = drivers.find((d) => d.carIdx === car.carIdx) ?? {
          carIdx:       car.carIdx,
          userName:     `Car #${car.carIdx}`,
          iRating:      0,
          safetyRating: '? ?.??',
          carNumber:    '??',
          carName:      '',
          isAI:         false,
        }
        const isPlayer = car.carIdx === playerCarIdx
        return {
          car,
          driver,
          gapSeconds:    isPlayer ? 0 : computeRelativeGap(
            car, telemetry.lapDistPct, telemetry.lap, referenceLapTime,
          ),
          positionDelta: car.startPosition - car.position,
          irChange:      irChanges.get(car.carIdx) ?? null,
          isPlayer,
        }
      })
      .sort((a, b) => a.gapSeconds - b.gapSeconds)

    const playerIdx = all.findIndex((e) => e.isPlayer)
    if (playerIdx === -1) return { visibleEntries: all, playerPosition: 0 }

    const start = Math.max(0, playerIdx - cfg.carsAbove)
    const end   = Math.min(all.length, playerIdx + cfg.carsBelow + 1)

    return {
      visibleEntries: all.slice(start, end),
      playerPosition: telemetry.cars.find((c) => c.carIdx === playerCarIdx)?.position ?? 0,
    }
  }, [telemetry, cfg.carsAbove, cfg.carsBelow])

  if (!config.relative.enabled[sType] && !editMode) return null

  const sessionLabel: Record<SessionType, string> = {
    practice: 'PRACTICE', qualifying: 'QUALIFY', race: 'RACE', unknown: '---',
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
  cfg: {
    showIR: boolean
    showSR: boolean
    showDelta: boolean
    showIRChange: boolean
  }
}) {
  const { car, driver, gapSeconds, positionDelta, irChange, isPlayer } = entry

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

  const irChangeColor =
    irChange === null ? '#64748b'
    : irChange > 0    ? '#4ade80'
    : irChange < 0    ? '#f87171'
    :                   '#94a3b8'

  const irChangeText =
    irChange === null ? ''
    : irChange > 0    ? `+${irChange}`
    : String(irChange)

  return (
    <div className={`${styles.row} ${isPlayer ? styles.playerRow : ''}`}>
      <span className={styles.position} style={{ color: isPlayer ? '#fbbf24' : '#38bdf8' }}>
        {posLabel}
      </span>

      {/* Always render every cell — visibility:hidden keeps grid columns stable.
          Conditionally omitting a cell shifts subsequent children into wrong columns. */}
      <span
        className={styles.delta}
        style={{ color: deltaColor, visibility: cfg.showDelta ? 'visible' : 'hidden' }}
      >
        {deltaText}
      </span>

      <span className={styles.carNum}>#{driver.carNumber}</span>

      <span
        className={styles.name}
        style={{ fontWeight: isPlayer ? 700 : 400, color: isPlayer ? '#fbbf24' : '#f1f5f9' }}
      >
        {driver.userName}
      </span>

      <span className={styles.irating} style={{ visibility: cfg.showIR ? 'visible' : 'hidden' }}>
        {driver.iRating > 0 ? driver.iRating.toLocaleString() : ''}
      </span>

      <span className={styles.safety} style={{ visibility: cfg.showSR ? 'visible' : 'hidden' }}>
        <SafetyBadge rating={driver.safetyRating} />
      </span>

      <span
        className={styles.irChange}
        style={{ color: irChangeColor, visibility: cfg.showIRChange ? 'visible' : 'hidden' }}
        title={irChange !== null ? 'Est. iRating change based on current positions' : ''}
      >
        {irChangeText}
      </span>

      <span className={styles.gap} style={{ color: gapColor }}>
        {gap}
      </span>
    </div>
  )
}
