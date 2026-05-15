import { describe, it, expect } from 'vitest'
import {
  MPH,
  gearLabel,
  formatDelta,
  formatFuel,
  FUEL_LAP_TIME_GUESS,
  rpmZone,
  RPM_ZONE_BREAKS,
} from '../src/renderer/src/overlays/Gauges/lib'

describe('MPH constant', () => {
  it('matches the standard m/s → mph conversion', () => {
    expect(MPH).toBeCloseTo(2.23694, 5)
  })
})

describe('gearLabel', () => {
  it('renders reverse as R', () => {
    expect(gearLabel(-1)).toBe('R')
  })
  it('renders neutral as N', () => {
    expect(gearLabel(0)).toBe('N')
  })
  it('renders forward gears as their number', () => {
    expect(gearLabel(1)).toBe('1')
    expect(gearLabel(6)).toBe('6')
  })
})

describe('formatDelta', () => {
  it('renders positive delta with +', () => {
    expect(formatDelta(0.234)).toBe('+0.234')
  })
  it('renders zero with - (treated as non-positive)', () => {
    expect(formatDelta(0)).toBe('-0.000')
  })
  it('renders negative delta with -', () => {
    expect(formatDelta(-0.567)).toBe('-0.567')
  })
  it('returns -- for non-finite inputs', () => {
    expect(formatDelta(Infinity)).toBe('--')
    expect(formatDelta(-Infinity)).toBe('--')
    expect(formatDelta(NaN)).toBe('--')
  })
  it('always renders 3 decimal places', () => {
    expect(formatDelta(0.1)).toBe('+0.100')
    expect(formatDelta(-1)).toBe('-1.000')
  })
})

describe('formatFuel', () => {
  it('renders the level to 1 decimal', () => {
    expect(formatFuel(42.567, 36).level).toBe('42.6')
  })

  it('renders -- for laps estimate when per-hour is zero', () => {
    expect(formatFuel(30, 0).lapsEst).toBe('--')
  })

  it('renders -- for laps estimate when per-hour is negative', () => {
    expect(formatFuel(30, -5).lapsEst).toBe('--')
  })

  it('computes laps estimate from liters / (perHour × lapTimeGuess/3600)', () => {
    // 36 L/hr, 92s lap guess → 0.92 L/lap; 30 / 0.92 ≈ 32.6
    const perLap = (36 * FUEL_LAP_TIME_GUESS) / 3600
    const laps = 30 / perLap
    expect(formatFuel(30, 36).lapsEst).toBe(laps.toFixed(1))
  })
})

describe('rpmZone', () => {
  // Default config (mirrors DEFAULT_OVERLAY_CONFIG.gauges.shiftPoint).
  const SDK = (rpmPct: number, sip: number, thresh = 0.97) =>
    rpmZone(rpmPct, sip, 'sdk', thresh)
  const PCT = (rpmPct: number, thresh = 0.97) =>
    rpmZone(rpmPct, NaN, 'percent', thresh)

  // ── Colour rhythm (zones below the flash) ────────────────────────────────
  it('returns low below the mid breakpoint', () => {
    expect(PCT(0)).toBe('low')
    expect(PCT(RPM_ZONE_BREAKS.mid - 0.001)).toBe('low')
  })
  it('returns mid between mid and high breakpoints', () => {
    expect(PCT(RPM_ZONE_BREAKS.mid)).toBe('mid')
    expect(PCT(RPM_ZONE_BREAKS.high - 0.001)).toBe('mid')
  })
  it('returns high between high and redline breakpoints', () => {
    expect(PCT(RPM_ZONE_BREAKS.high)).toBe('high')
    expect(PCT(RPM_ZONE_BREAKS.redline - 0.001)).toBe('high')
  })
  it('returns redline between redline breakpoint and flash threshold', () => {
    expect(PCT(RPM_ZONE_BREAKS.redline)).toBe('redline')
    expect(PCT(0.969)).toBe('redline') // just under the default 0.97 threshold
  })

  // ── Flash trigger ───────────────────────────────────────────────────────────
  describe('source: percent', () => {
    it('triggers shiftNow at exactly the configured threshold', () => {
      expect(PCT(0.97)).toBe('shiftNow')
      expect(PCT(1.00)).toBe('shiftNow')
    })

    it('respects a custom threshold', () => {
      expect(PCT(0.92, 0.93)).toBe('redline')
      expect(PCT(0.93, 0.93)).toBe('shiftNow')
    })

    it('ignores SDK shift-indicator entirely', () => {
      // sip claims shift-now, but source is percent and rpmPct is below thresh.
      expect(rpmZone(0.80, 1.0, 'percent', 0.97)).toBe('high')
    })
  })

  describe('source: sdk', () => {
    it('triggers shiftNow when shiftIndicatorPct hits 1.0', () => {
      expect(SDK(0.85, 1.0)).toBe('shiftNow')
    })

    it('does not trigger shiftNow below 1.0 even at high rpmPct', () => {
      // SDK says "not yet" — trust it even when rpmPct is above the
      // percentage fallback threshold.  Per-car shift points vary widely.
      expect(SDK(0.98, 0.50)).toBe('redline')
    })

    it('falls back to percentage threshold when SDK value is NaN', () => {
      expect(SDK(0.97, NaN)).toBe('shiftNow')
      expect(SDK(0.96, NaN)).toBe('redline')
    })

    it('falls back to percentage threshold when SDK is NaN — colour rhythm intact', () => {
      expect(SDK(0.40, NaN)).toBe('low')
      expect(SDK(0.70, NaN)).toBe('mid')
      expect(SDK(0.85, NaN)).toBe('high')
    })
  })

  // ── Defensive ──────────────────────────────────────────────────────────────
  it('clamps gracefully at the boundaries', () => {
    expect(PCT(0)).toBe('low')
    expect(PCT(1)).toBe('shiftNow')
  })
})
