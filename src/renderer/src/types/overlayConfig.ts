export type SType = 'practice' | 'qualifying' | 'race'
export type SessionFlags = Record<SType, boolean>

export interface GaugesConfig {
  enabled: SessionFlags
  elements: {
    rpmBar:     SessionFlags
    inputTrace: SessionFlags
    gear:       SessionFlags
    speed:      SessionFlags
    delta:      SessionFlags
    fuel:       SessionFlags
  }
}

export interface TireTempsConfig {
  enabled: SessionFlags
}

export interface RadarConfig {
  enabled: SessionFlags
}

export interface OverlayConfig {
  gauges:    GaugesConfig
  tireTemps: TireTempsConfig
  radar:     RadarConfig
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  gauges: {
    enabled: { practice: true, qualifying: true, race: true },
    elements: {
      rpmBar:     { practice: true,  qualifying: true,  race: true  },
      inputTrace: { practice: true,  qualifying: true,  race: false },
      gear:       { practice: true,  qualifying: true,  race: true  },
      speed:      { practice: true,  qualifying: true,  race: true  },
      delta:      { practice: true,  qualifying: true,  race: false },
      fuel:       { practice: true,  qualifying: false, race: true  },
    },
  },
  tireTemps: {
    enabled: { practice: true, qualifying: true, race: true },
  },
  radar: {
    enabled: { practice: false, qualifying: false, race: true },
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

  const storedGauges = (s.gauges ?? {}) as Record<string, unknown>
  const storedEl     = (storedGauges.elements ?? {}) as Record<string, unknown>
  const def          = DEFAULT_OVERLAY_CONFIG

  return {
    gauges: {
      enabled: mergeSF(def.gauges.enabled, storedGauges.enabled),
      elements: {
        rpmBar:     mergeSF(def.gauges.elements.rpmBar,     storedEl.rpmBar),
        inputTrace: mergeSF(def.gauges.elements.inputTrace, storedEl.inputTrace),
        gear:       mergeSF(def.gauges.elements.gear,       storedEl.gear),
        speed:      mergeSF(def.gauges.elements.speed,      storedEl.speed),
        delta:      mergeSF(def.gauges.elements.delta,      storedEl.delta),
        fuel:       mergeSF(def.gauges.elements.fuel,       storedEl.fuel),
      },
    },
    tireTemps: {
      enabled: mergeSF(def.tireTemps.enabled, (s.tireTemps as any)?.enabled),
    },
    radar: {
      enabled: mergeSF(def.radar.enabled, (s.radar as any)?.enabled),
    },
  }
}
