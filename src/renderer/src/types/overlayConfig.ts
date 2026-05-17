export type SType = 'practice' | 'qualifying' | 'race'
export type SessionFlags = Record<SType, boolean>

/** Allowed values for the global overlay-scale picker (issue #14).  Fixed
 *  presets — no continuous slider — so the UI is a clean radio group and
 *  the test surface stays small.  Add more values here + in the picker JSX
 *  if user demand justifies it later. */
export const OVERLAY_SCALE_OPTIONS = [0.75, 1.0, 1.25, 1.5] as const
export type OverlayScale = (typeof OVERLAY_SCALE_OPTIONS)[number]

export interface GlobalConfig {
  /**
   * When true, overlays and elements that require car-specific telemetry
   * (e.g. surface tire temps, TC, ABS) are automatically hidden when the
   * current car doesn't expose those variables. Set to false to always show
   * them regardless of support.
   */
  hideUnsupportedElements: boolean

  /**
   * Global overlay scale factor.  Applied via `webContents.setZoomFactor`
   * on every overlay window AND by multiplying each window's persisted
   * bounds, so content doesn't overflow / leave dead space at non-1.0
   * scales.  Restricted to a small set of presets (`OVERLAY_SCALE_OPTIONS`)
   * so the picker can stay a 4-button radio group.
   *
   * Default is 1.0 — every overlay sized + zoomed exactly as the per-
   * overlay defaults specify.
   */
  overlayScale: OverlayScale
}

/** Source for the RPM-bar "shift now" flash trigger. */
export type ShiftPointSource = 'sdk' | 'percent'

export interface ShiftPointConfig {
  /** `'sdk'` (default) — use iRacing's `ShiftIndicatorPct` field when available,
   *  fall back to `flashThresholdPct` when the SDK doesn't expose it (older
   *  builds, some cars).
   *  `'percent'` — ignore the SDK shift-light data and always trigger the
   *  flash from `flashThresholdPct` × `playerCarRedLine`. */
  source: ShiftPointSource
  /** Fraction of redline (0-1) that triggers the flash zone — used directly
   *  in `'percent'` mode, and as the SDK fallback in `'sdk'` mode. */
  flashThresholdPct: number
}

export interface GaugesConfig {
  enabled: SessionFlags
  /** RPM bar: where the flash zone kicks in.  Color zones below the flash
   *  threshold are always derived from rpmPct so the colour rhythm stays
   *  consistent regardless of source — only the flash trigger changes. */
  shiftPoint: ShiftPointConfig
  elements: {
    rpmBar:     SessionFlags
    inputTrace: SessionFlags
    gear:       SessionFlags
    speed:      SessionFlags
    delta:      SessionFlags
    fuel:       SessionFlags
    /** Traction control dial + active indicator — auto-hidden when car has no TC */
    tc:         SessionFlags
    /** ABS dial + active indicator — auto-hidden when car has no ABS */
    abs:        SessionFlags
  }
}

export interface TireTempsConfig {
  enabled: SessionFlags
}

export interface RadarConfig {
  enabled: SessionFlags
}

export interface RelativeConfig {
  enabled: SessionFlags
  columns: {
    /** Driver's current iRating */
    iRating:       SessionFlags
    /** Driver's safety rating string (e.g. "A 4.32") */
    safetyRating:  SessionFlags
    /** Position gained / lost vs. starting grid (race only useful) */
    positionDelta: SessionFlags
    /**
     * Estimated iRating change based on current race positions.
     * Calculated via Elo-style expected-finish formula; only meaningful in
     * official race sessions — label shows "(est.)" to set expectations.
     * Will show 0 / N/A in AI, league, or non-official races where iR is
     * unaffected.
     */
    irChange:      SessionFlags
    /**
     * Rate at which each car is closing on / separating from the player,
     * expressed in seconds-per-lap. Positive = closing, negative = pulling away.
     * Computed from an 8-second rolling window of gap history; cells stay blank
     * until enough samples are collected or when the rate is below the
     * statistical-noise threshold.
     */
    closingRate:   SessionFlags
    /**
     * Proximity side indicator on the player row, driven by the irsdk
     * `CarLeftRight` field. Renders left/right/both chevrons flanking the
     * player's car number to signal cars alongside in tight pack racing.
     */
    carLeftRight:  SessionFlags
  }
}

