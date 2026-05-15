import { describe, it, expect } from 'vitest'
import {
  type LapRecord,
  formatLapTime,
  computeStintMetrics,
  computeFuelStats,
  LAP_TIME_ESTIMATE,
  MIN_DRIVING_FUEL_RATE,
} from '../src/renderer/src/overlays/PitStrategy/lib'

// Helper: shorthand to build a lap record.
const lap = (n: number, time: number, pitAffected = false): LapRecord => ({
  lap: n,
  time,
  pitAffected,
})

describe('formatLapTime', () => {
  it('formats a typical lap time as M:SS.mmm', () => {
    expect(formatLapTime(92.456)).toBe('1:32.456')
  })

  it('zero-pads seconds < 10', () => {
    expect(formatLapTime(61.5)).toBe('1:01.500')
  })

  it('renders sub-minute laps with M=0', () => {
    expect(formatLapTime(45.123)).toBe('0:45.123')
  })

  it('shows --:--.--- for non-positive inputs', () => {
    expect(formatLapTime(0)).toBe('--:--.---')
    expect(formatLapTime(-1)).toBe('--:--.---')
  })

  it('handles long lap times (> 1 hour treated as just-minutes)', () => {
    expect(formatLapTime(3725.001)).toBe('62:05.001')
  })
})

describe('computeStintMetrics', () => {
  it('returns all-null for empty history', () => {
    const m = computeStintMetrics([])
    expect(m.currentStint).toEqual([])
    expect(m.lastLap).toBeNull()
    expect(m.stintBest).toBeNull()
    expect(m.trendDelta).toBeNull()
    expect(m.stintBestDelta).toBeNull()
    expect(m.priorCount).toBe(0)
    expect(m.trendMature).toBe(false)
  })

  // ── Stint windowing ─────────────────────────────────────────────────────────
  it('treats the entire history as the stint when no pit-affected laps exist', () => {
    const history = [lap(1, 90), lap(2, 91), lap(3, 92)]
    const m = computeStintMetrics(history)
    expect(m.currentStint).toHaveLength(3)
    expect(m.lastLap?.lap).toBe(3)
  })

  it('starts the stint after the most recent pit-affected lap', () => {
    const history = [
      lap(1, 95, true),  // out-lap
      lap(2, 90),
      lap(3, 91),
      lap(4, 92, true),  // in-lap — stint boundary
      lap(5, 95, true),  // out-lap on new tires
      lap(6, 90),
      lap(7, 89),
    ]
    const m = computeStintMetrics(history)
    expect(m.currentStint.map((l) => l.lap)).toEqual([6, 7])
    expect(m.lastLap?.lap).toBe(7)
    expect(m.stintBest?.lap).toBe(7)
  })

  it('returns an empty stint when the most recent lap is pit-affected', () => {
    const history = [lap(1, 90), lap(2, 91), lap(3, 95, true)]
    const m = computeStintMetrics(history)
    expect(m.currentStint).toEqual([])
    expect(m.lastLap).toBeNull()
  })

  // ── Stint best ──────────────────────────────────────────────────────────────
  it('picks the fastest lap of the current stint', () => {
    const m = computeStintMetrics([lap(1, 92), lap(2, 90.5), lap(3, 91)])
    expect(m.stintBest?.lap).toBe(2)
    expect(m.stintBest?.time).toBe(90.5)
  })

  it('stint best equals last lap on a one-lap stint', () => {
    const m = computeStintMetrics([lap(1, 95, true), lap(2, 92)])
    expect(m.stintBest?.lap).toBe(2)
    expect(m.lastLap?.lap).toBe(2)
    expect(m.stintBestDelta).toBe(0)
  })

  // ── Trend window ────────────────────────────────────────────────────────────
  it('returns null trend on a 1-lap stint (no prior laps)', () => {
    const m = computeStintMetrics([lap(1, 92)])
    expect(m.trendDelta).toBeNull()
    expect(m.priorCount).toBe(0)
    expect(m.trendMature).toBe(false)
  })

  it('uses a 1-sample baseline on a 2-lap stint (not yet mature)', () => {
    const m = computeStintMetrics([lap(1, 90), lap(2, 91)])
    expect(m.trendDelta).toBeCloseTo(1, 6)
    expect(m.priorCount).toBe(1)
    expect(m.trendMature).toBe(false)
  })

  it('uses a 2-sample baseline on a 3-lap stint (still not mature)', () => {
    const m = computeStintMetrics([lap(1, 90), lap(2, 91), lap(3, 92)])
    // avg(90, 91) = 90.5; 92 - 90.5 = 1.5
    expect(m.trendDelta).toBeCloseTo(1.5, 6)
    expect(m.priorCount).toBe(2)
    expect(m.trendMature).toBe(false)
  })

  it('uses a 3-sample baseline on a 4+ lap stint (mature)', () => {
    const m = computeStintMetrics([lap(1, 90), lap(2, 90), lap(3, 90), lap(4, 91)])
    expect(m.trendDelta).toBeCloseTo(1, 6)
    expect(m.priorCount).toBe(3)
    expect(m.trendMature).toBe(true)
  })

  it('caps the trend window at 3 prior laps even on long stints', () => {
    // Laps 1-10, last lap = 95.  Prior 3 = laps 7, 8, 9 (all 90).
    const history = Array.from({ length: 9 }, (_, i) => lap(i + 1, 90))
    history.push(lap(10, 95))
    const m = computeStintMetrics(history)
    expect(m.priorCount).toBe(3)
    expect(m.trendDelta).toBeCloseTo(5, 6)
  })

  // ── Stint-best delta ────────────────────────────────────────────────────────
  it('stint-best delta is always ≥ 0 and equals (lastLap - stintBest)', () => {
    const m = computeStintMetrics([lap(1, 88), lap(2, 91), lap(3, 90)])
    expect(m.stintBestDelta).toBeCloseTo(2, 6)
    expect(m.stintBestDelta!).toBeGreaterThanOrEqual(0)
  })

  it('stint-best delta is 0 when the latest lap is the stint best', () => {
    const m = computeStintMetrics([lap(1, 92), lap(2, 91), lap(3, 90)])
    expect(m.stintBestDelta).toBe(0)
  })
})

