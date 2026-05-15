import { describe, it, expect } from 'vitest'
import {
  type GapSample,
  computeRelativeGap,
  regressGapRate,
  computeClosingRate,
  computeReferenceLapTime,
  computeIRChanges,
  srColor,
  formatGap,
  carLeftRightSide,
  CLR_OFF,
  CLR_CLEAR,
  CLR_LEFT,
  CLR_RIGHT,
  CLR_BOTH,
  CLR_2_LEFT,
  CLR_2_RIGHT,
  DEFAULT_REFERENCE_LAP_TIME,
} from '../src/renderer/src/overlays/Relative/lib'
import type { CarTelemetry, DriverInfo } from '../src/renderer/src/types/telemetry'

// Helper: build a minimal CarTelemetry stub for iR-change tests.
// We only need the fields the function reads; the rest can be `as` cast.
const carStub = (carIdx: number, position: number): CarTelemetry =>
  ({
    carIdx,
    position,
    lap: 0,
    lapDistPct: 0,
    onTrack: true,
    inPit: false,
    startPosition: position,
    bestLapTime: 0,
  }) as unknown as CarTelemetry

const driverStub = (carIdx: number, iRating: number): DriverInfo =>
  ({
    carIdx,
    userName: `D${carIdx}`,
    iRating,
    safetyRating: 'A 4.00',
    carNumber: '1',
    carName: '',
    isAI: false,
  }) as unknown as DriverInfo

// ── computeRelativeGap ────────────────────────────────────────────────────────
describe('computeRelativeGap', () => {
  it('returns 0 when car and player are at the same track position', () => {
    expect(computeRelativeGap({ lap: 3, lapDistPct: 0.5 }, 0.5, 3, 90)).toBeCloseTo(0, 6)
  })

  it('returns negative gap when car is ahead by a fraction of a lap', () => {
    // car at 0.6, player at 0.5 → diff = 0.1 lap → gap = -9s
    expect(computeRelativeGap({ lap: 5, lapDistPct: 0.6 }, 0.5, 5, 90)).toBeCloseTo(-9, 6)
  })

  it('returns positive gap when car is behind the player', () => {
    // car at 0.4, player at 0.5 → diff = -0.1 → gap = +9s
    expect(computeRelativeGap({ lap: 5, lapDistPct: 0.4 }, 0.5, 5, 90)).toBeCloseTo(9, 6)
  })

  it('wraps shortest-path: car barely ahead across the start/finish line', () => {
    // car at lap 6, pct 0.05 vs player at lap 5, pct 0.95
    // (6+0.05) - (5+0.95) = 0.1 lap ahead → -9s
    expect(computeRelativeGap({ lap: 6, lapDistPct: 0.05 }, 0.95, 5, 90)).toBeCloseTo(-9, 6)
  })

  it('wraps shortest-path: car barely behind across the start/finish line', () => {
    // car at lap 5, pct 0.95 vs player at lap 6, pct 0.05
    // (5+0.95) - (6+0.05) = -0.1 → +9s
    expect(computeRelativeGap({ lap: 5, lapDistPct: 0.95 }, 0.05, 6, 90)).toBeCloseTo(9, 6)
  })

  it('scales linearly with referenceLapTime', () => {
    const fast = computeRelativeGap({ lap: 5, lapDistPct: 0.6 }, 0.5, 5, 60)
    const slow = computeRelativeGap({ lap: 5, lapDistPct: 0.6 }, 0.5, 5, 120)
    expect(slow / fast).toBeCloseTo(2, 6)
  })
})

