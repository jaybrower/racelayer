import { getDevMode } from './devMode.js'

export type SessionType = 'practice' | 'qualifying' | 'race' | 'unknown'
export type TireCorner = readonly [number, number, number]

export interface CarCapabilities {
  hasSurfaceTireTemps: boolean
  hasTractionControl: boolean
  hasABS: boolean
}

export interface DriverInfo {
  carIdx: number
  userName: string
  iRating: number
  safetyRating: string // e.g. "A 4.32"
  carNumber: string
  carName: string
  isAI: boolean
}

export interface CarTelemetry {
  carIdx: number
  position: number
  lapDistPct: number
  lap: number
  onTrack: boolean
  inPit: boolean
  lastLapTime: number
  bestLapTime: number
  f2Time: number       // seconds relative to player; negative = ahead
  startPosition: number
}

export interface IRacingTelemetry {
  connected: boolean
  /** True only while the driver is in their cockpit and the session is live.
   *  False in the garage, get-in-car screen, replays, spectator mode, or after
   *  the car has been removed from the world. Overlays use this to hide when
   *  the user is in iRacing menus rather than actually driving. */
  isOnTrack: boolean
  sessionType: SessionType
  sessionTime: number
  sessionTimeRemain: number

  playerCarIdx: number
  playerCarRedLine: number  // RPM at rev limiter (from session YAML DriverCarRedLine)
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
  lapDeltaToBestLap: number
  lapDistPct: number

  tireLF: TireCorner
  tireRF: TireCorner
  tireLR: TireCorner
  tireRR: TireCorner
  carLeftRight: number

  /** Traction control — level is the dial setting (0 = off), active = currently intervening */
  tc:  { level: number; active: boolean }
  /** Anti-lock brakes — level is the dial setting (0 = off), active = currently intervening */
  abs: { level: number; active: boolean }

  cars: CarTelemetry[]
  drivers: DriverInfo[]
  capabilities: CarCapabilities
}

export type TelemetryCallback = (telemetry: IRacingTelemetry) => void

let pollingInterval: ReturnType<typeof setInterval> | null = null

export async function startTelemetryPolling(callback: TelemetryCallback): Promise<void> {
  // Always load mock — needed when dev mode is on even if SDK is available
  const { createMockPoller } = await import('./mockTelemetry.js')
  const mocker = createMockPoller()

  // Try real SDK
  const { tryInit, poll, cleanup } = await import('./iracingSdk.js')
  const sdkReady = await tryInit()
  if (sdkReady) {
    process.on('exit', cleanup)
  }

  pollingInterval = setInterval(() => {
    const dev = getDevMode()
    if (dev.enabled || !sdkReady) {
      mocker.setSessionType(dev.sessionType)
      callback(mocker.next())
    } else {
      callback(poll())
    }
  }, 100)
}

export function stopTelemetryPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}
