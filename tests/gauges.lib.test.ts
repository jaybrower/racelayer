import { describe, it, expect } from 'vitest'
import {
  MPH,
  gearLabel,
  formatDelta,
  formatFuel,
  FUEL_LAP_TIME_GUESS,
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