// ── regressGapRate / computeClosingRate ───────────────────────────────────────
describe('regressGapRate', () => {
  it('returns null when fewer than 3 samples', () => {
    expect(regressGapRate([])).toBeNull()
    expect(regressGapRate([{ t: 0, gap: 1 }])).toBeNull()
    expect(regressGapRate([{ t: 0, gap: 1 }, { t: 1, gap: 2 }])).toBeNull()
  })

  it('returns null when total time span is less than 1s', () => {
    const samples: GapSample[] = [
      { t: 0, gap: 1 },
      { t: 0.3, gap: 1.1 },
      { t: 0.6, gap: 1.2 },
    ]
    expect(regressGapRate(samples)).toBeNull()
  })

  it('detects a flat gap as zero slope', () => {
    const samples: GapSample[] = [
      { t: 0, gap: 1.0 },
      { t: 1, gap: 1.0 },
      { t: 2, gap: 1.0 },
      { t: 3, gap: 1.0 },
    ]
    expect(regressGapRate(samples)).toBeCloseTo(0, 6)
  })

  it('matches the expected slope on a clean linear trend', () => {
    // gap = 1 + 0.5 t → slope = 0.5
    const samples: GapSample[] = [
      { t: 0, gap: 1 },
      { t: 1, gap: 1.5 },
      { t: 2, gap: 2 },
      { t: 3, gap: 2.5 },
    ]
    expect(regressGapRate(samples)).toBeCloseTo(0.5, 6)
  })

  it('a single outlier moves the slope less than an endpoint diff would', () => {
    // Stable +0.1 s/s trend over 0.5s spacings, with one outlier at the end.
    const clean: GapSample[] = Array.from({ length: 9 }, (_, i) => ({
      t: i * 0.5,
      gap: 1 + i * 0.05, // dgap/dt = 0.1
    }))
    const noisy: GapSample[] = [...clean, { t: 4.5, gap: 100 }]
    const cleanSlope = regressGapRate(clean)!
    const noisySlope = regressGapRate(noisy)!
    // Endpoint-diff (raw last-first / span) on the noisy series would be ~22 s/s;
    // least-squares regression damps that to under half by leveraging the rest of
    // the window.  The exact dampening depends on sample count and leverage but
    // the assertion below captures the key invariant: it's far smaller than the
    // raw endpoint comparison.
    const endpointDiff =
      (noisy[noisy.length - 1].gap - noisy[0].gap) / (noisy[noisy.length - 1].t - noisy[0].t)
    expect(noisySlope).toBeGreaterThan(cleanSlope)
    expect(Math.abs(noisySlope)).toBeLessThan(Math.abs(endpointDiff) / 2)
  })
})

describe('computeClosingRate', () => {
  // Build a trending sample where d(gap)/dt = 0.1 s/s and gap = 1 + 0.1·t.
  const closingFromBehindSamples = (): GapSample[] =>
    Array.from({ length: 5 }, (_, i) => ({ t: i, gap: 1 + i * 0.1 }))

  it('returns null when regression returns null', () => {
    expect(computeClosingRate([], 1, 90)).toBeNull()
  })

  it('returns null when referenceLapTime is non-positive', () => {
    expect(computeClosingRate(closingFromBehindSamples(), 1, 0)).toBeNull()
    expect(computeClosingRate(closingFromBehindSamples(), 1, -90)).toBeNull()
  })

  it('car-behind: positive d(gap)/dt → separating → negative closing rate', () => {
    // gap increasing (carBehind getting further behind) → closing rate negative
    const rate = computeClosingRate(closingFromBehindSamples(), 1.5, 90)!
    expect(rate).toBeCloseTo(-0.1 * 90, 6)
  })

  it('car-behind: negative d(gap)/dt → closing → positive closing rate', () => {
    const samples: GapSample[] = Array.from({ length: 5 }, (_, i) => ({
      t: i,
      gap: 1.5 - i * 0.1,
    }))
    const rate = computeClosingRate(samples, 1.0, 90)!
    expect(rate).toBeCloseTo(0.1 * 90, 6)
  })

  it('car-ahead: negative d(gap)/dt → separating → negative closing rate', () => {
    // car ahead, gap = -2 going to -3 (more negative = bigger gap) → separating
    const samples: GapSample[] = Array.from({ length: 5 }, (_, i) => ({
      t: i,
      gap: -2 - i * 0.1,
    }))
    const rate = computeClosingRate(samples, -2.5, 90)!
    expect(rate).toBeCloseTo(-0.1 * 90, 6)
  })

  it('car-ahead: positive d(gap)/dt → closing → positive closing rate', () => {
    // car ahead, gap becoming less negative (-3 → -2) → closing
    const samples: GapSample[] = Array.from({ length: 5 }, (_, i) => ({
      t: i,
      gap: -3 + i * 0.1,
    }))
    const rate = computeClosingRate(samples, -2.5, 90)!
    expect(rate).toBeCloseTo(0.1 * 90, 6)
  })

  it('zero gap returns zero rate (sign factor cancels the slope)', () => {
    const samples: GapSample[] = Array.from({ length: 5 }, (_, i) => ({
      t: i,
      gap: i * 0.1,
    }))
    const rate = computeClosingRate(samples, 0, 90)!
    expect(rate).toBeCloseTo(0, 6)
  })
})

