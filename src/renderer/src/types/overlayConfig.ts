export type SType = 'practice' | 'qualifying' | 'race'
export type SessionFlags = Record<SType, boolean>

export interface GlobalConfig {
  /**
   * When true, overlays and elements that require car-specific telemetry
   * (e.g. surface tire temps, TC, ABS) are automatically hidden when the
   * current car doesn't expose those variables. Set to false to always show
   * them regardless of support.
   */
  hideUnsupportedElements: boolean
}

export interface GaugesConfig {
  enabled: SessionFlags
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
  },
  gauges: {
    enabled: { practice: true, qualifying: true, race: true },
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
  const storedRel      = (s.relative    ?? {}) as Record<string, unknown>
  const storedRelCols  = (storedRel.columns    ?? {}) as Record<string, unknown>
  const storedPit      = (s.pitStrategy ?? {}) as Record<string, unknown>
  const storedPitSecs  = (storedPit.sections   ?? {}) as Record<string, unknown>
  const def            = DEFAULT_OVERLAY_CONFIG

  return {
    global: {
      hideUnsupportedElements:
        (storedGlobal.hideUnsupportedElements as boolean | undefined) ??
        def.global.hideUnsupportedElements,
    },
    gauges: {
      enabled: mergeSF(def.gauges.enabled, storedGauges.enabled),
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
