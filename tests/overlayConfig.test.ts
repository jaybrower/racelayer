import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OVERLAY_CONFIG,
  mergeWithDefaults,
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
})
