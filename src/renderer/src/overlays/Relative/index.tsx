import { useEffect, useMemo, useRef } from 'react'
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
  /** Closing rate in seconds-per-lap.  Positive = closing on player, negative =
   *  pulling away, null = not enough history yet or below noise threshold. */
  closingRate: number | null
  isPlayer: boolean
}

/** One sample of (sessionTime, gapSeconds) — used by the closing-rate window. */
interface GapSample { t: number; gap: number }

/** Rolling-window length for closing-rate regression, in seconds.
 *  Long enough to smooth low-precision lapDistPct jitter; short enough to
 *  respond to actual pace changes within a couple of corners. */
const CLOSING_RATE_WINDOW_SEC = 8

/** Below this magnitude (s/lap) the rate is treated as noise and the cell is blanked. */
const CLOSING_RATE_NOISE_FLOOR = 0.05

/** Per-frame |Δgap| greater than this (seconds) is treated as a track-position
 *  discontinuity (lapping, teleport on session reset, off-track→on-track jump)
 *  and clears that car's history so the rate isn't poisoned. */
const CLOSING_RATE_DISCONTINUITY_SEC = 20

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

/**
 * Closing rate via least-squares linear regression of gap-vs-time over the
 * rolling window.  Output is in seconds-per-second of session time; the caller
 * multiplies by referenceLapTime to convert to s/lap.
 *
 * Linear regression is used instead of a simple endpoint diff so a single
 * jittery sample at either end can't swing the rate.  Returns null if fewer
 * than 3 samples or the time span is < 1s (not enough data to be meaningful).
 */
function regressGapRate(samples: GapSample[]): number | null {
  if (samples.length < 3) return null
  const tSpan = samples[samples.length - 1].t - samples[0].t
  if (tSpan < 1) return null

  const n = samples.length
  let sumT = 0, sumG = 0, sumTT = 0, sumTG = 0
  for (const s of samples) {
    sumT  += s.t
    sumG  += s.gap
    sumTT += s.t * s.t
    sumTG += s.t * s.gap
  }
  const denom = n * sumTT - sumT * sumT
  if (denom === 0) return null
  return (n * sumTG - sumT * sumG) / denom  // d(gap)/dt
}

/**
 * Convert a signed gap-rate (d|gap|/dt) and gap sign into a closing rate
 * expressed in s/lap, where positive means the gap |is shrinking| (closing on
 * the player) and negative means it is growing.
 *
 *   carAhead  (gap < 0): closing when gap is becoming less negative → dGap > 0
 *   carBehind (gap > 0): closing when gap is becoming less positive → dGap < 0
 *
 *   closingRate = -sign(gap) * dGap   (per second)
 */
function computeClosingRate(
  samples: GapSample[],
  currentGap: number,
  referenceLapTime: number,
): number | null {
  const dGapDt = regressGapRate(samples)
  if (dGapDt === null || referenceLapTime <= 0) return null
  const sign = currentGap === 0 ? 0 : currentGap > 0 ? 1 : -1
  const ratePerSec = -sign * dGapDt
  return ratePerSec * referenceLapTime
}

/**
 * Best available reference lap time for converting a track-position diff
 * (in laps) into seconds.  Prefers the player's personal best, then last lap,
 * then any other car's best in the session, falling back to 90s.
 */
