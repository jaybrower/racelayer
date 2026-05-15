// Gauges overlay — pure logic.
// Pulled out of `index.tsx` so the formatters and unit conversions can be
// unit-tested without bringing React or the telemetry context along.

/** Multiplier to convert m/s → mph (matches the SDK speed channel). */
export const MPH = 2.23694

/** Fallback redline RPM when the SDK hasn't reported one yet. */
export const FALLBACK_REDLINE = 8000

/** Rough lap-time guess used by `formatFuel`'s laps-remaining estimate when
 *  we have no measured per-lap data — exposed for tests. */
export const FUEL_LAP_TIME_GUESS = 92

export const GEAR_LABEL: Record<number, string> = {
  [-1]: 'R',
  [0]: 'N',
}

/** Format a gear index as the display label.  Reverse → "R", neutral → "N",
 *  positive gears → their number as a string. */
export function gearLabel(gear: number): string {
  return GEAR_LABEL[gear] ?? String(gear)
}

/**
 * Format a delta-to-best lap time in seconds.
 * Returns `--` for non-finite inputs (no valid best yet).
 * Zero and negative deltas render with a leading `-`.
 */
export function formatDelta(s: number): string {
  if (!isFinite(s)) return '--'
  const sign = s <= 0 ? '-' : '+'
  return `${sign}${Math.abs(s).toFixed(3)}`
}

/**
 * Estimate laps-remaining from a fuel level + live SDK rate.
 * Returns the level (1 decimal) and laps estimate (1 decimal) as display
 * strings.  Laps estimate is `--` when the SDK rate is zero or negative.
 */
export function formatFuel(
  liters: number,
  perHour: number,
): { level: string; lapsEst: string } {
  const perLap = perHour / (3600 / FUEL_LAP_TIME_GUESS)
  const laps = perLap > 0 ? liters / perLap : 0
  return {
    level: liters.toFixed(1),
    lapsEst: laps > 0 ? laps.toFixed(1) : '--',
  }
}
