import type { CarTelemetry, DriverInfo } from '../../types/telemetry'

// Relative overlay — pure logic.
// React-free and side-effect-free so the regression / gap / iR math can be
// unit-tested directly from `tests/`.

/** One sample of (sessionTime, gapSeconds) — used by the closing-rate window. */
export interface GapSample {
  t: number
  gap: number
}

/** Rolling-window length for closing-rate regression, in seconds.
 *  Long enough to smooth low-precision lapDistPct jitter; short enough to
 *  respond to actual pace changes within a couple of corners. */
export const CLOSING_RATE_WINDOW_SEC = 8

/** Below this magnitude (s/lap) the rate is treated as noise and the cell is blanked. */
export const CLOSING_RATE_NOISE_FLOOR = 0.05

/** Per-frame |Δgap| greater than this (seconds) is treated as a track-position
 *  discontinuity (lapping, teleport on session reset, off-track→on-track jump)
 *  and clears that car's history so the rate isn't poisoned. */
export const CLOSING_RATE_DISCONTINUITY_SEC = 20

/** Below 3 samples or a time span < 1s, the regression is considered too thin
 *  to be meaningful and we return null instead of a number. */
export const CLOSING_RATE_MIN_SAMPLES = 3
export const CLOSING_RATE_MIN_SPAN_SEC = 1

/** Fallback lap time when no car in the session has produced one yet. */
export const DEFAULT_REFERENCE_LAP_TIME = 90

// ── CarLeftRight (irsdk_CarLeftRight enum) ───────────────────────────────────
//
// Values come straight from the iRacing SDK header — do NOT reinterpret.
// `carLeftRight` is a player-only field: a single value describing which
// cars are alongside the *player's* car.
//
//   0 LROff         — proximity check is off (off-track / replay / etc.)
//   1 LRClear       — no cars alongside
//   2 CarLeft       — one car to the left
//   3 CarRight      — one car to the right
//   4 CarLeftRight  — cars on both sides
//   5 2CarsLeft     — two cars to the left
//   6 2CarsRight    — two cars to the right
export const CLR_OFF       = 0
export const CLR_CLEAR     = 1
export const CLR_LEFT      = 2
export const CLR_RIGHT     = 3
export const CLR_BOTH      = 4
export const CLR_2_LEFT    = 5
export const CLR_2_RIGHT   = 6

/** Which side(s) carry adjacent cars, or `null` when there are none / off.
 *  Doubles (5/6) collapse to the same side — the count is intentionally
 *  not exposed; the UI just needs to know which side to highlight. */
export type ProximitySide = 'left' | 'right' | 'both'

/**
 * Translate the raw `carLeftRight` enum into a side classification suitable
 * for the side-indicator UI.  Returns `null` for `LROff` / `LRClear` and any
 * unrecognised value (forward-compat against future enum additions).
 */
export function carLeftRightSide(value: number): ProximitySide | null {
  switch (value) {
    case CLR_LEFT:
    case CLR_2_LEFT:
      return 'left'
    case CLR_RIGHT:
    case CLR_2_RIGHT:
      return 'right'
    case CLR_BOTH:
      return 'both'
    default:
      return null
  }
}

/**
 * Compute the gap in seconds between a car and the player using track position
 * (`CarIdxLapDistPct + CarIdxLap`) rather than `CarIdxF2Time`.
 *
 * `CarIdxF2Time` is unreliable in practice sessions — it returns 0 for cars
 * that haven't set a lap time and huge values for others.  `LapDistPct` is
 * always valid and available for every on-track car.
 *
 *   diff = (car.lap + car.lapDistPct) - (playerLap + playerLapDistPct)
 *   Wrap diff to [-0.5, 0.5] (shortest path on the circular track).
 *   gapSeconds = -diff × referenceLapTime
 *     (positive diff → car is ahead → negative gap → displayed with '-')
 */
export function computeRelativeGap(
  car: { lap: number; lapDistPct: number },
  playerLapDistPct: number,
  playerLap: number,
  referenceLapTime: number,
): number {
  const diff = car.lap + car.lapDistPct - (playerLap + playerLapDistPct)
  // Wrap to [-0.5, 0.5]: "diff - nearest integer" gives the shortest circular path
  const wrapped = diff - Math.round(diff)
  // Positive wrapped → car is further along the track → is ahead → negative gap
  return -wrapped * referenceLapTime
}

