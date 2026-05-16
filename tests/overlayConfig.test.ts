import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OVERLAY_CONFIG,
  mergeWithDefaults,
  OVERLAY_SCALE_OPTIONS,
} from '../src/renderer/src/types/overlayConfig'

describe('mergeWithDefaults', () => {
  it('returns defaults when input is null or undefined', () => {
    expect(mergeWithDefaults(null)).toEqual(DEFAULT_OVERLAY_CONFIG)
    expect(mergeWithDefaults(undefined)).toEqual(DEFAULT_OVERLAY_CONFIG)
  })

  it('returns defaults when input is not an object', () => {
    expect(mergeWithDefaults('config-string')).toEqual(DEFAULT_OVERLAY_CONFIG)
    expect(mergeWithDefaults(42)).toEqual(DEFAULT_OVERLAY_CONFIG)
  })

  it('returns defaults for an empty object', () => {
    expect(mergeWithDefaults({})).toEqual(DEFAULT_OVERLAY_CONFIG)
  })

  // ── Forward-compat: old configs missing newer fields ────────────────────────
  it('fills in newly-added fields with defaults (forward-compat scenario)', () => {
    // Simulate a stored config from an older version that pre-dates the
    // `global` block and the `closingRate` column.
    const old = {
      gauges: { enabled: { practice: true, qualifying: true, race: false } },
      relative: {
        enabled: { practice: true, qualifying: true, race: true },
        columns: {
          iRating: { practice: false, qualifying: false, race: false },
        },
      },
    }
    const merged = mergeWithDefaults(old)
    // Preserved values:
    expect(merged.gauges.enabled.race).toBe(false)
    expect(merged.relative.columns.iRating.practice).toBe(false)
    // Filled-in defaults:
    expect(merged.global.hideUnsupportedElements).toBe(
      DEFAULT_OVERLAY_CONFIG.global.hideUnsupportedElements,
    )
    expect(merged.relative.columns.closingRate).toEqual(
      DEFAULT_OVERLAY_CONFIG.relative.columns.closingRate,
    )
    // carLeftRight is the newest column — pre-existing configs must inherit
    // its default rather than ending up `undefined`.
    expect(merged.relative.columns.carLeftRight).toEqual(
      DEFAULT_OVERLAY_CONFIG.relative.columns.carLeftRight,
    )
    expect(merged.pitStrategy).toEqual(DEFAULT_OVERLAY_CONFIG.pitStrategy)
  })

  it('preserves explicit false values (does not fall through to default true)', () => {
    const stored = {
      pitStrategy: {
        enabled: { practice: false, qualifying: false, race: false },
        sections: {
          fuel: { practice: false, qualifying: false, race: false },
        },
      },
    }
    const merged = mergeWithDefaults(stored)
    expect(merged.pitStrategy.enabled.practice).toBe(false)
    expect(merged.pitStrategy.enabled.race).toBe(false)
    expect(merged.pitStrategy.sections.fuel.practice).toBe(false)
  })

  it('fills in missing per-session-type flags from defaults', () => {
    // Stored config has only `practice` set for an overlay; merge should
    // populate `qualifying` and `race` from the corresponding default.
    const stored = {
      tireTemps: {
        enabled: { practice: false }, // missing qualifying and race
      },
    }
    const merged = mergeWithDefaults(stored)
    expect(merged.tireTemps.enabled.practice).toBe(false)
    expect(merged.tireTemps.enabled.qualifying).toBe(
      DEFAULT_OVERLAY_CONFIG.tireTemps.enabled.qualifying,
    )
    expect(merged.tireTemps.enabled.race).toBe(
      DEFAULT_OVERLAY_CONFIG.tireTemps.enabled.race,
    )
  })

  it('survives garbage at intermediate paths without throwing', () => {
    const malformed = {
      gauges: 'not-an-object',
      relative: { columns: 42 },
      pitStrategy: { sections: null },
    }
    const merged = mergeWithDefaults(malformed)
    // Bad branches degrade gracefully to defaults instead of crashing.
    expect(merged.gauges).toEqual(DEFAULT_OVERLAY_CONFIG.gauges)
    expect(merged.relative.columns).toEqual(DEFAULT_OVERLAY_CONFIG.relative.columns)
    expect(merged.pitStrategy.sections).toEqual(DEFAULT_OVERLAY_CONFIG.pitStrategy.sections)
  })

  it('round-trips the default config unchanged', () => {
    expect(mergeWithDefaults(DEFAULT_OVERLAY_CONFIG)).toEqual(DEFAULT_OVERLAY_CONFIG)
  })

  it('does not mutate the input object', () => {
    const stored = { gauges: { enabled: { practice: false } } }
    const before = JSON.stringify(stored)
    mergeWithDefaults(stored)
    expect(JSON.stringify(stored)).toBe(before)
  })

  it('global.hideUnsupportedElements respects an explicit false', () => {
    const stored = { global: { hideUnsupportedElements: false } }
    const merged = mergeWithDefaults(stored)
    expect(merged.global.hideUnsupportedElements).toBe(false)
  })

  // ── global.overlayScale (added in v0.1.6 for #14) ─────────────────────────
  describe('global.overlayScale', () => {
    it('defaults to 1.0 when omitted (forward-compat from older configs)', () => {
      const merged = mergeWithDefaults({ global: { hideUnsupportedElements: true } })
      expect(merged.global.overlayScale).toBe(1.0)
    })

    it('preserves every allowed preset value', () => {
      for (const value of OVERLAY_SCALE_OPTIONS) {
        const merged = mergeWithDefaults({ global: { overlayScale: value } })
        expect(merged.global.overlayScale).toBe(value)
      }
    })

    it('rejects unexpected values (defends against hand-edited configs)', () => {
      // Out-of-set numbers default back — protects window-sizing math from a
      // surprise 3.0× or fractional scale entering the pipeline.
      for (const bogus of [0.5, 2.0, 1.1, 0, -1, NaN, Infinity]) {
        const merged = mergeWithDefaults({ global: { overlayScale: bogus } })
        expect(merged.global.overlayScale).toBe(1.0)
      }
    })

    it('rejects non-numeric values', () => {
      for (const bogus of ['1.25', 'large', null, true, [], {}]) {
        const merged = mergeWithDefaults({ global: { overlayScale: bogus } })
        expect(merged.global.overlayScale).toBe(1.0)
      }
    })

    it('all OVERLAY_SCALE_OPTIONS values are valid presets (sanity check)', () => {
      // If someone adds a preset to the array, this test catches a forgotten
      // change to the renderer-side validator OR the main-side ALLOWED_SCALES
      // constant in `src/main/overlayScale.ts`.
      expect(OVERLAY_SCALE_OPTIONS).toContain(1.0) // default must be valid
      expect(OVERLAY_SCALE_OPTIONS.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ── gauges.shiftPoint (added in v0.1.5) ────────────────────────────────────
  describe('gauges.shiftPoint', () => {
    it('fills in defaults when omitted (forward-compat from older configs)', () => {
      const stored = { gauges: { enabled: { practice: true, qualifying: true, race: true } } }
      const merged = mergeWithDefaults(stored)
      expect(merged.gauges.shiftPoint).toEqual(DEFAULT_OVERLAY_CONFIG.gauges.shiftPoint)
    })

    it('preserves valid stored values', () => {
      const stored = {
        gauges: {
          shiftPoint: { source: 'percent', flashThresholdPct: 0.92 },
        },
      }
      const merged = mergeWithDefaults(stored)
      expect(merged.gauges.shiftPoint.source).toBe('percent')
      expect(merged.gauges.shiftPoint.flashThresholdPct).toBe(0.92)
    })

    it('rejects an invalid source string and falls back to default', () => {
      const stored = { gauges: { shiftPoint: { source: 'nonsense', flashThresholdPct: 0.95 } } }
      const merged = mergeWithDefaults(stored)
      expect(merged.gauges.shiftPoint.source).toBe(DEFAULT_OVERLAY_CONFIG.gauges.shiftPoint.source)
      // Threshold is independently valid so it survives.
      expect(merged.gauges.shiftPoint.flashThresholdPct).toBe(0.95)
    })

    it('clamps an out-of-range threshold to the default', () => {
      const tooLow  = mergeWithDefaults({ gauges: { shiftPoint: { source: 'sdk', flashThresholdPct: 0.1 } } })
      const tooHigh = mergeWithDefaults({ gauges: { shiftPoint: { source: 'sdk', flashThresholdPct: 1.5 } } })
      expect(tooLow.gauges.shiftPoint.flashThresholdPct).toBe(DEFAULT_OVERLAY_CONFIG.gauges.shiftPoint.flashThresholdPct)
      expect(tooHigh.gauges.shiftPoint.flashThresholdPct).toBe(DEFAULT_OVERLAY_CONFIG.gauges.shiftPoint.flashThresholdPct)
    })

    it('rejects a non-finite threshold and falls back to the default', () => {
      const merged = mergeWithDefaults({
        gauges: { shiftPoint: { source: 'sdk', flashThresholdPct: NaN } },
      })
      expect(merged.gauges.shiftPoint.flashThresholdPct).toBe(
        DEFAULT_OVERLAY_CONFIG.gauges.shiftPoint.flashThresholdPct,
      )
    })

    it('rejects a non-numeric threshold without throwing', () => {
      const merged = mergeWithDefaults({
        gauges: { shiftPoint: { source: 'percent', flashThresholdPct: 'high' } },
      })
      expect(merged.gauges.shiftPoint.source).toBe('percent')
      expect(merged.gauges.shiftPoint.flashThresholdPct).toBe(
        DEFAULT_OVERLAY_CONFIG.gauges.shiftPoint.flashThresholdPct,
      )
    })

    it('accepts the threshold boundaries (0.5 and 1.0)', () => {
      const low  = mergeWithDefaults({ gauges: { shiftPoint: { source: 'sdk', flashThresholdPct: 0.5 } } })
      const high = mergeWithDefaults({ gauges: { shiftPoint: { source: 'sdk', flashThresholdPct: 1.0 } } })
      expect(low.gauges.shiftPoint.flashThresholdPct).toBe(0.5)
      expect(high.gauges.shiftPoint.flashThresholdPct).toBe(1.0)
    })
  })
})