export interface PitStrategyConfig {
  enabled: SessionFlags
  sections: {
    fuel:      SessionFlags
    tireDeg:   SessionFlags
    pitWindow: SessionFlags
  }
}

export interface OverlayConfig {
  global:      GlobalConfig
  gauges:      GaugesConfig
  tireTemps:   TireTempsConfig
  radar:       RadarConfig
  relative:    RelativeConfig
  pitStrategy: PitStrategyConfig
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  global: {
    hideUnsupportedElements: true,
    overlayScale: 1.0,
  },
  gauges: {
    enabled: { practice: true, qualifying: true, race: true },
    shiftPoint: {
      source: 'sdk',
      flashThresholdPct: 0.97,
    },
    elements: {
      rpmBar:     { practice: true,  qualifying: true,  race: true  },
      inputTrace: { practice: true,  qualifying: true,  race: false },
      gear:       { practice: true,  qualifying: true,  race: true  },
      speed:      { practice: true,  qualifying: true,  race: true  },
      delta:      { practice: true,  qualifying: true,  race: false },
      fuel:       { practice: true,  qualifying: false, race: true  },
      tc:         { practice: true,  qualifying: true,  race: true  },
      abs:        { practice: true,  qualifying: true,  race: true  },
    },
  },
  tireTemps: {
    enabled: { practice: true, qualifying: true, race: true },
  },
  radar: {
    enabled: { practice: false, qualifying: false, race: true },
  },
  relative: {
    enabled: { practice: true, qualifying: true, race: true },
    columns: {
      iRating:       { practice: true,  qualifying: true,  race: false },
      safetyRating:  { practice: true,  qualifying: false, race: true  },
      positionDelta: { practice: false, qualifying: false, race: true  },
      irChange:      { practice: false, qualifying: false, race: true  },
      closingRate:   { practice: true,  qualifying: false, race: true  },
      carLeftRight:  { practice: false, qualifying: false, race: true  },
    },
  },
  pitStrategy: {
    enabled: { practice: true, qualifying: false, race: true },
    sections: {
      fuel:      { practice: true,  qualifying: false, race: true  },
      tireDeg:   { practice: true,  qualifying: false, race: true  },
      pitWindow: { practice: false, qualifying: false, race: true  },
    },
  },
}

