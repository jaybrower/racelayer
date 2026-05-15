import { useEffect, useMemo, useRef } from 'react'
import { useTelemetry } from '../../contexts/TelemetryContext'
import { useEditMode } from '../../hooks/useEditMode'
import { useDrag } from '../../hooks/useDrag'
import { useOverlayConfig } from '../../contexts/OverlayConfigContext'
import type { CarTelemetry, DriverInfo, SessionType } from '../../types/telemetry'
import {
  type GapSample,
  type ProximitySide,
  CLOSING_RATE_WINDOW_SEC,
  CLOSING_RATE_NOISE_FLOOR,
  CLOSING_RATE_DISCONTINUITY_SEC,
  computeRelativeGap,
  computeClosingRate,
  computeReferenceLapTime,
  computeIRChanges,
  carLeftRightSide,
  srColor,
  formatGap,
} from './lib'
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

const CARS_ABOVE: Record<SessionType, number> = {
  practice: 5, qualifying: 3, race: 5, unknown: 5,
}
const CARS_BELOW: Record<SessionType, number> = {
  practice: 5, qualifying: 3, race: 5, unknown: 5,
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
    showCarLeftRight: cols.carLeftRight[sType],
    carsAbove:        CARS_ABOVE[sType],
    carsBelow:        CARS_BELOW[sType],
  }

  // Player car entry — used to detect pit state.  When the player is in pit
  // (surface 1 = InPitStall or 2 = AproachingPits), their lapDistPct reflects
  // pit-lane position rather than racing-line position, so the relative-gap
  // math is meaningless.  We pivot to leaderboard-position sorting in that case.
  const playerCar = telemetry.cars.find((c) => c.carIdx === telemetry.playerCarIdx)
  const playerInPit = !!playerCar?.inPit

  // Proximity side from CarLeftRight — applies only to the player row.
  // Suppressed while in pit (no adjacent-car concept) and when the column
  // toggle is off for this session type.
  const proximitySide: ProximitySide | null =
    cfg.showCarLeftRight && !playerInPit
      ? carLeftRightSide(telemetry.carLeftRight)
      : null

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
            <DriverRow
              key={entry.car.carIdx}
              entry={entry}
              cfg={cfg}
              pitMode={playerInPit}
              proximitySide={entry.isPlayer ? proximitySide : null}
            />
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
  proximitySide,
}: {
  entry: RelativeEntry
  cfg: {
    showIR: boolean
    showSR: boolean
    showDelta: boolean
    showIRChange: boolean
    showClosingRate: boolean
    showCarLeftRight: boolean
  }
  /** When true, the player is in pit — gap is meaningless so render '—' in
   *  the gap column, and hide the closing-rate cell entirely. */
  pitMode: boolean
  /** Which side(s) have cars alongside the player, or null when none / not
   *  the player's row. Always null for non-player rows. */
  proximitySide: ProximitySide | null
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

      <span className={styles.carNum}>
        {/* Side-indicator chevrons flank the car number on the player row only.
            Chevrons stay reserved (visibility:hidden) so the cell width never
            jitters when proximity flips on/off mid-corner. */}
        <span
          className={styles.proximityChevron}
          style={{
            visibility:
              proximitySide === 'left' || proximitySide === 'both' ? 'visible' : 'hidden',
          }}
          aria-hidden="true"
        >
          ◀
        </span>
        <span className={styles.carNumLabel}>#{driver.carNumber}</span>
        <span
          className={styles.proximityChevron}
          style={{
            visibility:
              proximitySide === 'right' || proximitySide === 'both' ? 'visible' : 'hidden',
          }}
          aria-hidden="true"
        >
          ▶
        </span>
      </span>

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
