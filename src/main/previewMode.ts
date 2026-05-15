export type PreviewSessionType = 'practice' | 'qualifying' | 'race'

export interface PreviewModeState {
  enabled: boolean
  sessionType: PreviewSessionType
}

let state: PreviewModeState = {
  enabled: false,
  sessionType: 'race',
}

export function getPreviewMode(): PreviewModeState {
  return { ...state }
}

export function setPreviewMode(patch: Partial<PreviewModeState>): void {
  state = { ...state, ...patch }
}