/** Deep-merge stored config on top of defaults so new fields get their default values. */
export function mergeWithDefaults(stored: unknown): OverlayConfig {
  if (!stored || typeof stored !== 'object') return DEFAULT_OVERLAY_CONFIG
  const s = stored as Record<string, unknown>

  function mergeSF(def: SessionFlags, val: unknown): SessionFlags {
    if (!val || typeof val !== 'object') return { ...def }
    const v = val as Partial<SessionFlags>
    return {
      practice:   v.practice  ?? def.practice,
      qualifying: v.qualifying ?? def.qualifying,
      race:       v.race      ?? def.race,
    }
  }

  const storedGlobal   = (s.global      ?? {}) as Record<string, unknown>
  const storedGauges   = (s.gauges      ?? {}) as Record<string, unknown>
  const storedEl       = (storedGauges.elements ?? {}) as Record<string, unknown>
  const storedShift    = (storedGauges.shiftPoint ?? {}) as Record<string, unknown>
  const storedRel      = (s.relative    ?? {}) as Record<string, unknown>
  const storedRelCols  = (storedRel.columns    ?? {}) as Record<string, unknown>
  const storedPit      = (s.pitStrategy ?? {}) as Record<string, unknown>
  const storedPitSecs  = (storedPit.sections   ?? {}) as Record<string, unknown>
  const def            = DEFAULT_OVERLAY_CONFIG

  // Validate the stored overlay scale against the allowed presets — a hand-
  // edited config can't poison the union type, and any unexpected value
  // (older / future schema, corrupted file) silently falls back to the 1.0
  // default rather than breaking window-sizing math downstream.
  const storedScale = storedGlobal.overlayScale
  const validScale: OverlayScale =
    (OVERLAY_SCALE_OPTIONS as readonly number[]).includes(storedScale as number)
      ? (storedScale as OverlayScale)
      : def.global.overlayScale

  return {
    global: {
      hideUnsupportedElements:
        (storedGlobal.hideUnsupportedElements as boolean | undefined) ??
        def.global.hideUnsupportedElements,
      overlayScale: validScale,
    },
    gauges: {
      enabled: mergeSF(def.gauges.enabled, storedGauges.enabled),
      shiftPoint: {
        // Validate `source` so a hand-edited config can't poison the union type.
        source:
          storedShift.source === 'percent' || storedShift.source === 'sdk'
            ? storedShift.source
            : def.gauges.shiftPoint.source,
        // Clamp threshold to [0.5, 1.0] — below 0.5 the bar would flash from
        // ~6500 RPM on a Porsche Cup which is useless; above 1.0 means past
        // redline which the SDK should already be handling.
        flashThresholdPct:
          typeof storedShift.flashThresholdPct === 'number' &&
          isFinite(storedShift.flashThresholdPct) &&
          storedShift.flashThresholdPct >= 0.5 &&
          storedShift.flashThresholdPct <= 1.0
            ? storedShift.flashThresholdPct
            : def.gauges.shiftPoint.flashThresholdPct,
      },
      elements: {
        rpmBar:     mergeSF(def.gauges.elements.rpmBar,     storedEl.rpmBar),
        inputTrace: mergeSF(def.gauges.elements.inputTrace, storedEl.inputTrace),
        gear:       mergeSF(def.gauges.elements.gear,       storedEl.gear),
        speed:      mergeSF(def.gauges.elements.speed,      storedEl.speed),
        delta:      mergeSF(def.gauges.elements.delta,      storedEl.delta),
        fuel:       mergeSF(def.gauges.elements.fuel,       storedEl.fuel),
        tc:         mergeSF(def.gauges.elements.tc,         storedEl.tc),
        abs:        mergeSF(def.gauges.elements.abs,        storedEl.abs),
      },
    },
    tireTemps: {
      enabled: mergeSF(def.tireTemps.enabled, (s.tireTemps as any)?.enabled),
    },
    radar: {
      enabled: mergeSF(def.radar.enabled, (s.radar as any)?.enabled),
    },
    relative: {
      enabled: mergeSF(def.relative.enabled, storedRel.enabled),
      columns: {
        iRating:       mergeSF(def.relative.columns.iRating,       storedRelCols.iRating),
        safetyRating:  mergeSF(def.relative.columns.safetyRating,  storedRelCols.safetyRating),
        positionDelta: mergeSF(def.relative.columns.positionDelta, storedRelCols.positionDelta),
        irChange:      mergeSF(def.relative.columns.irChange,      storedRelCols.irChange),
        closingRate:   mergeSF(def.relative.columns.closingRate,   storedRelCols.closingRate),
        carLeftRight:  mergeSF(def.relative.columns.carLeftRight,  storedRelCols.carLeftRight),
      },
    },
    pitStrategy: {
      enabled: mergeSF(def.pitStrategy.enabled, storedPit.enabled),
      sections: {
        fuel:      mergeSF(def.pitStrategy.sections.fuel,      storedPitSecs.fuel),
        tireDeg:   mergeSF(def.pitStrategy.sections.tireDeg,   storedPitSecs.tireDeg),
        pitWindow: mergeSF(def.pitStrategy.sections.pitWindow, storedPitSecs.pitWindow),
      },
    },
  }
}