function computeReferenceLapTime(
  telemetry: { lapBestLapTime: number; lapLastLapTime: number },
  cars: CarTelemetry[],
): number {
  if (telemetry.lapBestLapTime > 0) return telemetry.lapBestLapTime
  if (telemetry.lapLastLapTime > 0) return telemetry.lapLastLapTime
  const sessionBest = cars
    .filter((c) => c.bestLapTime > 0)
    .reduce((best, c) => Math.min(best, c.bestLapTime), Infinity)
  return Number.isFinite(sessionBest) ? sessionBest : 90
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
    showIR:           cols.iRating[sType],
    showSR:           cols.safetyRating[sType],
    showDelta:        cols.positionDelta[sType],
    showIRChange:     cols.irChange[sType],
    showClosingRate:  cols.closingRate[sType],
    carsAbove:        CARS_ABOVE[sType],
    carsBelow:        CARS_BELOW[sType],
  }

  // Player car entry — used to detect pit state.  When the player is in pit
  // (surface 1 = InPitStall or 2 = AproachingPits), their lapDistPct reflects
  // pit-lane position rather than racing-line position, so the relative-gap
  // math is meaningless.  We pivot to leaderboard-position sorting in that case.
  const playerCar = telemetry.cars.find((c) => c.carIdx === telemetry.playerCarIdx)
  const playerInPit = !!playerCar?.inPit

  // Per-car rolling gap history for closing-rate computation.  Lives in a ref
  // so it survives renders without re-allocation; updated in useEffect once
  // per telemetry frame and read by useMemo on the same render cycle.
  const gapHistoryRef = useRef<Map<number, GapSample[]>>(new Map())

  // Maintain gap history every telemetry tick.  Computed up-front so the same
  // gap math is shared between the history-writer and the render path.
  useEffect(() => {
    const hist = gapHistoryRef.current

    // Drop history when disconnected OR while the player is in pit — gap math
    // is junk against pit-lane lapDistPct, and any samples taken while parked
    // would poison the regression for several seconds after rejoining.
    if (!telemetry.connected || telemetry.cars.length === 0 || playerInPit) {
      if (hist.size > 0) hist.clear()
      return
    }

    const { cars, playerCarIdx, sessionTime } = telemetry
    const referenceLapTime = computeReferenceLapTime(telemetry, cars)
    const cutoff = sessionTime - CLOSING_RATE_WINDOW_SEC

    // Record only the cars we'd render: on-track, not the player.
    const seen = new Set<number>()
    for (const car of cars) {
      if (car.carIdx === playerCarIdx) continue
      if (!car.onTrack) continue
      seen.add(car.carIdx)

      const gap = computeRelativeGap(car, telemetry.lapDistPct, telemetry.lap, referenceLapTime)
      let samples = hist.get(car.carIdx)
      if (!samples) {
        samples = []
        hist.set(car.carIdx, samples)
      }

      // Discontinuity guard: a sudden gap jump indicates lapping / teleport /
      // off-track → on-track transition; existing history is meaningless.
      const last = samples[samples.length - 1]
      if (last && Math.abs(gap - last.gap) > CLOSING_RATE_DISCONTINUITY_SEC) {
        samples.length = 0
      }

      samples.push({ t: sessionTime, gap })
      // Trim entries older than the window.  Array stays small (~130 samples
      // at a 60ms tick over an 8s window), so shift() is fine.
      while (samples.length > 0 && samples[0].t < cutoff) samples.shift()
    }

    // Drop history for cars no longer visible (pitted, off-track, disconnected).
    for (const carIdx of hist.keys()) {
      if (!seen.has(carIdx)) hist.delete(carIdx)
    }
  }, [telemetry, playerInPit])

  // useMemo must come before any conditional return (Rules of Hooks)
  const { visibleEntries, playerPosition } = useMemo(() => {
    if (!telemetry.connected || telemetry.cars.length === 0) {
      return { visibleEntries: [], playerPosition: 0 }
    }

    const { cars, drivers, playerCarIdx } = telemetry
    const referenceLapTime = computeReferenceLapTime(telemetry, cars)
    const irChanges = computeIRChanges(cars, drivers)
    const gapHistory = gapHistoryRef.current

    // Include the player even when !onTrack so they remain the slicing anchor
    // while in pit (their on-track flag is false during the stop).
    const all: RelativeEntry[] = cars
      .filter((c) => c.onTrack || c.carIdx === playerCarIdx)
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
        // While the player is parked, every car's lapDistPct-based gap is
        // measured against the pit-lane reference and reads as nonsense.
        // Suppress gap and closing rate together so they aren't shown stale.
        const gapSeconds = isPlayer || playerInPit
          ? 0
          : computeRelativeGap(car, telemetry.lapDistPct, telemetry.lap, referenceLapTime)
        const samples = gapHistory.get(car.carIdx)
        const rawRate = isPlayer || playerInPit || !samples
          ? null
          : computeClosingRate(samples, gapSeconds, referenceLapTime)
        const closingRate =
          rawRate !== null && Math.abs(rawRate) >= CLOSING_RATE_NOISE_FLOOR
            ? rawRate
            : null
        return {
          car,
          driver,
          gapSeconds,
          positionDelta: car.startPosition - car.position,
          irChange:      irChanges.get(car.carIdx) ?? null,
          closingRate,
          isPlayer,
        }
      })
      // Sort by classified position while in pit (gaps are meaningless), by
      // computed gap otherwise.  Unclassified cars (position 0 — open practice
      // or just joined) get sorted to the end so they don't displace the
      // player from the visible window.
      .sort((a, b) => {
        if (!playerInPit) return a.gapSeconds - b.gapSeconds
        const aPos = a.car.position || Number.POSITIVE_INFINITY
        const bPos = b.car.position || Number.POSITIVE_INFINITY
        return aPos - bPos
      })

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

  // Hide entirely when the driver is in an iRacing menu (garage / get-in-car /
  // replay / spectator). Edit mode bypasses this so overlays can be positioned.
  if (telemetry.connected && !telemetry.isOnTrack && !editMode) return null

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
        {playerInPit && <span className={styles.pitBadge}>PIT</span>}
        {playerPosition > 0 && <span className={styles.playerPos}>P{playerPosition}</span>}
      </div>

      {!telemetry.connected ? (
        <div className={styles.disconnected}>Waiting for iRacing…</div>
      ) : (
        <div className={styles.rows}>
          {visibleEntries.map((entry) => (
            <DriverRow key={entry.car.carIdx} entry={entry} cfg={cfg} pitMode={playerInPit} />
          ))}
        </div>
      )}
    </div>
  )
}

