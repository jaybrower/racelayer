export type DevSessionType = 'practice' | 'qualifying' | 'race'

export interface DevModeState {
  enabled: boolean
  sessionType: DevSessionType
}

let state: DevModeState = {
  enabled: false,
  sessionType: 'race',
}

export function getDevMode(): DevModeState {
  return { ...state }
}

export function setDevMode(patch: Partial<DevModeState>): void {
  state = { ...state, ...patch }
}
