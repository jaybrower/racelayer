export type SessionType = 'practice' | 'qualifying' | 'race' | 'unknown'

/** Tire corner temperatures in °C: [inner, middle, outer] */
export type TireCorner = readonly [number, number, number]

export interface DriverInfo {
  carIdx: number
  userName: string
  iRating: number
  safetyRating: string // e.g. "A 4.32"
  carNumber: string
  carName: string
}

export interface CarTelemetry {
  carIdx: number
  position: number
  lapDistPct: number
  lap: number
  onTrack: boolean
  inPit: boolean
  lastLapTime: number  // seconds, 0 if no lap completed
  bestLapTime: number
  f2Time: number       // seconds relative to player; negative = ahead of player
  startPosition: number
}

export interface IRacingTelemetry {
  connected: boolean
  sessionType: SessionType
  sessionTime: number
  sessionTimeRemain: number

  playerCarIdx: number
  playerCarRedLine: number  // RPM at rev limiter
  speed: number         // m/s
  gear: number          // -1=R, 0=N, 1–8
  rpm: number
  throttle: number      // 0–1
  brake: number         // 0–1
  fuelLevel: number     // liters
  fuelUsePerHour: number
  lap: number
  lapCurrentLapTime: number
  lapLastLapTime: number
  lapBestLapTime: number
  lapDeltaToBestLap: number // negative = currently ahead of best pace
  lapDistPct: number

  // Tire temperatures °C — [inner, middle, outer] for each corner
  tireLF: TireCorner
  tireRF: TireCorner
  tireLR: TireCorner
  tireRR: TireCorner

  /** irsdk_CarLeftRight: 0=clear 1=left 2=right 3=both 4=2left 5=2right 6=2both */
  carLeftRight: number

  cars: CarTelemetry[]
  drivers: DriverInfo[]
}

export const EMPTY_TELEMETRY: IRacingTelemetry = {
  connected: false,
  sessionType: 'unknown',
  sessionTime: 0,
  sessionTimeRemain: 0,
  playerCarIdx: 0,
  playerCarRedLine: 0,
  speed: 0,
  gear: 0,
  rpm: 0,
  throttle: 0,
  brake: 0,
  fuelLevel: 0,
  fuelUsePerHour: 0,
  lap: 0,
  lapCurrentLapTime: 0,
  lapLastLapTime: 0,
  lapBestLapTime: 0,
  lapDeltaToBestLap: NaN,
  lapDistPct: 0,
  tireLF: [0, 0, 0],
  tireRF: [0, 0, 0],
  tireLR: [0, 0, 0],
  tireRR: [0, 0, 0],
  carLeftRight: 0,
  cars: [],
  drivers: [],
}