function DriverRow({
  entry,
  cfg,
  pitMode,
}: {
  entry: RelativeEntry
  cfg: {
    showIR: boolean
    showSR: boolean
    showDelta: boolean
    showIRChange: boolean
    showClosingRate: boolean
  }
  /** When true, the player is in pit — gap is meaningless so render '—' in
   *  the gap column, and hide the closing-rate cell entirely. */
  pitMode: boolean
}) {
  const { car, driver, gapSeconds, positionDelta, irChange, closingRate, isPlayer } = entry

  const deltaColor = positionDelta > 0 ? '#4ade80' : positionDelta < 0 ? '#f87171' : '#6b7280'
  const deltaText =
    positionDelta > 0
      ? `▲${positionDelta}`
      : positionDelta < 0
        ? `▼${Math.abs(positionDelta)}`
        : ''

  const gapColor = isPlayer
    ? 'transparent'
    : pitMode
      ? '#94a3b8'
      : gapSeconds < 0
        ? '#4ade80'
        : '#f87171'
  const gap = isPlayer ? '' : pitMode ? '—' : formatGap(gapSeconds)
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

  // Closing rate: positive = closing on player, negative = pulling away.
  // Color is from the player's perspective:
  //   • catching a car ahead OR pulling away from a car behind → green (good)
  //   • losing ground in either direction                       → red   (bad)
  const carAhead   = gapSeconds < 0
  const isClosing  = closingRate !== null && closingRate > 0
  const goodForPlayer = closingRate === null
    ? false
    : carAhead ? isClosing : !isClosing
  const closingRateColor = closingRate === null ? '#64748b' : goodForPlayer ? '#4ade80' : '#f87171'
  const closingRateText  = closingRate === null
    ? ''
    : `${closingRate > 0 ? '+' : ''}${closingRate.toFixed(1)}`
  const closingRateTitle = closingRate === null
    ? ''
    : closingRate > 0
      ? `Closing at ${closingRate.toFixed(2)} s/lap`
      : `Separating at ${Math.abs(closingRate).toFixed(2)} s/lap`

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

      <span
        className={styles.closingRate}
        style={{
          color: closingRateColor,
          visibility: cfg.showClosingRate && !pitMode ? 'visible' : 'hidden',
        }}
        title={closingRateTitle}
      >
        {closingRateText}
      </span>
    </div>
  )
}
