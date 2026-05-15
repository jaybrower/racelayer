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

// ── RPM bar zones ─────────────────────────────────────────────────────────────
//
// The RPM bar's fill colour is driven by which zone the player is currently in,
// not by a smooth gradient across the bar's whole width.  Stepped zones read
// at a glance in peripheral vision — what colour the bar IS right now matters
// more than what colour it's transitioning to.
//
// Color zones below the flash trigger are always derived from rpmPct so the
// rhythm (cyan → green → yellow → red) is consistent regardless of which
// source decides where "shift now" is.  Only the flash trigger differs:
// SDK-driven (per-car accurate) vs percentage-of-redline (heuristic).

export type RpmZone = 'low' | 'mid' | 'high' | 'redline' | 'shiftNow'

/** Static colour-zone breakpoints (fractions of redline).  Independent of the
 *  configurable flash threshold — the threshold only shifts where the FLASH
 *  zone kicks in, not where the colour rhythm changes. */
export const RPM_ZONE_BREAKS = {
  /** ≥ this → green (in the powerband) */
  mid:     0.65,
  /** ≥ this → yellow (approaching shift) */
  high:    0.80,
  /** ≥ this → red, solid (near shift point) */
  redline: 0.90,
}

/**
 * Map current engine state to a discrete RPM-bar zone.
 *
 * @param rpmPct           Current RPM as a fraction of redline (`rpm / playerCarRedLine`), clamped [0,1].
 * @param shiftIndicatorPct iRacing's `ShiftIndicatorPct` (0-1, hits 1.0 at the per-car shift point), or
 *                          `NaN` when the SDK doesn't report it.
 * @param source           `'sdk'` to prefer `shiftIndicatorPct` for the flash trigger (falls back to
 *                          percentage when the SDK value is NaN); `'percent'` to ignore SDK entirely.
 * @param flashThresholdPct Fraction of redline that triggers the flash in `'percent'` mode, and as the
 *                          fallback in `'sdk'` mode.  Expected ∈ [0.5, 1.0].
 *
 * @returns One of `'low' | 'mid' | 'high' | 'redline' | 'shiftNow'`.  The component maps each to a CSS class.
 */
export function rpmZone(
  rpmPct: number,
  shiftIndicatorPct: number,
  source: 'sdk' | 'percent',
  flashThresholdPct: number,
): RpmZone {
  // Flash trigger — evaluated first so the colour zones can't "win" against
  // an active SDK shift signal even when rpmPct happens to be lower (rare in
  // practice, but harmless to defend against).
  const sdkAvailable = Number.isFinite(shiftIndicatorPct)
  const shouldFlash =
    source === 'sdk' && sdkAvailable
      ? shiftIndicatorPct >= 1.0
      : rpmPct >= flashThresholdPct
  if (shouldFlash) return 'shiftNow'

  // Colour rhythm — always derived from rpmPct.
  if (rpmPct >= RPM_ZONE_BREAKS.redline) return 'redline'
  if (rpmPct >= RPM_ZONE_BREAKS.high)    return 'high'
  if (rpmPct >= RPM_ZONE_BREAKS.mid)     return 'mid'
  return 'low'
}
