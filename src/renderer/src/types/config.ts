export type SessionKey = 'practice' | 'qualifying' | 'race'

export interface RelativeSessionConfig {
  enabled: boolean
  carsAbove: number
  carsBelow: number
  showIRating: boolean
  showSafetyRating: boolean
  showPositionChange: boolean
}

export interface RelativeConfig {
  practice: RelativeSessionConfig
  qualifying: RelativeSessionConfig
  race: RelativeSessionConfig
}

export interface GaugesSessionConfig {
  enabled: boolean
  showSpeed: boolean
  showGear: boolean
  showRpm: boolean
  showDelta: boolean
  showFuel: boolean
  showInputs: boolean
  showTcAbs: boolean
  speedUnit: 'mph' | 'kph'
}

export interface GaugesConfig {
  practice: GaugesSessionConfig
  qualifying: GaugesSessionConfig
  race: GaugesSessionConfig
}

export interface PitStrategySessionConfig {
  enabled: boolean
  showFuelCalc: boolean
  showTireDeg: boolean
  lapHistoryCount: number
}

export interface PitStrategyConfig {
  practice: PitStrategySessionConfig
  qualifying: PitStrategySessionConfig
  race: PitStrategySessionConfig
}
