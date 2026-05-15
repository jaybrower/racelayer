// Pit Strategy — pure logic.
// Anything below is React-free and side-effect-free so it can be unit-tested
// directly from `tests/`.  The component (`index.tsx`) keeps the side-effecty
// bits (refs, effects, lap-boundary detection) and renders the output of these
// functions.

/** Last-resort lap-time when we have no lap data at all (lap 1 of session). */
export const LAP_TIME_ESTIMATE = 92

/** Minimum fuelUsePerHour (L/hr) below which the engine is assumed to be idling
 *  rather than driving.  At idle the SDK reports ~1–2 L/hr which would yield
 *  absurd laps-remaining values if used as a per-lap proxy. */
export const MIN_DRIVING_FUEL_RATE = 5

/** Maximum prior-laps in the trend window — "vs LAST 3" is the target. */
export const TREND_WINDOW = 3

/** One completed lap.  `pitAffected = true` means the player was on pit road
 *  at any point during this lap (out-lap, in-lap, or a full pit stop), so the
 *  lap time isn't representative of tire wear and the lap is excluded from the
 *  current stint. */
export interface LapRecord {
  lap: number
  time: number
  pitAffected: boolean
}

export interface StintMetrics {
  /** Contiguous clean laps since the most recent pit-affected lap. */
  currentStint: LapRecord[]
  /** Most recent lap in the current stint, or null if the stint is empty. */
  lastLap: LapRecord | null
  /** Fastest lap of the current stint, or null if the stint is empty. */
  stintBest: LapRecord | null
  /** lastLap.time − avg(up-to-3 prior stint laps).  Null when no prior laps. */
  trendDelta: number | null
  /** True once the trend window has 3 prior samples (s4+ of the stint). */
  trendMature: boolean
  /** Number of prior laps included in the trend (0, 1, 2, or 3). */
  priorCount: number
  /** lastLap.time − stintBest.time.  Always ≥ 0; null when the stint is empty. */
  stintBestDelta: number | null
}

/**
 * Format a lap time in seconds as `M:SS.mmm` (e.g. `1:32.456`).
 * Returns `--:--.---` for non-positive inputs (no valid lap yet).
 */
export function formatLapTime(s: number): string {
  if (s <= 0) return '--:--.---'
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(3).padStart(6, '0')
  return `${m}:${sec}`
}

/**
 * Compute stint-scoped tire-deg metrics from the player's lap history.
 *
 * A "stint" is the contiguous run of clean flying laps since the most recent
 * pit-affected lap.  Session-best is deliberately not referenced — a fresh-tire
 * run an hour ago tells us nothing about the current set.
 *
 * Returned numbers:
 *   - `trendDelta`     — lastLap vs avg of up-to-3 prior stint laps (directional)
 *   - `stintBestDelta` — lastLap vs stintBest (always ≥ 0)
 *
 * Pure function: no refs, no state, no React.
 */
export function computeStintMetrics(lapHistory: LapRecord[]): StintMetrics {
  // Walk backwards from the end; everything after the last pit-affected lap
  // is the current stint.
  const currentStint: LapRecord[] = []
  for (let i = lapHistory.length - 1; i >= 0; i--) {
    if (lapHistory[i].pitAffected) break
    currentStint.unshift(lapHistory[i])
  }

  const lastLap = currentStint.length > 0 ? currentStint[currentStint.length - 1] : null

  const stintBest =
    currentStint.length > 0
      ? currentStint.reduce((best, r) => (r.time < best.time ? r : best))
      : null

  // Up-to-3 laps immediately preceding the last lap (slice(-4, -1) of a stint
  // of length N gives the prior min(3, N-1) laps).
  const priorLaps = currentStint.slice(-(TREND_WINDOW + 1), -1)
  const trendDelta =
    lastLap && priorLaps.length > 0
      ? lastLap.time - priorLaps.reduce((s, r) => s + r.time, 0) / priorLaps.length
      : null
  const trendMature = priorLaps.length >= TREND_WINDOW

  const stintBestDelta = lastLap && stintBest ? lastLap.time - stintBest.time : null

  return {
    currentStint,
    lastLap,
    stintBest,
    trendDelta,
    trendMature,
    priorCount: priorLaps.length,
    stintBestDelta,
  }
}

export interface FuelInputs {
  /** Rolling samples of per-lap consumption (litres), measured at lap boundaries. */
  samples: number[]
  /** Current fuel level (litres). */
  fuelLevel: number
  /** Live SDK `FuelUsePerHour` value (litres/hour). */
  fuelUsePerHour: number
  /** Current lap number. */
  currentLap: number
  /** Most recent completed lap time (seconds).  0 if unknown. */
  lapLastLapTime: number
}

export interface FuelStats {
  /** Estimated per-lap fuel consumption (litres).  0 when no reliable estimate. */
  fuelPerLap: number
  /** Estimated laps remaining on current fuel.  0 when no reliable estimate. */
  lapsOnFuel: number
  /** True when either the rolling samples or live SDK rate produced a useful number. */
  hasReliableEstimate: boolean
  /** Latest lap at which the player should pit, or null when unknown. */
  pitLap: number | null
}

/**
 * Compute fuel statistics for the Pit Strategy overlay.
 *
 * Priority order:
 *   1. Rolling average of measured per-lap fuel (most accurate).
 *   2. Live `fuelUsePerHour × lapTime` (reasonable while actually driving).
 *   3. No estimate — return zeros so the UI can render `--` instead of garbage.
 *
 * Pure function: caller is responsible for maintaining the rolling samples ref.
 */
export function computeFuelStats({
  samples,
  fuelLevel,
  fuelUsePerHour,
  currentLap,
  lapLastLapTime,
}: FuelInputs): FuelStats {
  let fuelPerLap = 0
  let hasReliableEstimate = false

  if (samples.length > 0) {
    fuelPerLap = samples.reduce((a, b) => a + b, 0) / samples.length
    hasReliableEstimate = true
  } else if (fuelUsePerHour > MIN_DRIVING_FUEL_RATE) {
    const lapTime = lapLastLapTime > 0 ? lapLastLapTime : LAP_TIME_ESTIMATE
    fuelPerLap = fuelUsePerHour * (lapTime / 3600)
    hasReliableEstimate = true
  }

  const lapsOnFuel = hasReliableEstimate && fuelPerLap > 0 ? fuelLevel / fuelPerLap : 0
  const pitLap = lapsOnFuel > 0 ? Math.floor(currentLap + lapsOnFuel - 0.5) : null

  return { fuelPerLap, lapsOnFuel, hasReliableEstimate, pitLap }
}