describe('computeFuelStats', () => {
  const base = {
    fuelLevel: 30,
    fuelUsePerHour: 0,
    currentLap: 10,
    lapLastLapTime: 90,
  }

  it('uses rolling samples when available (most accurate)', () => {
    const stats = computeFuelStats({ ...base, samples: [2.0, 2.2, 1.8] })
    expect(stats.fuelPerLap).toBeCloseTo(2.0, 6)
    expect(stats.hasReliableEstimate).toBe(true)
    expect(stats.lapsOnFuel).toBeCloseTo(15, 6)
    expect(stats.pitLap).toBe(24) // floor(10 + 15 - 0.5)
  })

  it('falls back to fuelUsePerHour × lapTime when no samples', () => {
    // 7.2 L/hr × (90/3600) = 0.18 L/lap; 30 / 0.18 = 166.66 laps
    const stats = computeFuelStats({ ...base, samples: [], fuelUsePerHour: 7.2 })
    expect(stats.hasReliableEstimate).toBe(true)
    expect(stats.fuelPerLap).toBeCloseTo(0.18, 6)
  })

  it('uses LAP_TIME_ESTIMATE when lapLastLapTime is 0 and rate is high enough', () => {
    const stats = computeFuelStats({
      ...base,
      samples: [],
      fuelUsePerHour: 36, // 36 L/hr × (92/3600) = 0.92 L/lap
      lapLastLapTime: 0,
    })
    expect(stats.fuelPerLap).toBeCloseTo((36 * LAP_TIME_ESTIMATE) / 3600, 6)
    expect(stats.hasReliableEstimate).toBe(true)
  })

  it('returns no estimate when idle (fuelUsePerHour at or below threshold)', () => {
    const stats = computeFuelStats({
      ...base,
      samples: [],
      fuelUsePerHour: MIN_DRIVING_FUEL_RATE, // boundary — not strictly above
    })
    expect(stats.hasReliableEstimate).toBe(false)
    expect(stats.fuelPerLap).toBe(0)
    expect(stats.lapsOnFuel).toBe(0)
    expect(stats.pitLap).toBeNull()
  })

  it('returns 0 / null when fuel level is zero even with samples', () => {
    const stats = computeFuelStats({ ...base, fuelLevel: 0, samples: [2.0] })
    expect(stats.lapsOnFuel).toBe(0)
    expect(stats.pitLap).toBeNull()
  })

  it('rounds pitLap down to the last full lap before running dry', () => {
    // 2 L/lap, 20 L → 10 laps remaining from lap 5 → pit by lap 14 (floor(5 + 10 - 0.5))
    const stats = computeFuelStats({
      samples: [2.0],
      fuelLevel: 20,
      fuelUsePerHour: 0,
      currentLap: 5,
      lapLastLapTime: 90,
    })
    expect(stats.pitLap).toBe(14)
  })
})