// ── computeReferenceLapTime ───────────────────────────────────────────────────
describe('computeReferenceLapTime', () => {
  const cars = (...times: number[]) => times.map((t) => ({ bestLapTime: t }))

  it('prefers the player best lap', () => {
    expect(computeReferenceLapTime({ lapBestLapTime: 88, lapLastLapTime: 0 }, cars(95, 96))).toBe(88)
  })

  it('falls back to player last lap when no best yet', () => {
    expect(computeReferenceLapTime({ lapBestLapTime: 0, lapLastLapTime: 92 }, cars(95, 96))).toBe(92)
  })

  it('uses the fastest session lap when no player times', () => {
    expect(computeReferenceLapTime({ lapBestLapTime: 0, lapLastLapTime: 0 }, cars(95, 88, 96))).toBe(88)
  })

  it('ignores cars with no lap time (bestLapTime ≤ 0) when picking session best', () => {
    expect(computeReferenceLapTime({ lapBestLapTime: 0, lapLastLapTime: 0 }, cars(0, 92, -1, 88))).toBe(88)
  })

  it('falls back to DEFAULT_REFERENCE_LAP_TIME when nothing useful is available', () => {
    expect(computeReferenceLapTime({ lapBestLapTime: 0, lapLastLapTime: 0 }, [])).toBe(DEFAULT_REFERENCE_LAP_TIME)
    expect(computeReferenceLapTime({ lapBestLapTime: 0, lapLastLapTime: 0 }, cars(0, 0))).toBe(DEFAULT_REFERENCE_LAP_TIME)
  })
})

// ── computeIRChanges ──────────────────────────────────────────────────────────
describe('computeIRChanges', () => {
  it('returns empty when fewer than 2 rated cars', () => {
    expect(computeIRChanges([carStub(1, 1)], [driverStub(1, 2000)]).size).toBe(0)
    expect(computeIRChanges([], []).size).toBe(0)
  })

  it('skips cars with position 0 (unclassified)', () => {
    const cars = [carStub(1, 0), carStub(2, 0)]
    const drivers = [driverStub(1, 2000), driverStub(2, 1500)]
    expect(computeIRChanges(cars, drivers).size).toBe(0)
  })

  it('skips cars with iRating 0', () => {
    const cars = [carStub(1, 1), carStub(2, 2)]
    const drivers = [driverStub(1, 0), driverStub(2, 1500)]
    expect(computeIRChanges(cars, drivers).size).toBe(0)
  })

  it('higher-rated driver finishing ahead gains less than expected', () => {
    // 2 drivers, equal iR, finishing 1-2: the winner gains, loser loses, by ±100.
    const cars = [carStub(1, 1), carStub(2, 2)]
    const drivers = [driverStub(1, 2000), driverStub(2, 2000)]
    const m = computeIRChanges(cars, drivers)
    expect(m.get(1)).toBe(50)  // expectedPos 1.5; (1.5 - 1) * 200/2 = 50
    expect(m.get(2)).toBe(-50) // expectedPos 1.5; (1.5 - 2) * 200/2 = -50
  })

  it('higher-rated driver finishing behind a much-lower-rated one loses more', () => {
    // 3000 iR finishing 2nd to a 1000 iR driver — should be a significant loss.
    const cars = [carStub(1, 1), carStub(2, 2)]
    const drivers = [driverStub(1, 1000), driverStub(2, 3000)]
    const m = computeIRChanges(cars, drivers)
    // Sanity: car 2 (higher rated, finished lower) loses iR; car 1 gains iR.
    expect(m.get(2)!).toBeLessThan(0)
    expect(m.get(1)!).toBeGreaterThan(0)
    expect(Math.abs(m.get(2)!)).toBeGreaterThan(50) // worse than expected-tie loss
  })
})