/**
 * Least-squares linear regression of gap-vs-time over the rolling window.
 * Output is the slope d(gap)/dt in seconds-per-second of session time; the
 * caller converts to s/lap.
 *
 * Linear regression is used instead of a simple endpoint diff so a single
 * jittery sample at either end can't swing the rate.  Returns null when fewer
 * than `CLOSING_RATE_MIN_SAMPLES` samples or a time span < `CLOSING_RATE_MIN_SPAN_SEC`.
 */
export function regressGapRate(samples: GapSample[]): number | null {
  if (samples.length < CLOSING_RATE_MIN_SAMPLES) return null
  const tSpan = samples[samples.length - 1].t - samples[0].t
  if (tSpan < CLOSING_RATE_MIN_SPAN_SEC) return null

  const n = samples.length
  let sumT = 0,
    sumG = 0,
    sumTT = 0,
    sumTG = 0
  for (const s of samples) {
    sumT += s.t
    sumG += s.gap
    sumTT += s.t * s.t
    sumTG += s.t * s.gap
  }
  const denom = n * sumTT - sumT * sumT
  if (denom === 0) return null
  return (n * sumTG - sumT * sumG) / denom // d(gap)/dt
}

/**
 * Convert a signed gap-rate (d|gap|/dt) and gap sign into a closing rate in
 * s/lap, where positive means the gap is shrinking (closing on the player) and
 * negative means it is growing.
 *
 *   carAhead  (gap < 0): closing when gap is becoming less negative → dGap > 0
 *   carBehind (gap > 0): closing when gap is becoming less positive → dGap < 0
 *
 *   closingRate = -sign(gap) * dGap   (per second), then × referenceLapTime
 */
export function computeClosingRate(
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
 * then any other car's best in the session, falling back to
 * `DEFAULT_REFERENCE_LAP_TIME` (90s).
 */
export function computeReferenceLapTime(
  telemetry: { lapBestLapTime: number; lapLastLapTime: number },
  cars: Array<{ bestLapTime: number }>,
): number {
  if (telemetry.lapBestLapTime > 0) return telemetry.lapBestLapTime
  if (telemetry.lapLastLapTime > 0) return telemetry.lapLastLapTime
  const sessionBest = cars
    .filter((c) => c.bestLapTime > 0)
    .reduce((best, c) => Math.min(best, c.bestLapTime), Infinity)
  return Number.isFinite(sessionBest) ? sessionBest : DEFAULT_REFERENCE_LAP_TIME
}

/**
 * Estimate per-car iRating change using a community-reverse-engineered
 * approximation of iRacing's Elo-style formula.
 *
 * Only meaningful in official race sessions — but we compute it regardless and
 * let the caller decide whether to show it.
 *
 *   expectedPosition = 1 + Σ P(opponent beats car)
 *   P(opponent beats car) = 1 / (1 + 10^((myIR - opponentIR) / 1000))
 *   iRΔ ≈ round((expectedPos - actualPos) × (200 / N))
 *
 * Returns an empty Map when fewer than 2 rated cars are in the session.
 */
export function computeIRChanges(
  cars: CarTelemetry[],
  drivers: DriverInfo[],
): Map<number, number> {
  const ratedCars = cars
    .filter((c) => c.position > 0)
    .map((c) => ({
      carIdx: c.carIdx,
      position: c.position,
      iRating: drivers.find((d) => d.carIdx === c.carIdx)?.iRating ?? 0,
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
 * Matches the icon tiers so color + icon tell the same story:
 *   ≤ 2.0  red    — danger / probation risk
 *   ≤ 3.0  yellow — caution
 *   ≤ 4.0  green  — solid
 *   > 4.0  blue   — excellent
 */
export function srColor(sub: number): string {
  if (sub <= 2.0) return '#f87171' // red
  if (sub <= 3.0) return '#fbbf24' // yellow
  if (sub <= 4.0) return '#4ade80' // green
  return '#38bdf8' // blue
}

/**
 * Format a relative gap for display.  Magnitudes greater than 90s are treated
 * as a lap delta and rendered `+1 Lap` / `-1 Lap`.
 */
export function formatGap(seconds: number): string {
  const abs = Math.abs(seconds)
  if (abs > 90) return seconds < 0 ? '-1 Lap' : '+1 Lap'
  const sign = seconds <= 0 ? '-' : '+'
  return `${sign}${abs.toFixed(1)}`
}
