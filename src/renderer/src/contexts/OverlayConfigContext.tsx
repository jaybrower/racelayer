import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  DEFAULT_OVERLAY_CONFIG,
  mergeWithDefaults,
  type OverlayConfig,
  type SType,
  type SessionFlags,
} from '../types/overlayConfig'

// Re-export for convenience
export type { OverlayConfig, SType, SessionFlags }

interface OverlayConfigCtx {
  config: OverlayConfig
  update: (next: OverlayConfig) => void
}

const OverlayConfigContext = createContext<OverlayConfigCtx>({
  config: DEFAULT_OVERLAY_CONFIG,
  update: () => {},
})

export function OverlayConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_OVERLAY_CONFIG)

  useEffect(() => {
    window.iracingOverlay.getConfig('overlayConfig').then((raw) => {
      setConfig(mergeWithDefaults(raw))
    })

    // Keep in sync when another window (e.g. Settings) saves a config change
    window.iracingOverlay.onConfigChanged((data) => {
      if (data.overlay === 'overlayConfig') {
        setConfig(mergeWithDefaults(data.config))
      }
    })
    return () => window.iracingOverlay.removeAllListeners('config:changed')
  }, [])

  function update(next: OverlayConfig) {
    setConfig(next)
    window.iracingOverlay.setConfig('overlayConfig', next)
  }

  return (
    <OverlayConfigContext.Provider value={{ config, update }}>
      {children}
    </OverlayConfigContext.Provider>
  )
}

export function useOverlayConfig() {
  return useContext(OverlayConfigContext)
}