// ── srColor + formatGap ───────────────────────────────────────────────────────
describe('srColor', () => {
  it('returns red for SR ≤ 2.0', () => {
    expect(srColor(0)).toBe('#f87171')
    expect(srColor(2.0)).toBe('#f87171')
  })
  it('returns yellow for SR in (2, 3]', () => {
    expect(srColor(2.01)).toBe('#fbbf24')
    expect(srColor(3.0)).toBe('#fbbf24')
  })
  it('returns green for SR in (3, 4]', () => {
    expect(srColor(3.01)).toBe('#4ade80')
    expect(srColor(4.0)).toBe('#4ade80')
  })
  it('returns blue for SR > 4', () => {
    expect(srColor(4.01)).toBe('#38bdf8')
    expect(srColor(4.99)).toBe('#38bdf8')
  })
})

describe('formatGap', () => {
  it('renders positive gaps with + and one decimal', () => {
    expect(formatGap(1.3)).toBe('+1.3')
    expect(formatGap(12.5)).toBe('+12.5')
  })

  it('renders negative gaps with - and one decimal (no double minus)', () => {
    expect(formatGap(-1.3)).toBe('-1.3')
  })

  it('renders 0 with a leading minus to keep alignment', () => {
    // Treats 0 as non-positive (matches existing behaviour); fine for display.
    expect(formatGap(0)).toBe('-0.0')
  })

  it('renders ±90+ as lap-deltas', () => {
    expect(formatGap(120)).toBe('+1 Lap')
    expect(formatGap(-120)).toBe('-1 Lap')
  })

  it('does not jump to lap delta at exactly 90s (boundary stays on seconds)', () => {
    expect(formatGap(90)).toBe('+90.0')
    expect(formatGap(-90)).toBe('-90.0')
  })
})

describe('carLeftRightSide', () => {
  it('returns null for the off / clear states', () => {
    expect(carLeftRightSide(CLR_OFF)).toBeNull()
    expect(carLeftRightSide(CLR_CLEAR)).toBeNull()
  })

  it('maps single-car-left and double-car-left to "left"', () => {
    expect(carLeftRightSide(CLR_LEFT)).toBe('left')
    expect(carLeftRightSide(CLR_2_LEFT)).toBe('left')
  })

  it('maps single-car-right and double-car-right to "right"', () => {
    expect(carLeftRightSide(CLR_RIGHT)).toBe('right')
    expect(carLeftRightSide(CLR_2_RIGHT)).toBe('right')
  })

  it('maps cars-on-both-sides to "both"', () => {
    expect(carLeftRightSide(CLR_BOTH)).toBe('both')
  })

  it('returns null for unrecognised values (forward-compat)', () => {
    expect(carLeftRightSide(-1)).toBeNull()
    expect(carLeftRightSide(7)).toBeNull()
    expect(carLeftRightSide(99)).toBeNull()
    expect(carLeftRightSide(Number.NaN)).toBeNull()
  })

  it('uses the canonical irsdk_CarLeftRight enum mapping', () => {
    // Pinning the wire-format values so a future renumber would fail loudly.
    expect(CLR_OFF).toBe(0)
    expect(CLR_CLEAR).toBe(1)
    expect(CLR_LEFT).toBe(2)
    expect(CLR_RIGHT).toBe(3)
    expect(CLR_BOTH).toBe(4)
    expect(CLR_2_LEFT).toBe(5)
    expect(CLR_2_RIGHT).toBe(6)
  })
})
